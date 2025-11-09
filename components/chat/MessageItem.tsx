'use client';

import type { Message, MessageStatus } from '@/types/chat';

type Props = {
  message: Message;
  isOwn: boolean;
  onRetry?: () => void;
};

function renderTicks(status?: MessageStatus) {
  if (!status || status === 'sending') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        className="text-white/40 animate-pulse"
        fill="currentColor"
      >
        <circle cx="8" cy="8" r="1.5" />
      </svg>
    );
  }

  if (status === 'read') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 15"
        width="12"
        height="12"
        className="text-blue-300"
        fill="currentColor"
      >
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
      </svg>
    );
  }

  if (status === 'delivered') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 15"
        width="12"
        height="12"
        className="text-white/70"
        fill="currentColor"
      >
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      className="text-white/50"
      fill="currentColor"
    >
      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
    </svg>
  );
}

export function MessageItem({ message, isOwn, onRetry }: Props) {
  const containerClass = isOwn ? 'flex gap-2 justify-end' : 'flex gap-2 justify-start';
  const bubbleClass = [
    'max-w-[78%] px-4 py-2.5 rounded-2xl shadow-sm transition',
    isOwn
      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm'
      : 'bg-white/10 text-white rounded-bl-sm border border-white/20',
  ].join(' ');

  return (
    <div className={containerClass}>
      <div className={bubbleClass}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
          {message.text}
        </div>
        <div
          className={[
            'flex items-center gap-2 mt-1.5',
            isOwn ? 'justify-end' : 'justify-start',
          ].join(' ')}
        >
          <span className="text-[10px] text-white/60">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {isOwn && renderTicks(message.status)}
          {isOwn && message.status === 'sending' && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2 py-0.5 rounded text-[10px] bg-white/20 hover:bg-white/30 transition"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageItem;

