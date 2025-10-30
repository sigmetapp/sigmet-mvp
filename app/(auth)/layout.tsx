import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/getServerSession';
import SidebarShell from '@/components/nav/SidebarShell';

export const metadata: Metadata = {
  title: 'App',
};

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerSession();
  if (!user) {
    redirect('/login');
  }

  return <SidebarShell user={user}>{children}</SidebarShell>;
}
