import { supabase } from './supabase'

const SIGNED_URL_TTL_MS = 50 * 60 * 1000

const signedUrlCache = new Map()
const pendingSignedUrlRequests = new Map()

function getCacheKey(bucket, path) {
  return `${bucket}:${path}`
}

async function createSignedStorageUrl(bucket, path, expiresInSeconds = 3600) {
  if (!supabase || !path) return null

  const cacheKey = getCacheKey(bucket, path)
  const cached = signedUrlCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }

  const pending = pendingSignedUrlRequests.get(cacheKey)
  if (pending) {
    return pending
  }

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds)

    if (error || !data?.signedUrl) {
      return null
    }

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS,
    })

    return data.signedUrl
  })()

  pendingSignedUrlRequests.set(cacheKey, request)

  try {
    return await request
  } finally {
    pendingSignedUrlRequests.delete(cacheKey)
  }
}

export async function downloadPrivateImageAsObjectUrl(path) {
  return createSignedStorageUrl('payment-screenshots', path, 3600)
}