import PostCard from '@/components/PostCard';

export default function Dashboard(){
  return (
    <main className="grid gap-4">
      <div className="card">
        <form action="/api/post.create" method="post" className="grid gap-2">
          <textarea name="text" className="input" placeholder="Share something..." />
          <button className="btn w-fit" type="submit">Post</button>
        </form>
      </div>
      <PostCard author="alex" text="First post example" created="now" />
    </main>
  );
}
