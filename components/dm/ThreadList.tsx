"use client";

import React from "react";
import { DMThreadSummary } from "@/lib/dm/useDirectMessages";
import { Bell, BellOff } from "lucide-react";

export type ThreadListProps = {
  threads: DMThreadSummary[];
  selectedThreadId: number | null;
  onSelect: (threadId: number) => void;
  onToggleMute?: (threadId: number, muted: boolean) => void;
  loading?: boolean;
};

function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export default function ThreadList({ threads, selectedThreadId, onSelect, onToggleMute, loading }: ThreadListProps) {
  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-3">
        <input
          placeholder="Поиск"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="p-3 text-sm text-zinc-500">Загрузка…</div>
        ) : threads.length === 0 ? (
          <div className="p-3 text-sm text-zinc-500">Нет диалогов</div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {threads.map((item) => {
              const t = item.thread;
              const muted = Boolean(item.participant.notifications_muted);
              const selected = selectedThreadId === t.id;
              const title = t.title || (t.is_group ? "Группа" : "Личный чат");
              const lastText = t.last_message?.body || "";
              return (
                <li key={t.id} className="group relative">
                  <button
                    onClick={() => onSelect(t.id)}
                    className={classNames(
                      "flex w-full items-center gap-3 px-3 py-2 text-left",
                      selected ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</div>
                        {item.unread_count > 0 ? (
                          <span className="ml-auto inline-flex items-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                            {item.unread_count}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{lastText}</div>
                    </div>
                    <div className="shrink-0">
                      <button
                        aria-label={muted ? "Unmute" : "Mute"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMute?.(t.id, !muted);
                        }}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      </button>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
