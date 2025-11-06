'use client';

import { useEffect, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose?: () => void;
};

export default function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose?.(), 300); // Wait for fade out animation
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!isVisible) return null;

  const bgColor = type === 'success' 
    ? (isLight ? 'bg-green-500' : 'bg-green-600')
    : type === 'error'
    ? (isLight ? 'bg-red-500' : 'bg-red-600')
    : (isLight ? 'bg-blue-500' : 'bg-blue-600');

  return (
    <div
      className={`fixed top-4 right-4 z-[10000] ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-[500px] transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose?.(), 300);
        }}
        className="hover:opacity-80 transition-opacity"
        aria-label="Close"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
