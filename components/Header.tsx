'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Header() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <header style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '16px 24px',
      borderBottom: '1px solid #eee', background: '#fafafa',
      fontFamily: 'system-ui'
    }}>
      <Link href="/" style={{fontWeight:600,fontSize:18}}>Sigmet</Link>
      <nav style={{display:'flex',alignItems:'center',gap:16,fontSize:14}}>
        <Link href="/feed">Feed</Link>
        <Link href="/profile">Profile</Link>
        <Link href="/login">Login</Link>
        {userEmail && (
          <>
            <span style={{opacity:.7}}>{userEmail}</span>
            <button onClick={signOut}
              style={{border:'none',background:'#000',color:'#fff',padding:'6px 12px',borderRadius:6,cursor:'pointer'}}>
              Sign out
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
