'use client';

export default function InviteList(){
  return (
    <div className="card">
      <div className="text-sm text-[var(--muted)]">Your invite codes will appear here.</div>
      <div className="mt-3">
        <button className="btn">Create invite</button>
      </div>
    </div>
  );
}
