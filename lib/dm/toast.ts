import React, { useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import Toast, { ToastAction } from '@/components/dm/Toast';

export type ShowToastOptions = {
  avatar?: string | null;
  title: string;
  text?: string | null;
  actions?: ToastAction[];
  durationMs?: number; // auto-dismiss; default 7000ms
};

type InternalToast = ShowToastOptions & { id: string };

let containerEl: HTMLDivElement | null = null;
let root: Root | null = null;
let toasts: InternalToast[] = [];
let isRendering = false;

function ensureContainer() {
  if (typeof window === 'undefined') return null;
  if (containerEl) return containerEl;
  containerEl = document.createElement('div');
  containerEl.id = 'dm-toast-container';
  containerEl.style.position = 'fixed';
  containerEl.style.right = '16px';
  containerEl.style.bottom = '16px';
  containerEl.style.zIndex = '2147483647';
  document.body.appendChild(containerEl);
  root = createRoot(containerEl);
  return containerEl;
}

function render() {
  if (!containerEl || !root) return;
  if (isRendering) return;
  isRendering = true;

  root.render(
    React.createElement(function ToastContainer() {
      useEffect(() => {
        return () => {
          // noop; the root persists for app lifetime
        };
      }, []);

      return (
        <div className="flex w-full flex-col gap-3">
          {toasts.map((t) => (
            <div key={t.id} className="flex justify-end">
              <Toast
                id={t.id}
                avatar={t.avatar}
                title={t.title}
                text={t.text}
                actions={t.actions}
                onClose={(id) => dismissToast(id)}
              />
            </div>
          ))}
        </div>
      );
    })
  );

  // yield to the event loop to avoid re-entrance if showToast is called inside an action
  setTimeout(() => {
    isRendering = false;
  }, 0);
}

function scheduleAutoDismiss(id: string, durationMs: number) {
  if (durationMs <= 0) return;
  setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: string) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    render();
  }
}

export function showToast(opts: ShowToastOptions): string | null {
  if (typeof window === 'undefined') return null;
  ensureContainer();
  if (!containerEl || !root) return null;

  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Bind actions to also dismiss by default after click
  const boundActions: ToastAction[] | undefined = opts.actions?.map((a) => ({
    ...a,
    onClick: async () => {
      try {
        await a.onClick();
      } finally {
        // dismiss after any action
        dismissToast(id);
      }
    },
  }));

  const toast: InternalToast = {
    id,
    avatar: opts.avatar ?? null,
    title: opts.title,
    text: opts.text ?? null,
    actions: boundActions,
    durationMs: opts.durationMs ?? 7000,
  };

  toasts = [...toasts, toast];
  render();
  scheduleAutoDismiss(id, toast.durationMs ?? 7000);
  return id;
}
