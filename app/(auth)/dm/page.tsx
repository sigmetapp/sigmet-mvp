import { getServerSession } from '@/lib/auth/getServerSession';
import DmPageClient from '@/components/DmPageClient';

export default async function MessagesPage() {
  const { user } = await getServerSession();
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-white mb-4">Messages</h1>
      <DmPageClient currentUserId={user?.id || ''} />
    </div>
  );
}
