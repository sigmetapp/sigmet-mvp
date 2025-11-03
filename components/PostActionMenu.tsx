'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [canRenderPortal, setCanRenderPortal] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'bottom' | 'top'>('bottom');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

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

  useEffect(() => {
    setCanRenderPortal(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const spacing = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fallbackWidth = 176;

    const menuWidth = menuRef.current?.offsetWidth ?? fallbackWidth;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;

    const minHorizontalMargin = 8;
    let left = rect.right - menuWidth;
    if (left < minHorizontalMargin) {
      left = minHorizontalMargin;
    }
    if (left + menuWidth > viewportWidth - minHorizontalMargin) {
      left = viewportWidth - menuWidth - minHorizontalMargin;
    }

    let top = rect.bottom + spacing;
    let placement: 'bottom' | 'top' = 'bottom';

    if (menuHeight > 0 && top + menuHeight > viewportHeight - spacing) {
      const flippedTop = rect.top - spacing - menuHeight;
      if (flippedTop >= spacing) {
        top = flippedTop;
        placement = 'top';
      } else {
        top = Math.max(spacing, viewportHeight - menuHeight - spacing);
      }
    }

    setMenuPlacement(placement);
    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => updateMenuPosition());
    const handleResizeOrScroll = () => updateMenuPosition();

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = setTimeout(() => updateMenuPosition(), 0);
    return () => clearTimeout(timeoutId);
  }, [isConfirm, isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
    }
  }, [isOpen]);

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

  const menuAnimation = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };
    }

    if (menuPlacement === 'top') {
      return {
        initial: { opacity: 0, scale: 0.98, y: 4 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 4 },
        transition: { duration: 0.16, ease: 'easeOut' },
      };
    }

    return {
      initial: { opacity: 0, scale: 0.98, y: -4 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.98, y: -2 },
      transition: { duration: 0.16, ease: 'easeOut' },
    };
  }, [prefersReducedMotion, menuPlacement]);

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
    <div className={`relative inline-flex ${className}`}>
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
        data-prevent-card-navigation="true"
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

      {canRenderPortal &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <>
                {/* Global overlay to capture outside clicks */}
                <motion.div
                  {...overlayAnimation}
                  className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/30 z-[9990]"
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
                />

                {/* Menu - positioned relative to viewport to escape clipping */}
                <motion.div
                  {...menuAnimation}
                  ref={menuRef}
                  className="fixed z-[9991] w-44 rounded-xl border border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-1"
                  data-testid="action-menu"
                  style={{
                    top: menuPosition?.top ?? 0,
                    left: menuPosition?.left ?? 0,
                    visibility: menuPosition ? 'visible' : 'hidden',
                    pointerEvents: menuPosition ? 'auto' : 'none',
                    transformOrigin: menuPlacement === 'top' ? 'bottom right' : 'top right',
                  }}
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
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
