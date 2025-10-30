"use client";

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import React from 'react';

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace('/login');
    }
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#e5edf7] hover:bg-white/10"
    >
      Sign out
    </button>
  );
}
