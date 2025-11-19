/**
 * Feed Ranking Algorithm
 * 
 * Calculates a relevance score for posts in the feed based on multiple factors:
 * - Recency (time decay)
 * - Engagement (likes, comments, views)
 * - Author quality (SW score, Trust Flow)
 * - Content quality (media presence, text length)
 */

export interface PostRankingData {
  id: number;
  created_at: string;
  views: number;
  likes_count: number;
  comments_count: number;
  author_sw_score: number;
  author_trust_flow?: number;
  has_media: boolean;
  text_length: number;
  category?: string | null;
}

export interface RankingWeights {
  recency: number;        // Weight for time decay (default: 0.3)
  engagement: number;     // Weight for likes/comments/views (default: 0.3)
  author_quality: number; // Weight for SW score and Trust Flow (default: 0.2)
  content_quality: number; // Weight for media and text length (default: 0.2)
}

const DEFAULT_WEIGHTS: RankingWeights = {
  recency: 0.3,
  engagement: 0.3,
  author_quality: 0.2,
  content_quality: 0.2,
};

/**
 * Calculate recency score using exponential decay
 * Posts from the last hour get full score, then decay exponentially
 */
function calculateRecencyScore(createdAt: string): number {
  const now = Date.now();
  const postTime = new Date(createdAt).getTime();
  const ageHours = (now - postTime) / (1000 * 60 * 60);
  
  // Exponential decay: e^(-ageHours / decayConstant)
  // decayConstant = 24 means half-life of ~16.6 hours
  const decayConstant = 24;
  const score = Math.exp(-ageHours / decayConstant);
  
  // Normalize to 0-1 range (already in that range, but clamp for safety)
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate engagement score based on likes, comments, and views
 */
function calculateEngagementScore(
  likes: number,
  comments: number,
  views: number
): number {
  // Normalize each metric with log scaling to prevent outliers from dominating
  const logLikes = Math.log1p(likes);      // log(1 + likes)
  const logComments = Math.log1p(comments); // log(1 + comments)
  const logViews = Math.log1p(views);      // log(1 + views)
  
  // Weighted combination (comments are more valuable than likes, views least valuable)
  const engagement = (logLikes * 0.4) + (logComments * 0.5) + (logViews * 0.1);
  
  // Normalize using sigmoid-like function to keep in 0-1 range
  // Using tanh for smooth normalization
  return Math.tanh(engagement / 5); // Divide by 5 to adjust sensitivity
}

/**
 * Calculate author quality score based on SW score and Trust Flow
 */
function calculateAuthorQualityScore(
  swScore: number,
  trustFlow?: number
): number {
  // Normalize SW score (assuming typical range 0-1000, but can be higher)
  const normalizedSW = Math.tanh(swScore / 200); // Divide by 200 for normalization
  
  // Normalize Trust Flow (typical range 5-100)
  const normalizedTF = trustFlow 
    ? Math.tanh((trustFlow - 5) / 50) // Shift by 5 and normalize
    : 0.5; // Default if not available
  
  // Combine: SW score is more important (60%), Trust Flow adds credibility (40%)
  return (normalizedSW * 0.6) + (normalizedTF * 0.4);
}

/**
 * Calculate content quality score based on media presence and text length
 */
function calculateContentQualityScore(
  hasMedia: boolean,
  textLength: number
): number {
  let score = 0;
  
  // Media bonus (posts with images/videos are more engaging)
  if (hasMedia) {
    score += 0.4;
  }
  
  // Text length: sweet spot is 50-500 characters
  // Too short (< 50) or too long (> 1000) gets lower score
  if (textLength === 0) {
    // No text at all (media-only) gets medium score
    score += 0.3;
  } else if (textLength >= 50 && textLength <= 500) {
    // Optimal length
    score += 0.6;
  } else if (textLength < 50) {
    // Too short
    score += 0.2;
  } else if (textLength <= 1000) {
    // Long but acceptable
    score += 0.4;
  } else {
    // Very long (might be overwhelming)
    score += 0.2;
  }
  
  return Math.min(1, score);
}

/**
 * Calculate overall ranking score for a post
 */
export function calculatePostScore(
  post: PostRankingData,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  const recencyScore = calculateRecencyScore(post.created_at);
  const engagementScore = calculateEngagementScore(
    post.likes_count,
    post.comments_count,
    post.views
  );
  const authorScore = calculateAuthorQualityScore(
    post.author_sw_score,
    post.author_trust_flow
  );
  const contentScore = calculateContentQualityScore(
    post.has_media,
    post.text_length
  );
  
  // Weighted combination
  const totalScore = 
    (recencyScore * weights.recency) +
    (engagementScore * weights.engagement) +
    (authorScore * weights.author_quality) +
    (contentScore * weights.content_quality);
  
  return totalScore;
}

/**
 * Rank posts by their calculated scores
 */
export function rankPosts(
  posts: PostRankingData[],
  weights?: RankingWeights
): PostRankingData[] {
  // Calculate scores for all posts
  const postsWithScores = posts.map(post => ({
    ...post,
    score: calculatePostScore(post, weights),
  }));
  
  // Sort by score (descending), then by created_at as tiebreaker
  return postsWithScores.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.0001) {
      // Scores are essentially equal, use recency as tiebreaker
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return b.score - a.score;
  });
}
