import { supabase } from './supabase'
import { safeSupabase } from './asyncData'

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024
export const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const SIGNED_URL_TTL_MS = 45 * 60 * 1000
const SIGNED_URL_EXPIRES_IN_SECONDS = 3600
const SIGNED_URL_TIMEOUT_MS = 3500
const SIGNED_URL_CACHE_PREFIX = 'velinor_avatar_signed_url_'

const signedUrlCache = new Map()
const pendingSignedUrlRequests = new Map()

function getSafeMimeType(mimeType) {
  if (ALLOWED_AVATAR_TYPES.includes(mimeType)) {
    return mimeType
  }

  return 'image/jpeg'
}

function getExtensionByMimeType(mimeType) {
  const safeMimeType = getSafeMimeType(mimeType)

  if (safeMimeType === 'image/png') return 'png'
  if (safeMimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function createImage(imageSrc) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Не удалось загрузить изображение'))
    image.src = imageSrc
  })
}

function getCacheKey(bucket, path) {
  return `${bucket}:${path}`
}

function getPersistentCacheKey(bucket, path) {
  return `${SIGNED_URL_CACHE_PREFIX}${bucket}_${path}`
}

function getPublicStorageUrl(bucket, path) {
  if (!supabase || !path) return null

  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
  }
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

function removePersistentSignedUrl(bucket, path) {
  try {
    localStorage.removeItem(getPersistentCacheKey(bucket, path))
  } catch {
    // ignore
  }
}

function invalidateSignedUrlCache(bucket, path) {
  if (!path) return

  const cacheKey = getCacheKey(bucket, path)
  signedUrlCache.delete(cacheKey)
  pendingSignedUrlRequests.delete(cacheKey)
  removePersistentSignedUrl(bucket, path)
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
          timeoutMessage: 'Аватар загружается слишком долго',
        }
      )

      if (error || !data?.signedUrl) {
        return getPublicStorageUrl(bucket, path)
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
      return getPublicStorageUrl(bucket, path)
    }
  })()

  pendingSignedUrlRequests.set(cacheKey, request)

  try {
    return await request
  } finally {
    pendingSignedUrlRequests.delete(cacheKey)
  }
}

export function validateAvatarFile(file) {
  if (!file) {
    return 'Файл не выбран'
  }

  if (!file.type?.startsWith('image/')) {
    return 'Можно загружать только изображения'
  }

  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return 'Разрешены только PNG, JPG и WEBP'
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return 'Изображение должно быть не больше 5 МБ'
  }

  return ''
}

export function getAvatarStoragePath(userId, mimeType = 'image/jpeg') {
  const ext = getExtensionByMimeType(mimeType)
  return `${userId}/avatar-${Date.now()}.${ext}`
}

export async function uploadAvatarBlob(userId, blob) {
  if (!supabase) {
    return {
      path: null,
      error: new Error('Supabase не подключён'),
    }
  }

  const safeMimeType = getSafeMimeType(blob?.type)
  const path = getAvatarStoragePath(userId, safeMimeType)

  const { error } = await safeSupabase(
    () =>
      supabase.storage
        .from('profile-avatars')
        .upload(path, blob, {
          upsert: false,
          cacheControl: '3600',
          contentType: safeMimeType,
        }),
    {
      timeoutMs: 7000,
      retries: 0,
      timeoutMessage: 'Загрузка аватара заняла слишком много времени',
    }
  )

  return {
    path,
    error: error ?? null,
  }
}

export async function removeAvatarByPath(path) {
  if (!supabase || !path) return

  invalidateSignedUrlCache('profile-avatars', path)

  const { error } = await safeSupabase(
    () => supabase.storage.from('profile-avatars').remove([path]),
    {
      timeoutMs: 5000,
      retries: 0,
      timeoutMessage: 'Удаление старого аватара заняло слишком много времени',
    }
  )

  if (error) {
    console.error(error)
  }
}

export async function downloadAvatarAsObjectUrl(path) {
  return createSignedStorageUrl('profile-avatars', path)
}

export function revokeObjectUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export async function getCroppedAvatarBlob(
  imageSrc,
  cropPixels,
  mimeType = 'image/jpeg',
  quality = 0.86,
  maxSize = 512
) {
  const image = await createImage(imageSrc)

  const sourceWidth = Math.max(1, Math.round(cropPixels.width))
  const sourceHeight = Math.max(1, Math.round(cropPixels.height))
  const sourceX = Math.round(cropPixels.x)
  const sourceY = Math.round(cropPixels.y)

  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Не удалось подготовить изображение')
  }

  canvas.width = targetWidth
  canvas.height = targetHeight

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight
  )

  const safeMimeType = getSafeMimeType(mimeType)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Не удалось подготовить изображение'))
          return
        }

        resolve(blob)
      },
      safeMimeType,
      quality
    )
  })
}