import React from 'react';

/**
 * Парсит текст и выделяет упоминания через @ зеленой подчеркнутой линией
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

    // Добавляем упоминание с зеленой подчеркнутой линией
    parts.push(
      <span
        key={`mention-${matchIndex}`}
        className="underline decoration-green-400 decoration-2"
      >
        {fullMatch}
      </span>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}
