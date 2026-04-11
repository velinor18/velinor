const STRIKE_REASON_LABELS = {
  invalid_receipt: 'Недействительная квитанция',
  fake_receipt: 'Поддельная квитанция',
  receipt_mismatch: 'Несоответствие данных квитанции',
  chat_profanity: 'Ненормативная лексика в чате',
  chat_spam: 'Спам в чате',
  manual_admin: 'Ручное действие администратора',
  other: 'Другое',
}

const VIOLATION_SOURCE_LABELS = {
  payment_request: 'Заявка на оплату',
  chat_message: 'Общий чат',
  chat: 'Общий чат',
  manual_admin: 'Действие администратора',
}

export function getStrikeReasonLabel(reasonCode) {
  return STRIKE_REASON_LABELS[reasonCode] || 'Нарушение'
}

export function getViolationSourceLabel(sourceType) {
  return VIOLATION_SOURCE_LABELS[sourceType] || 'Источник не указан'
}