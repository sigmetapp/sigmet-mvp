type Props = { author?: string; text: string; created?: string };
export default function PostCard({ author = 'anon', text, created }: Props) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--muted)]">{author}</div>
      <div className="mt-2 whitespace-pre-wrap">{text}</div>
      <div className="text-xs text-[var(--muted)] mt-2">{created ?? ''}</div>
      <div className="mt-3 flex gap-2">
        <button className="btn">Like</button>
        <button className="btn">Comment</button>
      </div>
    </div>
  );
}
