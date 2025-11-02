'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

type PostActionMenuProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
  disabled?: boolean;
};

export default function PostActionMenu({
  onEdit,
  onDelete,
  className = '',
  disabled = false,
}: PostActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirm, setIsConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  useOnClickOutside(menuRef, () => {
    if (isOpen && !isConfirm) {
      setIsOpen(false);
    }
  });

  useOnClickOutside(confirmRef, () => {
    if (isConfirm) {
      setIsConfirm(false);
    }
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isConfirm) {
          setIsConfirm(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    if (isOpen || isConfirm) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isConfirm]);

  useEffect(() => {
    if (isOpen && !isConfirm) {
      if (firstMenuItemRef.current) {
        firstMenuItemRef.current.focus();
      } else if (menuRef.current) {
        const firstButton = menuRef.current.querySelector('button[role="menuitem"]');
        if (firstButton instanceof HTMLElement) {
          firstButton.focus();
        }
      }
    }
  }, [isOpen, isConfirm]);

  useEffect(() => {
    if (isConfirm && confirmRef.current) {
      const firstButton = confirmRef.current.querySelector('button');
      firstButton?.focus();
    }
  }, [isConfirm]);

  useEffect(() => {
    if (!isOpen || isConfirm) return;

    const menu = menuRef.current;
    if (!menu) return;

    const focusableElements = menu.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    menu.addEventListener('keydown', handleTab);
    return () => menu.removeEventListener('keydown', handleTab);
  }, [isOpen, isConfirm]);

  const handleEdit = () => {
    setIsOpen(false);
    onEdit?.();
  };

  const handleDeleteClick = () => {
    setIsConfirm(true);
  };

  const handleConfirmDelete = () => {
    setIsConfirm(false);
    setIsOpen(false);
    onDelete?.();
  };

  const handleCancelDelete = () => {
    setIsConfirm(false);
  };

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const menuAnimation = {
    initial: { opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: -2 },
    transition: { duration: 0.16, ease: 'easeOut' },
  };

  const overlayAnimation = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.16 } },
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Post actions"
        data-testid="action-trigger"
        className="absolute top-2 right-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-telegram-blue disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation z-50"
      >
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <MoreVertical className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              {...overlayAnimation}
              data-testid="overlay"
              className="absolute inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/30 z-40 rounded-inherit"
            />
            <div
              ref={menuRef}
              className="absolute right-2 top-10 z-50"
              data-testid="action-menu"
            >
              <motion.div
                {...menuAnimation}
                className="w-44 rounded-xl border border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-1"
              >
                {onEdit && (
                  <button
                    ref={onDelete ? undefined : firstMenuItemRef}
                    type="button"
                    onClick={handleEdit}
                    role="menuitem"
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:ring-offset-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    ref={onEdit ? undefined : firstMenuItemRef}
                    type="button"
                    onClick={handleDeleteClick}
                    role="menuitem"
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </motion.div>

              {isConfirm && (
                <div
                  ref={confirmRef}
                  className="absolute right-0 top-0 z-[60]"
                  data-testid="confirm-dialog"
                >
                  <motion.div
                    {...menuAnimation}
                    role="dialog"
                    aria-modal="true"
                    className="w-56 rounded-xl border border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-4"
                  >
                    <p className="text-sm text-zinc-700 dark:text-zinc-200 mb-4">
                      Confirm deletion
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancelDelete}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:ring-offset-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}