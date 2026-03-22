export function normalizeUsername(username) {
  return username.trim().toLowerCase()
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username.trim())
}

export function usernameToEmail(username) {
  return `${normalizeUsername(username)}@velinor.local`
}