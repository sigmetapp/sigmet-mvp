'use client';

import { useState } from 'react';

export default function ChatWindow(){
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);

  async function send(){
    if(!text.trim()) return;
    setLog(prev => [...prev, 'me: ' + text]);
    setText('');
    // stub
  }

  return (
    <div className="card grid gap-3">
      <div className="min-h-[160px] bg-black/10 rounded p-2 text-sm">
        {log.map((l,i)=>(<div key={i}>{l}</div>))}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message" />
        <button className="btn" onClick={send}>Send</button>
      </div>
    </div>
  );
}
