'use client';

import { useState } from 'react';

export default function ProfileForm() {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');

  async function save() {
    const res = await fetch('/api/profile.save', { method: 'POST', body: JSON.stringify({ username, bio, country }) });
    const data = await res.json();
    alert(data.error ? data.error : 'Saved');
  }

  return (
    <div className="card grid gap-3">
      <div className="grid gap-1">
        <label className="text-sm">Username</label>
        <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourname" />
      </div>
      <div className="grid gap-1">
        <label className="text-sm">Bio</label>
        <textarea className="input" rows={3} value={bio} onChange={e=>setBio(e.target.value)} placeholder="short bio" />
      </div>
      <div className="grid gap-1">
        <label className="text-sm">Country</label>
        <input className="input" value={country} onChange={e=>setCountry(e.target.value)} placeholder="UA, DE, RO ..." />
      </div>
      <button className="btn w-fit" onClick={save}>Save</button>
    </div>
  );
}
