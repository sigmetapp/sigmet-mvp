'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DebugLevel = 'info' | 'warn' | 'error';

type DebugEntry = {
  id: string;
  timestamp: number;
  level: DebugLevel;
  source: string;
  kind?: string;
  message?: string;
  detail?: Record<string, unknown>;
};

type Props = {
  enabled: boolean;
};

const MAX_LOGS = 200;

function formatTimestamp(value: number): string {
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return '';
  }
}

export default function DmAdminDebugPanel({ enabled }: Props) {
  const [logs, setLogs] = useState<DebugEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unseenErrors, setUnseenErrors] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback(
    (entry: Omit<DebugEntry, 'id'>) => {
      setLogs((prev) => {
        const id =
          globalThis.crypto?.randomUUID?.() ??
          `${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const next = [...prev, { ...entry, id }];
        if (!isOpen && entry.level === 'error') {
          setUnseenErrors((count) => count + 1);
        }
        return next.slice(-MAX_LOGS);
      });
    },
    [isOpen]
  );

  useEffect(() => {
    if (isOpen && unseenErrors > 0) {
      setUnseenErrors(0);
    }
  }, [isOpen, unseenErrors]);

  useEffect(() => {
    if (!enabled) {
      setLogs([]);
      setIsOpen(false);
      setUnseenErrors(0);
      return;
    }

    const handleDebugLog = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>)?.detail ?? {};
      const timestamp =
        typeof detail.timestamp === 'number' && Number.isFinite(detail.timestamp)
          ? detail.timestamp
          : Date.now();
      const levelValue = detail.level;
      const level: DebugLevel =
        levelValue === 'warn' || levelValue === 'error' ? levelValue : 'info';
      appendLog({
        timestamp,
        level,
        source: 'dm:debug-log',
        kind: typeof detail.kind === 'string' ? detail.kind : undefined,
        message:
          typeof detail.message === 'string'
            ? detail.message
            : typeof detail.error === 'string'
              ? detail.error
              : undefined,
        detail: detail as Record<string, unknown>,
      });
    };

    const handleDmError = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>)?.detail ?? {};
      appendLog({
        timestamp: Date.now(),
        level: 'error',
        source: 'dm:error',
        kind: 'dm:error',
        message: typeof detail.message === 'string' ? detail.message : 'DM error',
        detail,
      });
    };

    const handleGlobalError = (event: ErrorEvent) => {
      appendLog({
        timestamp: event.timeStamp || Date.now(),
        level: 'error',
        source: 'window.error',
        kind: 'window.error',
        message: event.message,
        detail: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendLog({
        timestamp: event.timeStamp || Date.now(),
        level: 'error',
        source: 'unhandledrejection',
        kind: 'unhandledrejection',
        message:
          (event.reason && typeof event.reason.message === 'string' && event.reason.message) ||
          (typeof event.reason === 'string' ? event.reason : 'Unhandled rejection'),
        detail: {
          reason:
            typeof event.reason === 'object'
              ? (event.reason as Record<string, unknown>)
              : { value: event.reason },
        },
      });
    };

    window.addEventListener('dm:debug-log', handleDebugLog as EventListener);
    window.addEventListener('dm:error', handleDmError as EventListener);
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('dm:debug-log', handleDebugLog as EventListener);
      window.removeEventListener('dm:error', handleDmError as EventListener);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [appendLog, enabled]);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, isOpen]);

  const levelStyles = useMemo(
    () => ({
      info: 'text-emerald-300',
      warn: 'text-amber-300',
      error: 'text-rose-300',
    }),
    []
  );

  if (!enabled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full bg-black/60 px-4 py-2 text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-black/80"
      >
        Debug
        {unseenErrors > 0 && (
          <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unseenErrors}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="mt-2 w-[360px] max-h-[70vh] overflow-hidden rounded-xl border border-white/15 bg-black/80 text-white shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/70">
            <span>DM Debug Console</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded bg-white/5 px-2 py-0.5 text-white/60 hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="max-h-[62vh] overflow-auto divide-y divide-white/10">
            {logs.length === 0 ? (
              <div className="px-3 py-4 text-white/60">No debug events yet.</div>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className="px-3 py-2 text-[11px] leading-relaxed">
                  <div className="flex items-center justify-between gap-2">
                    <span className={levelStyles[entry.level]}>{entry.level.toUpperCase()}</span>
                    <span className="text-white/50">{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <div className="mt-1 text-white font-medium">
                    {entry.kind ?? entry.source}
                    {entry.message ? ` — ${entry.message}` : ''}
                  </div>
                  {entry.detail && (
                    <div className="mt-1 rounded bg-black/40 p-2 text-[10px] text-white/70">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(entry.detail, null, 2)}
                      </pre>
                      <button
                        type="button"
                        onClick={() => {
                          const payload = JSON.stringify(entry.detail, null, 2);
                          void navigator.clipboard?.writeText(payload);
                        }}
                        className="mt-1 text-emerald-300 hover:text-emerald-200"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
