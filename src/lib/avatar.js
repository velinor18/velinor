import { supabase } from './supabase'

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024
export const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

  const { error } = await supabase.storage
    .from('profile-avatars')
    .upload(path, blob, {
      upsert: false,
      cacheControl: '60',
      contentType: safeMimeType,
    })

  return {
    path,
    error: error ?? null,
  }
}

export async function removeAvatarByPath(path) {
  if (!supabase || !path) return

  const { error } = await supabase.storage
    .from('profile-avatars')
    .remove([path])

  if (error) {
    console.error(error)
  }
}

export async function downloadAvatarAsObjectUrl(path, attempts = 4, delayMs = 250) {
  if (!supabase || !path) return null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.storage
      .from('profile-avatars')
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