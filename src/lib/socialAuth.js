import { supabase } from './supabase'

export function getOAuthRedirectUrl() {
  return `${window.location.origin}/profile`
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