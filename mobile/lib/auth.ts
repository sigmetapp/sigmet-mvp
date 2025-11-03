import { supabase } from './supabaseClient';
import { User, Session } from '@supabase/supabase-js';

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signIn(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return await supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  return await supabase.auth.resetPasswordForEmail(email);
}
