export const STRIKE_REASON_OPTIONS = [
  {
    code: 'fake_receipt',
    label: 'Фейковая квитанция',
    description: 'Изображение похоже на поддельное подтверждение оплаты.',
  },
  {
    code: 'wrong_image',
    label: 'Не та картинка',
    description: 'Пользователь отправил не квитанцию и не скриншот оплаты.',
  },
  {
    code: 'unreadable_receipt',
    label: 'Нечитаемая квитанция',
    description: 'Скриншот слишком плохого качества или не позволяет проверить оплату.',
  },
  {
    code: 'other',
    label: 'Другая причина',
    description: 'Любая иная причина нарушения по заявке.',
  },
]

export function getDefaultStrikeReasonCode() {
  return STRIKE_REASON_OPTIONS[0].code
}

export function getStrikeReasonLabel(code) {
  const found = STRIKE_REASON_OPTIONS.find((item) => item.code === code)
  return found ? found.label : 'Нарушение'
}

export function getViolationSourceLabel(sourceType) {
  if (sourceType === 'payment_request') return 'Заявка на оплату'
  if (sourceType === 'chat') return 'Чат'
  if (sourceType === 'manual') return 'Ручная модерация'
  return 'Неизвестный источник'
}