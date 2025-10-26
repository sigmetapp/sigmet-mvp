import { supabase } from '@/lib/supabaseClient';

export function UserMenu() {
  return (
    <button
      onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth'; }}
      className="text-white/70 hover:text-white text-sm"
    >
      Sign out
    </button>
  );
}
