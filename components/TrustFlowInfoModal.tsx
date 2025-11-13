'use client';

import { X as CloseIcon, Info } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type TrustFlowInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
};

const TRUST_LEVELS = [
  {
    range: '< 0',
    color: 'red',
    label: 'Low Trust',
    description: 'Negative trust score. The user has received more negative evaluations than positive ones.',
    colorHex: '#ef4444', // red-500
  },
  {
    range: '0 - 9.9',
    color: 'gray',
    label: 'Newcomer',
    description: 'New user or user with minimal activity. Base trust level.',
    colorHex: '#9ca3af', // gray-400
  },
  {
    range: '10 - 39.9',
    color: 'yellow',
    label: 'Moderate Trust',
    description: 'Moderate level of trust. The user has received some positive evaluations.',
    colorHex: '#fbbf24', // yellow-400
  },
  {
    range: '40 - 99.9',
    color: 'green',
    label: 'High Trust',
    description: 'High level of trust. The user has proven to be a reliable member of the community.',
    colorHex: '#10b981', // green-500
  },
  {
    range: '≥ 100',
    color: 'blue',
    label: 'Elite',
    description: 'Elite level of trust. The user has received a significant number of positive evaluations from active community members.',
    colorHex: '#6366f1', // indigo-500
  },
];

export default function TrustFlowInfoModal({
  isOpen,
  onClose,
  isAdmin = false,
}: TrustFlowInfoModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  if (!isOpen) return null;

  const getColorClass = (color: string) => {
    switch (color) {
      case 'red':
        return isLight ? 'text-red-600' : 'text-red-400';
      case 'gray':
        return isLight ? 'text-gray-600' : 'text-gray-400';
      case 'yellow':
        return isLight ? 'text-yellow-600' : 'text-yellow-400';
      case 'green':
        return isLight ? 'text-green-600' : 'text-green-400';
      case 'blue':
        return isLight ? 'text-blue-600' : 'text-blue-400';
      default:
        return isLight ? 'text-gray-600' : 'text-gray-400';
    }
  };

  const getBorderColorClass = (color: string) => {
    switch (color) {
      case 'red':
        return isLight ? 'border-red-300' : 'border-red-500/30';
      case 'gray':
        return isLight ? 'border-gray-300' : 'border-gray-500/30';
      case 'yellow':
        return isLight ? 'border-yellow-300' : 'border-yellow-500/30';
      case 'green':
        return isLight ? 'border-green-300' : 'border-green-500/30';
      case 'blue':
        return isLight ? 'border-blue-300' : 'border-blue-500/30';
      default:
        return isLight ? 'border-gray-300' : 'border-gray-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className={`absolute inset-0 ${isLight ? 'bg-black/50' : 'bg-black/80'}`}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl mx-auto p-4 max-h-[90vh] overflow-y-auto">
        <div
          className={`card-glow-primary p-4 md:p-6 space-y-6 ${
            isLight ? '' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className={`h-5 w-5 ${isLight ? 'text-primary-blue' : 'text-primary-blue-light'}`} />
              <div className={`font-medium text-lg ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Trust Flow
              </div>
            </div>
            <button
              onClick={onClose}
              className={`transition ${
                isLight
                  ? 'text-primary-text-secondary hover:text-primary-blue'
                  : 'text-primary-text-secondary hover:text-primary-blue-light'
              }`}
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-6">
            {/* What is Trust Flow */}
            <div>
              <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                What is Trust Flow?
              </h3>
              <p className={`text-sm leading-relaxed ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                Trust Flow (TF) is a trust metric for users in the community, based on evaluations from other members. 
                Users can leave positive or negative evaluations (pushes) that affect Trust Flow.
              </p>
            </div>

            {/* How it's calculated - only for admins */}
            {isAdmin && (
              <div>
                <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                  How is Trust Flow calculated?
                </h3>
                <p className={`text-sm leading-relaxed mb-2 ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                  Trust Flow is calculated using the following formula:
                </p>
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                  <code className={`text-xs ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                    TF = Σ(Positive Pushes × User Weight / (1 + Repeat)) - Σ(Negative Pushes × User Weight / (1 + Repeat))
                  </code>
                </div>
                <div className={`mt-3 text-sm space-y-1 ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                  <p>• <strong>User Weight</strong> depends on their activity (posts, comments, SW) and account age</p>
                  <p>• <strong>Repeat</strong> is the number of previous evaluations from the same user (repeated evaluations have less weight)</p>
                  <p>• <strong>Base value</strong> for new users: 5.0</p>
                </div>
              </div>
            )}

            {/* Trust Levels */}
            <div>
              <h3 className={`font-semibold text-base mb-3 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Trust Levels
              </h3>
              <div className="space-y-2">
                {TRUST_LEVELS.map((level) => (
                  <div
                    key={level.color}
                    className={`p-3 rounded-lg border ${getBorderColorClass(level.color)} ${
                      isLight ? 'bg-black/5' : 'bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: level.colorHex }}
                      />
                      <span className={`font-medium ${getColorClass(level.color)}`}>
                        {level.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${getBorderColorClass(level.color)} ${getColorClass(level.color)}`}>
                        {level.range}
                      </span>
                    </div>
                    <p className={`text-xs ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                      {level.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* How to leave an evaluation */}
            <div>
              <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                How to leave an evaluation?
              </h3>
              <p className={`text-sm leading-relaxed ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                On another user's profile page, click the "Leave opinion" button below the Trust Flow block. 
                You can leave a positive or negative evaluation with a comment. 
                Note: maximum number of evaluations per user is 5 per month.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition ${
                isLight
                  ? 'bg-primary-blue text-white hover:bg-primary-blue/90'
                  : 'bg-primary-blue text-white hover:bg-primary-blue/90'
              }`}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
