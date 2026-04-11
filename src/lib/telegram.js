export const TELEGRAM_BOT_USERNAME =
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'VelynoriusBot'

export function buildTelegramBotUrl() {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}`
}

export function buildTelegramBotStartUrl(code) {
  if (!code) {
    return buildTelegramBotUrl()
  }

  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`
}