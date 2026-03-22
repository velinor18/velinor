import { supabase } from './supabase'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function downloadPrivateImageAsObjectUrl(path, attempts = 4, delayMs = 700) {
  if (!supabase || !path) return null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.storage
      .from('payment-screenshots')
      .download(path)

    if (!error && data) {
      return URL.createObjectURL(data)
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs)
    }
  }

  return null
}