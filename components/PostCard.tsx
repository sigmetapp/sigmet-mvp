import PostReactions from './PostReactions';

type Props = { author?: string; text: string; created?: string; postId?: number };
export default function PostCard({ author = 'anon', text, created, postId = 1 }: Props) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--muted)]">{author}</div>
      <div className="mt-2 whitespace-pre-wrap">{text}</div>
      <div className="text-xs text-[var(--muted)] mt-2">{created ?? ''}</div>
      <div className="mt-3 flex gap-2">
        <button className="btn">Like</button>
        <button className="btn">Comment</button>
      </div>
      {/* Example usage of PostReactions */}
      <div className="mt-4">
        <PostReactions 
          postId={postId}
          initialCounts={{
            inspire: 5,
            respect: 3,
            relate: 7,
            support: 2,
            celebrate: 1,
          }}
          onReactionChange={(reaction, counts) => {
            console.log('Reaction changed:', reaction, counts);
          }}
        />
      </div>
    </div>
  );
}
