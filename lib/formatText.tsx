import React from 'react';
import Link from 'next/link';

/**
 * Парсит текст и выделяет упоминания через @ светло-зеленой подчеркнутой линией
 * @param text - Текст для обработки
 * @returns React элементы с выделенными упоминаниями
 */
export function formatTextWithMentions(text: string): React.ReactNode {
  if (!text) return text;

  // Регулярное выражение для поиска упоминаний: @username (где username может содержать буквы, цифры, подчеркивания)
  // Паттерн: @ за которым следует один или более символов (буквы, цифры, подчеркивания)
  // Захватываем упоминание до пробела, знака препинания или конца строки
  const mentionRegex = /@(\w+)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const [fullMatch, username] = match;
    const matchIndex = match.index;

    // Добавляем текст до упоминания
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    // Добавляем упоминание с светло-зеленой подчеркнутой линией и ссылкой на страницу пользователя
    parts.push(
      <Link
        key={`mention-${matchIndex}`}
        href={`/u/${username}`}
        className="relative inline-block font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
        onClick={(e) => e.stopPropagation()}
        data-prevent-card-navigation="true"
        style={{
          textDecoration: 'underline',
          textDecorationColor: '#86efac', // green-300
          textDecorationThickness: '2px',
          textUnderlineOffset: '3px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.textDecorationColor = '#4ade80'; // green-400
          e.currentTarget.style.backgroundColor = 'rgba(134, 239, 172, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.textDecorationColor = '#86efac'; // green-300
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {fullMatch}
      </Link>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}
