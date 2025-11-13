'use client';

import { X as CloseIcon, Info } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type TrustFlowInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const TRUST_LEVELS = [
  {
    range: '< 0',
    color: 'red',
    label: 'Low Trust',
    description: 'Отрицательный показатель доверия. Пользователь получил больше негативных оценок, чем позитивных.',
  },
  {
    range: '0 - 9.9',
    color: 'gray',
    label: 'Newcomer',
    description: 'Новый пользователь или пользователь с минимальной активностью. Базовый уровень доверия.',
  },
  {
    range: '10 - 39.9',
    color: 'yellow',
    label: 'Moderate Trust',
    description: 'Умеренный уровень доверия. Пользователь получил некоторое количество позитивных оценок.',
  },
  {
    range: '40 - 99.9',
    color: 'green',
    label: 'High Trust',
    description: 'Высокий уровень доверия. Пользователь зарекомендовал себя как надежный участник сообщества.',
  },
  {
    range: '≥ 100',
    color: 'blue',
    label: 'Elite',
    description: 'Элитный уровень доверия. Пользователь получил значительное количество позитивных оценок от активных участников сообщества.',
  },
];

export default function TrustFlowInfoModal({
  isOpen,
  onClose,
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
            {/* Что такое Trust Flow */}
            <div>
              <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Что такое Trust Flow?
              </h3>
              <p className={`text-sm leading-relaxed ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                Trust Flow (TF) — это показатель доверия к пользователю в сообществе, основанный на оценках других участников. 
                Пользователи могут оставлять позитивные или негативные оценки (пуши), которые влияют на Trust Flow.
              </p>
            </div>

            {/* Как рассчитывается */}
            <div>
              <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Как рассчитывается Trust Flow?
              </h3>
              <p className={`text-sm leading-relaxed mb-2 ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                Trust Flow рассчитывается по формуле:
              </p>
              <div className={`p-3 rounded-lg border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                <code className={`text-xs ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                  TF = Σ(Позитивные пуши × Вес пользователя / (1 + Повтор)) - Σ(Негативные пуши × Вес пользователя / (1 + Повтор))
                </code>
              </div>
              <div className={`mt-3 text-sm space-y-1 ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                <p>• <strong>Вес пользователя</strong> зависит от его активности (посты, комментарии, SW) и возраста аккаунта</p>
                <p>• <strong>Повтор</strong> — количество предыдущих оценок от того же пользователя (повторяющиеся оценки имеют меньший вес)</p>
                <p>• <strong>Базовое значение</strong> для новых пользователей: 5.0</p>
              </div>
            </div>

            {/* Уровни доверия */}
            <div>
              <h3 className={`font-semibold text-base mb-3 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Уровни доверия
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

            {/* Как оставить оценку */}
            <div>
              <h3 className={`font-semibold text-base mb-2 ${isLight ? 'text-primary-text' : 'text-primary-text'}`}>
                Как оставить оценку?
              </h3>
              <p className={`text-sm leading-relaxed ${isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'}`}>
                На странице профиля другого пользователя нажмите кнопку "Leave opinion" под блоком Trust Flow. 
                Вы можете оставить позитивную или негативную оценку с комментарием. 
                Обратите внимание: максимальное количество оценок одному пользователю — 5 в месяц.
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
              Понятно
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
