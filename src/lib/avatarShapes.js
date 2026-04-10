export const AVATAR_SHAPE_OPTIONS = [
  { value: 'circle', label: 'Круг' },
  { value: 'rounded', label: 'Мягкий квадрат' },
  { value: 'square', label: 'Квадрат' },
  { value: 'diamond', label: 'Ромб' },
  { value: 'hexagon', label: 'Шестиугольник' },
  { value: 'triangle', label: 'Треугольник' },
]

export function normalizeAvatarShape(shape) {
  const exists = AVATAR_SHAPE_OPTIONS.some((item) => item.value === shape)
  return exists ? shape : 'circle'
}

export function getAvatarShapeClasses(shape) {
  const safeShape = normalizeAvatarShape(shape)

  if (safeShape === 'rounded') {
    return {
      outer: 'rounded-[32px]',
      inner: 'rounded-[30px]',
      optionOuter: 'rounded-2xl',
      optionInner: 'rounded-[14px]',
    }
  }

  if (safeShape === 'square') {
    return {
      outer: 'rounded-[18px]',
      inner: 'rounded-[16px]',
      optionOuter: 'rounded-xl',
      optionInner: 'rounded-[10px]',
    }
  }

  if (safeShape === 'diamond') {
    return {
      outer:
        '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]',
      inner:
        '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]',
      optionOuter:
        '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]',
      optionInner:
        '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]',
    }
  }

  if (safeShape === 'hexagon') {
    return {
      outer:
        '[clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0%_50%)]',
      inner:
        '[clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0%_50%)]',
      optionOuter:
        '[clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0%_50%)]',
      optionInner:
        '[clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0%_50%)]',
    }
  }

  if (safeShape === 'triangle') {
    return {
      outer:
        '[clip-path:polygon(50%_4%,96%_96%,4%_96%)]',
      inner:
        '[clip-path:polygon(50%_4%,96%_96%,4%_96%)]',
      optionOuter:
        '[clip-path:polygon(50%_4%,96%_96%,4%_96%)]',
      optionInner:
        '[clip-path:polygon(50%_4%,96%_96%,4%_96%)]',
    }
  }

  return {
    outer: 'rounded-full',
    inner: 'rounded-full',
    optionOuter: 'rounded-full',
    optionInner: 'rounded-full',
  }
}