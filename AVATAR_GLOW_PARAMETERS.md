# Параметры подсвечивания аватарок в постах

Документ описывает параметры эффекта свечения для аватарок в постах, используемые в компоненте `AvatarWithBadge`.

## Текущая реализация

Компонент `AvatarWithBadge` используется в постах (`PostFeed.tsx`) с параметрами:
- `size="sm"` (50px × 50px)
- `swScore` - Social Weight пользователя
- Эффект свечения применяется только для уровней выше Beginner (Growing и выше)

## Параметры свечения по уровням

### Цвета уровней (hex)

| Уровень | Hex цвет | RGB |
|---------|----------|-----|
| Beginner | `#9ca3af` | rgb(156, 163, 175) |
| Growing | `#60a5fa` | rgb(96, 165, 250) |
| Advance | `#a78bfa` | rgb(167, 139, 250) |
| Expert | `#fbbf24` | rgb(251, 191, 36) |
| Leader | `#fb923c` | rgb(251, 146, 60) |
| Angel | `#f472b6` | rgb(244, 114, 182) |

### Структура эффекта свечения

Эффект состоит из двух слоев:

#### 1. Внешний слой свечения (Outer Glow Layer)

**Позиционирование:**
- `position: absolute`
- `inset: 0` (полностью покрывает контейнер аватара)
- `border-radius: 50%` (круглая форма)
- `pointer-events: none` (не блокирует клики)

**Box Shadow:**
```css
box-shadow: 
  0 0 16px ${colorScheme.hex}60,  /* Первый слой: 16px радиус, 38% прозрачность */
  0 0 24px ${colorScheme.hex}40,  /* Второй слой: 24px радиус, 25% прозрачность */
  0 0 32px ${colorScheme.hex}30;  /* Третий слой: 32px радиус, 19% прозрачность */
```

**Background (радиальный градиент):**
```css
background: radial-gradient(
  circle at center,
  ${colorScheme.hex}20,  /* Центр: 13% прозрачность */
  transparent 70%        /* Прозрачный на 70% от центра */
);
```

#### 2. Border и Box Shadow на изображении

**Border:**
- `border-width: 2px` (border-2 в Tailwind)
- `border-color: ${colorScheme.hex}` (цвет уровня)
- `border-radius: 50%` (круглая форма)

**Box Shadow на изображении:**
```css
box-shadow: 
  0 0 12px ${colorScheme.hex}80,  /* Внешнее свечение: 12px радиус, 50% прозрачность */
  0 0 20px ${colorScheme.hex}60,  /* Среднее свечение: 20px радиус, 38% прозрачность */
  0 0 28px ${colorScheme.hex}40,  /* Внешнее свечение: 28px радиус, 25% прозрачность */
  inset 0 0 8px ${colorScheme.hex}20; /* Внутреннее свечение: 8px радиус, 13% прозрачность */
```

## Параметры для прогрессивной модели свечения

Для построения прогрессивной модели свечения по уровням можно использовать следующие параметры:

### Масштабирование по уровням

**Вариант 1: Линейное увеличение интенсивности**

| Уровень | Border Width | Outer Glow Radius | Image Glow Radius | Opacity Multiplier |
|---------|--------------|------------------|------------------|-------------------|
| Beginner | 0px | 0px | 0px | 0.0x |
| Growing | 2px | 16-32px | 12-28px | 1.0x |
| Advance | 2.5px | 20-40px | 16-36px | 1.2x |
| Expert | 3px | 24-48px | 20-44px | 1.5x |
| Leader | 3.5px | 28-56px | 24-52px | 1.8x |
| Angel | 4px | 32-64px | 28-60px | 2.0x |

**Вариант 2: Экспоненциальное увеличение**

| Уровень | Border Width | Outer Glow Radius | Image Glow Radius | Opacity Multiplier |
|---------|--------------|------------------|------------------|-------------------|
| Beginner | 0px | 0px | 0px | 0.0x |
| Growing | 2px | 16-32px | 12-28px | 1.0x |
| Advance | 2.5px | 20-40px | 16-36px | 1.3x |
| Expert | 3px | 24-48px | 20-44px | 1.7x |
| Leader | 3.5px | 28-56px | 24-52px | 2.2x |
| Angel | 4px | 32-64px | 28-60px | 3.0x |

