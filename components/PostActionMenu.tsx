'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking inside menu or button
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target) ||
        confirmDialogRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      setIsConfirm(false);
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isConfirm) {
          setIsConfirm(false);
        } else {
          setIsOpen(false);
          buttonRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isConfirm]);

  // Focus trap in menu
  useEffect(() => {
    if (!isOpen || isConfirm) return;

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const menuItems = [
        menuButtonRef.current,
        deleteButtonRef.current,
      ].filter(Boolean) as HTMLButtonElement[];

      if (menuItems.length === 0) return;

      const firstItem = menuItems[0];
      const lastItem = menuItems[menuItems.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        }
      } else {
        if (document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen, isConfirm]);

  // Focus trap in confirm dialog
  useEffect(() => {
    if (!isConfirm) return;

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const dialogItems = [
        cancelButtonRef.current,
        confirmDeleteButtonRef.current,
      ].filter(Boolean) as HTMLButtonElement[];

      if (dialogItems.length === 0) return;

      const firstItem = dialogItems[0];
      const lastItem = dialogItems[dialogItems.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        }
      } else {
        if (document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isConfirm]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen && !isConfirm && menuButtonRef.current) {
      setTimeout(() => menuButtonRef.current?.focus(), 0);
    }
  }, [isOpen, isConfirm]);

  // Focus first button when confirm dialog opens
  useEffect(() => {
    if (isConfirm && cancelButtonRef.current) {
      setTimeout(() => cancelButtonRef.current?.focus(), 0);
    }
  }, [isConfirm]);

  const handleEdit = () => {
    setIsOpen(false);
    onEdit?.();
  };

  const handleDeleteClick = () => {
    setIsConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setIsConfirm(false);
    setIsOpen(false);
    onDelete?.();
  };

  const handleDeleteCancel = () => {
    setIsConfirm(false);
    deleteButtonRef.current?.focus();
  };

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const menuAnimation = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      }
    : {
        initial: { opacity: 0, scale: 0.98, y: -4 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: -2 },
        transition: { duration: 0.16, ease: 'easeOut' },
      };

  const overlayAnimation = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      };


  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      {/* Trigger button */}
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Post actions"
        data-testid="action-trigger"
        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-telegram-text-secondary hover:text-telegram-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-telegram-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 active:scale-[0.95] relative z-[105]"
      >
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          <MoreVertical className="h-5 w-5" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Local overlay inside card - positioned relative to nearest relative parent (card) */}
            <motion.div
              {...overlayAnimation}
              className="absolute inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/30 z-[100]"
              data-testid="overlay"
              onClick={() => {
                setIsOpen(false);
                setIsConfirm(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsOpen(false);
                  setIsConfirm(false);
                }
              }}
              tabIndex={-1}
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />

            {/* Menu - positioned relative to button using fixed to be above all content */}
            <motion.div
              {...menuAnimation}
              ref={menuRef}
              className="fixed z-[9999] w-44 rounded-xl border border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-1"
              data-testid="action-menu"
              style={(() => {
                if (!buttonRef.current) return {};
                const rect = buttonRef.current.getBoundingClientRect();
                return {
                  top: `${rect.bottom + 8}px`,
                  right: `${window.innerWidth - rect.right}px`,
                };
              })()}
            >
              {!isConfirm ? (
                <>
                  {onEdit && (
                    <button
                      ref={menuButtonRef}
                      type="button"
                      onClick={handleEdit}
                      role="menuitem"
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-telegram-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
                    >
                      <Pencil className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                  )}
                  {onDelete && (
                    <>
                      {onEdit && (
                        <div className="h-px bg-white/10 dark:bg-white/10 my-1" />
                      )}
                      <button
                        ref={deleteButtonRef}
                        type="button"
                        onClick={handleDeleteClick}
                        role="menuitem"
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:bg-red-50 dark:focus-visible:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </>
              ) : (
                /* Confirmation dialog */
                <motion.div
                  ref={confirmDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-title"
                  className="p-4 space-y-3"
                  data-testid="confirm-dialog"
                  {...menuAnimation}
                >
                  <p
                    id="confirm-title"
                    className="text-sm text-telegram-text font-medium"
                  >
                    Confirm deletion
                  </p>
                  <p className="text-xs text-telegram-text-secondary">
                    Are you sure you want to delete this post? This action
                    cannot be undone.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      ref={cancelButtonRef}
                      type="button"
                      onClick={handleDeleteCancel}
                      className="flex-1 px-3 py-2 rounded-lg text-sm border border-white/10 bg-transparent text-telegram-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-telegram-blue/50"
                    >
                      Cancel
                    </button>
                    <button
                      ref={confirmDeleteButtonRef}
                      type="button"
                      onClick={handleDeleteConfirm}
                      className="flex-1 px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
