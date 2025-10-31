import { getServerSession } from '@/lib/auth/getServerSession';

export default async function MessagesPage() {
  await getServerSession();
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Сообщения</h1>
      </div>
      <div className="text-center py-12 text-white/60">
        <p>Функция личных сообщений временно отключена.</p>
        <p className="text-sm mt-2">Модель будет переделана с нуля.</p>
      </div>
    </div>
  );
}
