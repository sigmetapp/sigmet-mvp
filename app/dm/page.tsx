"use client";

import React, { useMemo } from "react";
import ThreadList from "@/components/dm/ThreadList";
import DMChatWindow from "@/components/dm/ChatWindow";
import { useDirectMessages } from "@/lib/dm/useDirectMessages";

export default function DMPage() {
  // Default to mock data first; flip by setting NEXT_PUBLIC_DM_USE_MOCK=false
  const dm = useDirectMessages({ useMock: process.env.NEXT_PUBLIC_DM_USE_MOCK !== "false" });

  const selected = useMemo(() => dm.threads.find((t) => t.thread.id === dm.selectedThreadId) || null, [dm.threads, dm.selectedThreadId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full bg-white dark:bg-zinc-950">
      <div className="hidden w-80 shrink-0 md:block">
        <ThreadList
          threads={dm.threads}
          selectedThreadId={dm.selectedThreadId}
          onSelect={dm.selectThread}
          onToggleMute={(_, muted) => dm.muteThread(muted)}
          loading={dm.threadsLoading}
        />
      </div>
      <div className="flex min-w-0 flex-1">
        {dm.selectedThreadId ? (
          <DMChatWindow
            userId={dm.userId}
            title={selected?.thread.title || (selected?.thread.is_group ? "Группа" : "Личный чат")}
            messages={dm.messages}
            sending={dm.sending}
            onSend={dm.sendMessage}
            isOtherTyping={dm.isOtherTyping}
            onTyping={dm.setTyping}
            onLoadMore={dm.loadMore}
            hasMore={dm.hasMore}
            onMarkRead={(id) => dm.markRead(id)}
          />
        ) : (
          <div className="m-auto max-w-md text-center text-sm text-zinc-500">Выберите чат слева</div>
        )}
      </div>
    </div>
  );
}
