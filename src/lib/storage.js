import { supabase } from './supabase'
import { safeSupabase } from './asyncData'

const SIGNED_URL_TTL_MS = 45 * 60 * 1000
const SIGNED_URL_EXPIRES_IN_SECONDS = 3600
const SIGNED_URL_TIMEOUT_MS = 3500
const SIGNED_URL_CACHE_PREFIX = 'velinor_private_image_signed_url_'

const signedUrlCache = new Map()
const pendingSignedUrlRequests = new Map()

function getCacheKey(bucket, path) {
  return `${bucket}:${path}`
}

function getPersistentCacheKey(bucket, path) {
  return `${SIGNED_URL_CACHE_PREFIX}${bucket}_${path}`
}

function isUsableCachedUrl(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.url === 'string' &&
    value.url &&
    Number(value.expiresAt || 0) > Date.now() + 15 * 1000
  )
}

function readPersistentSignedUrl(bucket, path) {
  try {
    const raw = localStorage.getItem(getPersistentCacheKey(bucket, path))
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (!isUsableCachedUrl(parsed)) {
      localStorage.removeItem(getPersistentCacheKey(bucket, path))
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function writePersistentSignedUrl(bucket, path, value) {
  try {
    localStorage.setItem(
      getPersistentCacheKey(bucket, path),
      JSON.stringify(value)
    )
  } catch {
    // ignore cache write errors
  }
}

async function createSignedStorageUrl(
  bucket,
  path,
  expiresInSeconds = SIGNED_URL_EXPIRES_IN_SECONDS
) {
  if (!supabase || !path) return null

  const cacheKey = getCacheKey(bucket, path)
  const memoryCached = signedUrlCache.get(cacheKey)

  if (isUsableCachedUrl(memoryCached)) {
    return memoryCached.url
  }

  const persistentCached = readPersistentSignedUrl(bucket, path)

  if (persistentCached) {
    signedUrlCache.set(cacheKey, persistentCached)
    return persistentCached.url
  }

  const pending = pendingSignedUrlRequests.get(cacheKey)
  if (pending) {
    return pending
  }

  const request = (async () => {
    try {
      const { data, error } = await safeSupabase(
        () =>
          supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresInSeconds),
        {
          timeoutMs: SIGNED_URL_TIMEOUT_MS,
          retries: 0,
          timeoutMessage: 'Изображение загружается слишком долго',
        }
      )

      if (error || !data?.signedUrl) {
        return null
      }

      const cacheValue = {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_MS,
      }

      signedUrlCache.set(cacheKey, cacheValue)
      writePersistentSignedUrl(bucket, path, cacheValue)

      return data.signedUrl
    } catch (error) {
      console.error(error)
      return null
    }
  })()

  pendingSignedUrlRequests.set(cacheKey, request)

  try {
    return await request
  } finally {
    pendingSignedUrlRequests.delete(cacheKey)
  }
}

export async function downloadPrivateImageAsObjectUrl(path) {
  return createSignedStorageUrl('payment-screenshots', path)
}