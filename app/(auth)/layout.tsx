import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/getServerSession';
import SidebarShell from '@/components/nav/SidebarShell';
import OnlineStatusTracker from '@/components/OnlineStatusTracker';
import DmGlobalNotifications from '@/components/DmGlobalNotifications';

export const metadata: Metadata = {
  title: 'App',
};

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerSession();
  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <OnlineStatusTracker />
      <DmGlobalNotifications />
      <SidebarShell user={user}>{children}</SidebarShell>
    </>
  );
}