### Формула для расчета параметров

```javascript
function getGlowParameters(levelName) {
  const levelIndex = {
    'Beginner': 0,
    'Growing': 1,
    'Advance': 2,
    'Expert': 3,
    'Leader': 4,
    'Angel': 5
  };
  
  const index = levelIndex[levelName] || 0;
  
  // Линейное масштабирование
  const borderWidth = index > 0 ? 2 + (index - 1) * 0.5 : 0;
  const outerGlowMin = index > 0 ? 16 + (index - 1) * 4 : 0;
  const outerGlowMax = index > 0 ? 32 + (index - 1) * 8 : 0;
  const imageGlowMin = index > 0 ? 12 + (index - 1) * 4 : 0;
  const imageGlowMax = index > 0 ? 28 + (index - 1) * 8 : 0;
  const opacityMultiplier = index > 0 ? 1 + (index - 1) * 0.2 : 0;
  
  return {
    borderWidth: `${borderWidth}px`,
    outerGlow: `${outerGlowMin}px ${outerGlowMax}px`,
    imageGlow: `${imageGlowMin}px ${imageGlowMax}px`,
    opacityMultiplier
  };
}
```

## Текущие значения прозрачности (hex alpha)

| Hex суффикс | Десятичное значение | Процент прозрачности |
|-------------|-------------------|---------------------|
| `20` | 32 | 13% |
| `30` | 48 | 19% |
| `40` | 64 | 25% |
| `60` | 96 | 38% |
| `80` | 128 | 50% |

## Рекомендации для прогрессивной модели

1. **Border Width**: Увеличивать от 2px (Growing) до 4px (Angel)
2. **Outer Glow Radius**: Увеличивать от 16-32px до 32-64px
3. **Image Glow Radius**: Увеличивать от 12-28px до 28-60px
4. **Opacity Multiplier**: Увеличивать от 1.0x до 2.0x-3.0x для более высоких уровней
5. **Дополнительные эффекты для высоких уровней**:
   - Анимация пульсации (pulse animation)
   - Дополнительные слои свечения
   - Более яркие внутренние тени

## Пример реализации прогрессивной модели

```typescript
function getProgressiveGlowParameters(levelName: string, colorScheme: LevelColorScheme) {
  const levelMultipliers = {
    'Beginner': { border: 0, outer: 0, image: 0, opacity: 0 },
    'Growing': { border: 1, outer: 1, image: 1, opacity: 1 },
    'Advance': { border: 1.25, outer: 1.25, image: 1.25, opacity: 1.2 },
    'Expert': { border: 1.5, outer: 1.5, image: 1.5, opacity: 1.5 },
    'Leader': { border: 1.75, outer: 1.75, image: 1.75, opacity: 1.8 },
    'Angel': { border: 2, outer: 2, image: 2, opacity: 2 }
  };
  
  const multiplier = levelMultipliers[levelName] || levelMultipliers['Beginner'];
  
  return {
    borderWidth: `${2 * multiplier.border}px`,
    outerGlow: {
      boxShadow: `
        0 0 ${16 * multiplier.outer}px ${colorScheme.hex}${Math.round(60 * multiplier.opacity).toString(16)},
        0 0 ${24 * multiplier.outer}px ${colorScheme.hex}${Math.round(40 * multiplier.opacity).toString(16)},
        0 0 ${32 * multiplier.outer}px ${colorScheme.hex}${Math.round(30 * multiplier.opacity).toString(16)}
      `,
      background: `radial-gradient(circle at center, ${colorScheme.hex}${Math.round(20 * multiplier.opacity).toString(16)}, transparent 70%)`
    },
    imageGlow: {
      boxShadow: `
        0 0 ${12 * multiplier.image}px ${colorScheme.hex}${Math.round(80 * multiplier.opacity).toString(16)},
        0 0 ${20 * multiplier.image}px ${colorScheme.hex}${Math.round(60 * multiplier.opacity).toString(16)},
        0 0 ${28 * multiplier.image}px ${colorScheme.hex}${Math.round(40 * multiplier.opacity).toString(16)},
        inset 0 0 ${8 * multiplier.image}px ${colorScheme.hex}${Math.round(20 * multiplier.opacity).toString(16)}
      `
    }
  };
}
```
