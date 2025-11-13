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

  if (postError || !post) {
    notFound();
  }

  let authorProfile: Profile | null = null;
  if (post.user_id) {
    const { data: profile } = await admin
      .from<Profile>('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', post.user_id)
      .maybeSingle();
    if (profile) {
      authorProfile = profile;
    }
  }

  const commentCount = count ?? 0;

  return { post, authorProfile, commentCount };
});

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawId = id;
  const postId = Number(rawId);

  if (!Number.isFinite(postId) || Number.isNaN(postId)) {
    notFound();
  }

  return (
    <Suspense fallback={<PostDetailSkeleton />}>
      <PostDetailPageContent postId={postId} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const rawId = id;
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
  const { post, authorProfile, commentCount } = await loadPostData(postId);

  return <PostDetailClient postId={postId} initialPost={{ post, authorProfile, commentCount }} />;
}
