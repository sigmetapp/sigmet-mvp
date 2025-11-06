'use client';

import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/Button';

type ComplaintType = 'harassment' | 'misinformation' | 'inappropriate_content';

type PostReportModalProps = {
  postId: number;
  postUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (complaintType: ComplaintType, description: string) => Promise<void>;
};

const COMPLAINT_TYPES: Array<{ value: ComplaintType; label: string }> = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
];

export default function PostReportModal({
  postId,
  postUrl,
  isOpen,
  onClose,
  onSubmit,
}: PostReportModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [selectedType, setSelectedType] = useState<ComplaintType | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedType) {
      return;
    }
    if (!description.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(selectedType, description.trim());
      setSelectedType(null);
      setDescription('');
      onClose();
    } catch (error: any) {
      // Error handling is done in parent component
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className={`absolute inset-0 ${isLight ? 'bg-black/50' : 'bg-black/80'}`}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md mx-auto p-4">
        <div
          className={`telegram-card-glow p-4 md:p-6 space-y-4 ${
            isLight ? '' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className={`font-medium ${isLight ? 'text-telegram-text' : 'text-telegram-text'}`}>
              Report Post
            </div>
            <button
              onClick={onClose}
              className={`transition ${
                isLight
                  ? 'text-telegram-text-secondary hover:text-telegram-blue'
                  : 'text-telegram-text-secondary hover:text-telegram-blue-light'
              }`}
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-telegram-text' : 'text-telegram-text'
                }`}
              >
                Reason for complaint
              </label>
              <div className="space-y-2">
                {COMPLAINT_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      selectedType === type.value
                        ? isLight
                          ? 'border-telegram-blue bg-telegram-blue/10'
                          : 'border-telegram-blue bg-telegram-blue/15'
                        : isLight
                        ? 'border-black/10 hover:bg-black/5'
                        : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="complaintType"
                      value={type.value}
                      checked={selectedType === type.value}
                      onChange={() => setSelectedType(type.value)}
                      className="w-4 h-4"
                    />
                    <span
                      className={`text-sm ${
                        isLight ? 'text-telegram-text' : 'text-telegram-text'
                      }`}
                    >
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-telegram-text' : 'text-telegram-text'
                }`}
              >
                Additional details
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please provide more information about your complaint..."
                rows={4}
                className={`input w-full rounded-xl p-3 outline-none transition resize-none ${
                  isLight
                    ? 'placeholder-telegram-text-secondary/60'
                    : 'placeholder-telegram-text-secondary/50'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={onClose}
              variant="secondary"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="primary"
              disabled={submitting || !selectedType || !description.trim()}
              className="ml-auto"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
