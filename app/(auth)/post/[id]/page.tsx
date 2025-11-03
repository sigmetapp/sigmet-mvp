import { notFound } from 'next/navigation';
import PostDetailClient from './PostDetailClient';
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
  avatar_url: string | null;
};

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const rawId = params.id;
  const postId = Number(rawId);

  if (!Number.isFinite(postId) || Number.isNaN(postId)) {
    notFound();
  }

  const admin = supabaseAdmin();

  const { data: post, error: postError } = await admin
    .from<PostRecord>('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (postError || !post) {
    notFound();
  }

  let authorProfile: Profile | null = null;
  if (post.user_id) {
    const { data: profile } = await admin
      .from<Profile>('profiles')
      .select('username, avatar_url')
      .eq('user_id', post.user_id)
      .maybeSingle();
    if (profile) {
      authorProfile = profile;
    }
  }

  let commentCount = 0;
  try {
    const { count } = await admin
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);
    commentCount = count ?? 0;
  } catch {
    commentCount = 0;
  }

  return <PostDetailClient postId={postId} initialPost={{ post, authorProfile, commentCount }} />;
}
