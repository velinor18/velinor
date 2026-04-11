import { supabase } from './supabase'

const DEFAULT_VK_PROVIDER = 'custom:vkid'

export function getVkProviderId() {
  return import.meta.env.VITE_VK_SUPABASE_PROVIDER || DEFAULT_VK_PROVIDER
}

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

export async function signInWithVk() {
  if (!supabase) {
    return {
      error: new Error('Supabase не подключён'),
    }
  }

  return supabase.auth.signInWithOAuth({
    provider: getVkProviderId(),
    options: {
      redirectTo: getOAuthRedirectUrl(),
    },
  })
}