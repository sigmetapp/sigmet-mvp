import { notFound } from 'next/navigation';
import { Suspense, cache } from 'react';
import type { Metadata } from 'next';
import PostDetailClient from './PostDetailClient';
import PostDetailSkeleton from '@/components/PostDetailSkeleton';
import { supabaseAdmin } from '@/lib/supabaseServer';

type PostRecord = {
  id: number;
  user_id: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  category: string | null;
  created_at: string;
  views: number;
  likes_count: number;
};

type Profile = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

// Cache the post data loading function to avoid duplicate requests
const loadPostData = cache(async (postId: number) => {
  try {
    console.log('[PostDetailPage] loadPostData called for postId:', postId);
    const admin = supabaseAdmin();

    // Load post and profile in parallel
    const [postResult, commentCountResult] = await Promise.all([
      admin
        .from<PostRecord>('posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle(),
      admin
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId),
    ]);

    const { data: post, error: postError } = postResult;
    const { count } = commentCountResult;

    console.log('[PostDetailPage] Post query result:', { 
      hasPost: !!post, 
      hasError: !!postError, 
      error: postError?.message,
      commentCount: count 
    });

    if (postError) {
      console.error('[PostDetailPage] Error loading post:', postError);
      notFound();
    }

    if (!post) {
      console.error('[PostDetailPage] Post not found:', postId);
      notFound();
    }

    console.log('[PostDetailPage] Post loaded successfully:', { 
      id: post.id, 
      userId: post.user_id,
      hasBody: !!post.body 
    });

    let authorProfile: Profile | null = null;
    if (post.user_id) {
      const { data: profile, error: profileError } = await admin
        .from<Profile>('profiles')
        .select('username, full_name, avatar_url')
        .eq('user_id', post.user_id)
        .maybeSingle();
      
      if (profileError) {
        console.warn('[PostDetailPage] Error loading profile:', profileError);
        // Continue without profile if error
      } else if (profile) {
        authorProfile = profile;
        console.log('[PostDetailPage] Profile loaded:', { 
          username: profile.username,
          fullName: profile.full_name 
        });
      }
    }

    const commentCount = count ?? 0;
    console.log('[PostDetailPage] Returning data:', { 
      hasPost: !!post, 
      hasProfile: !!authorProfile, 
      commentCount 
    });

    return { post, authorProfile, commentCount };
  } catch (error) {
    console.error('[PostDetailPage] Unexpected error loading post:', error);
    notFound();
  }
});

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  try {
    const rawId = params.id;
    console.log('[PostDetailPage] Loading post with ID:', rawId);
    const postId = Number(rawId);

    if (!Number.isFinite(postId) || Number.isNaN(postId)) {
      console.error('[PostDetailPage] Invalid post ID:', rawId);
      notFound();
    }

    console.log('[PostDetailPage] Post ID is valid:', postId);

    return (
      <Suspense fallback={<PostDetailSkeleton />}>
        <PostDetailPageContent postId={postId} />
      </Suspense>
    );
  } catch (error) {
    console.error('[PostDetailPage] Error in PostDetailPage:', error);
    notFound();
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const rawId = params.id;
  const postId = Number(rawId);

  if (!Number.isFinite(postId) || Number.isNaN(postId)) {
    return {
      title: 'Post not found',
    };
  }

  try {
    const { post, authorProfile } = await loadPostData(postId);
    const username = authorProfile?.username || authorProfile?.full_name || 'User';
    const postPreview = post.body ? (post.body.length > 100 ? post.body.substring(0, 100) + '...' : post.body) : '';

    return {
      title: `Post by ${username}`,
      description: postPreview || `View post by ${username}`,
    };
  } catch {
    return {
      title: 'Post not found',
    };
  }
}

async function PostDetailPageContent({ postId }: { postId: number }) {
  try {
    const { post, authorProfile, commentCount } = await loadPostData(postId);
    return <PostDetailClient postId={postId} initialPost={{ post, authorProfile, commentCount }} />;
  } catch (error) {
    console.error('[PostDetailPage] Error in PostDetailPageContent:', error);
    notFound();
  }
}
