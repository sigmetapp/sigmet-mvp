"use client";

import { X } from "lucide-react";
import Image from "next/image";
import React from "react";

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
  primary?: boolean;
};

export type ToastProps = {
  id: string;
  avatar?: string | null;
  title: string;
  text?: string | null;
  actions?: ToastAction[];
  onClose?: (id: string) => void;
};

export default function Toast({ id, avatar, title, text, actions, onClose }: ToastProps) {
  return (
    <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/10">
      <div className="p-4">
        <div className="flex items-start">
          {avatar ? (
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatar} alt="avatar" className="h-10 w-10 rounded-full object-cover" />
            </div>
          ) : null}
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
            {text ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{text}</p>
            ) : null}
            {actions && actions.length > 0 ? (
              <div className="mt-3 flex gap-2">
                {actions.map((action, idx) => (
                  <button
                    key={idx}
                    className={
                      action.primary
                        ? "inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        : "inline-flex items-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }
                    onClick={() => action.onClick()}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="ml-4 flex shrink-0">
            <button
              className="inline-flex rounded-md text-zinc-400 hover:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:hover:text-zinc-300"
              onClick={() => onClose?.(id)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
