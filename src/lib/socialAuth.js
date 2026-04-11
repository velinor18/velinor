import { supabase } from './supabase'

const GOOGLE_OAUTH_PENDING_KEY = 'velinor_google_oauth_pending'

export function getOAuthRedirectUrl() {
  return `${window.location.origin}/profile`
}

export function markGoogleOAuthPending() {
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, '1')
  } catch {
    // ignore
  }
}

export function clearGoogleOAuthPending() {
  try {
    sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY)
  } catch {
    // ignore
  }
}

export function hasPendingGoogleOAuth() {
  try {
    return sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export async function signInWithGoogle() {
  if (!supabase) {
    return {
      error: new Error('Supabase не подключён'),
    }
  }

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getOAuthRedirectUrl(),
    },
  })
}