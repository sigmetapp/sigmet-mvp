import { getServerSession } from '@/lib/auth/getServerSession';
import DmPageClient from '@/components/DmPageClient';

export default async function MessagesPage() {
  const { user } = await getServerSession();
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Messages</h1>
      </div>
      <DmPageClient currentUserId={user?.id || ''} />
    </div>
  );
}
