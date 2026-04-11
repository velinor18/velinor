import { supabase } from './supabase'

export const REVIEW_IMAGES_BUCKET = 'review-images'
export const MAX_REVIEW_IMAGES_COUNT = 3
export const MAX_REVIEW_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_TOTAL_REVIEW_IMAGES_SIZE = 18 * 1024 * 1024
export const ALLOWED_REVIEW_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

const MIN_REVIEW_IMAGE_SIDE = 360
const MIN_REVIEW_TEXT_LENGTH = 10
const MAX_REVIEW_TEXT_LENGTH = 3000
const MIN_REVIEW_IMAGE_RATIO = 0.45
const MAX_REVIEW_IMAGE_RATIO = 2.4

function loadImageByUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Не удалось открыть изображение'))
    image.src = url
  })
}

function normalizeFiles(input) {
  if (!input) return []
  if (Array.isArray(input)) return input
  return Array.from(input)
}

function sanitizeFileName(fileName = 'image') {
  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : 'png'

  const safeBase = baseName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image'

  const safeExtension = extension
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'png'

  return `${safeBase}.${safeExtension}`
}

function buildReviewImagePath(userId, index, originalName) {
  const safeFileName = sanitizeFileName(originalName)
  return `${userId}/${Date.now()}-${index}-${safeFileName}`
}

function getPublicImageUrl(path) {
  if (!supabase || !path) return ''

  const { data } = supabase.storage
    .from(REVIEW_IMAGES_BUCKET)
    .getPublicUrl(path)

  return data?.publicUrl || ''
}

function mapReviewRow(row) {
  const images = Array.isArray(row?.review_images) ? row.review_images : []

  return {
    ...row,
    review_images: [...images]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((image) => ({
        ...image,
        image_url: getPublicImageUrl(image.image_path),
      })),
  }
}

function cleanupPreviewItems(items) {
  normalizeFiles(items).forEach((item) => {
    if (item?.previewUrl) {
      revokeReviewPreviewUrl(item.previewUrl)
    }
  })
}

export function revokeReviewPreviewUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function validateReviewText(reviewText) {
  const text = String(reviewText || '').trim()

  if (!text) {
    return 'Введите текст отзыва'
  }

  if (text.length < MIN_REVIEW_TEXT_LENGTH) {
    return `Минимальная длина отзыва ${MIN_REVIEW_TEXT_LENGTH} символов`
  }

  if (text.length > MAX_REVIEW_TEXT_LENGTH) {
    return `Отзыв не должен быть длиннее ${MAX_REVIEW_TEXT_LENGTH} символов`
  }

  return ''
}

export function validateReviewImagesSelection(files) {
  const normalizedFiles = normalizeFiles(files)

  if (normalizedFiles.length > MAX_REVIEW_IMAGES_COUNT) {
    return `Можно загрузить максимум ${MAX_REVIEW_IMAGES_COUNT} изображения`
  }

  const totalSize = normalizedFiles.reduce(
    (sum, file) => sum + Number(file?.size || 0),
    0
  )

  if (totalSize > MAX_TOTAL_REVIEW_IMAGES_SIZE) {
    return 'Суммарный размер изображений должен быть не больше 18 МБ'
  }

  for (const file of normalizedFiles) {
    if (!file) {
      return 'Файл не выбран'
    }

    if (!file.type?.startsWith('image/')) {
      return 'Можно загружать только изображения'
    }

    if (!ALLOWED_REVIEW_IMAGE_TYPES.includes(file.type)) {
      return 'Разрешены только PNG, JPG и WEBP'
    }

    if (file.size > MAX_REVIEW_IMAGE_SIZE) {
      return 'Одно изображение должно быть не больше 10 МБ'
    }
  }

  return ''
}

export async function inspectReviewImage(file) {
  const selectionError = validateReviewImagesSelection([file])

  if (selectionError) {
    return {
      ok: false,
      error: selectionError,
    }
  }

  const previewUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageByUrl(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const ratio = width / height

    if (width < MIN_REVIEW_IMAGE_SIDE || height < MIN_REVIEW_IMAGE_SIDE) {
      revokeReviewPreviewUrl(previewUrl)
      return {
        ok: false,
        error: 'Изображение слишком маленькое. Нужен более чёткий файл.',
      }
    }

    if (ratio < MIN_REVIEW_IMAGE_RATIO || ratio > MAX_REVIEW_IMAGE_RATIO) {
      revokeReviewPreviewUrl(previewUrl)
      return {
        ok: false,
        error:
          'Формат изображения выглядит неподходящим. Загрузите обычное фото или скриншот.',
      }
    }

    return {
      ok: true,
      file,
      previewUrl,
      width,
      height,
      ratio,
    }
  } catch {
    revokeReviewPreviewUrl(previewUrl)
    return {
      ok: false,
      error: 'Не удалось обработать изображение',
    }
  }
}

export async function inspectReviewImages(files) {
  const normalizedFiles = normalizeFiles(files)
  const selectionError = validateReviewImagesSelection(normalizedFiles)

  if (selectionError) {
    return {
      ok: false,
      error: selectionError,
      items: [],
    }
  }

  const preparedItems = []

  for (const file of normalizedFiles) {
    const result = await inspectReviewImage(file)

    if (!result.ok) {
      cleanupPreviewItems(preparedItems)
      return {
        ok: false,
        error: result.error || 'Не удалось обработать изображения',
        items: [],
      }
    }

    preparedItems.push(result)
  }

  const totalSize = preparedItems.reduce(
    (sum, item) => sum + Number(item?.file?.size || 0),
    0
  )

  if (totalSize > MAX_TOTAL_REVIEW_IMAGES_SIZE) {
    cleanupPreviewItems(preparedItems)
    return {
      ok: false,
      error: 'Суммарный размер изображений должен быть не больше 18 МБ',
      items: [],
    }
  }

  return {
    ok: true,
    items: preparedItems.map((item, index) => ({
      ...item,
      sortOrder: index + 1,
      previewKey: `${Date.now()}_${index}_${Math.random()}`,
    })),
  }
}

export async function uploadReviewImages(userId, imageItems) {
  if (!supabase) {
    throw new Error('Supabase не подключён')
  }

  const items = normalizeFiles(imageItems)

  if (!userId) {
    throw new Error('Пользователь не найден')
  }

  if (!items.length) {
    return []
  }

  const uploadedPaths = []

  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const file = item?.file || item

      const path = buildReviewImagePath(userId, index + 1, file.name)

      const { error } = await supabase.storage
        .from(REVIEW_IMAGES_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/png',
        })

      if (error) {
        throw new Error(error.message || 'Не удалось загрузить изображение')
      }

      uploadedPaths.push(path)
    }

    return uploadedPaths
  } catch (error) {
    if (uploadedPaths.length) {
      await removeReviewImagesByPaths(uploadedPaths)
    }

    throw error
  }
}

export async function removeReviewImagesByPaths(paths) {
  if (!supabase) return

  const normalizedPaths = normalizeFiles(paths).filter(Boolean)
  if (!normalizedPaths.length) return

  const { error } = await supabase.storage
    .from(REVIEW_IMAGES_BUCKET)
    .remove(normalizedPaths)

  if (error) {
    console.error(error)
  }
}

export async function createReviewWithImages({
  userId,
  paymentRequestId,
  reviewText,
  username,
  avatarPath = null,
  avatarShape = null,
  imageItems = [],
}) {
  if (!supabase) {
    throw new Error('Supabase не подключён')
  }

  if (!userId) {
    throw new Error('Пользователь не найден')
  }

  if (!paymentRequestId) {
    throw new Error('Покупка для отзыва не выбрана')
  }

  const textError = validateReviewText(reviewText)
  if (textError) {
    throw new Error(textError)
  }

  const selectionError = validateReviewImagesSelection(
    normalizeFiles(imageItems).map((item) => item?.file || item)
  )

  if (selectionError) {
    throw new Error(selectionError)
  }

  let reviewId = null
  let uploadedPaths = []

  try {
    const { data: reviewRow, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        user_id: userId,
        payment_request_id: paymentRequestId,
        username: username || 'Пользователь',
        avatar_path: avatarPath,
        avatar_shape: avatarShape,
        review_text: String(reviewText).trim(),
        status: 'published',
      })
      .select('id')
      .single()

    if (reviewError || !reviewRow?.id) {
      throw new Error(reviewError?.message || 'Не удалось создать отзыв')
    }

    reviewId = reviewRow.id
    uploadedPaths = await uploadReviewImages(userId, imageItems)

    if (uploadedPaths.length) {
      const rows = uploadedPaths.map((path, index) => ({
        review_id: reviewId,
        image_path: path,
        sort_order: index + 1,
      }))

      const { error: imagesError } = await supabase
        .from('review_images')
        .insert(rows)

      if (imagesError) {
        throw new Error(
          imagesError.message || 'Не удалось сохранить изображения отзыва'
        )
      }
    }

    return {
      ok: true,
      reviewId,
    }
  } catch (error) {
    if (uploadedPaths.length) {
      await removeReviewImagesByPaths(uploadedPaths)
    }

    if (reviewId) {
      await supabase.from('reviews').delete().eq('id', reviewId)
    }

    throw error
  }
}

export async function fetchReviewablePaymentRequests() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase.rpc('get_reviewable_payment_requests')

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить покупки для отзывов')
  }

  return Array.isArray(data) ? data : []
}

export async function fetchPublishedReviews(limit = 24) {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, user_id, username, avatar_path, avatar_shape, review_text, status, created_at, review_images(id, image_path, sort_order, created_at)'
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить отзывы')
  }

  return (data || []).map(mapReviewRow)
}

export async function fetchMyReviews() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, user_id, payment_request_id, username, avatar_path, avatar_shape, review_text, status, admin_comment, created_at, updated_at, review_images(id, image_path, sort_order, created_at)'
    )
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить ваши отзывы')
  }

  return (data || []).map(mapReviewRow)
}

export async function fetchAllReviewsForAdmin() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, user_id, payment_request_id, username, avatar_path, avatar_shape, review_text, status, admin_comment, created_at, updated_at, review_images(id, image_path, sort_order, created_at)'
    )
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить отзывы')
  }

  return (data || []).map(mapReviewRow)
}

export async function setReviewStatus(reviewId, status, adminComment = null) {
  if (!supabase) {
    throw new Error('Supabase не подключён')
  }

  const { data, error } = await supabase
    .from('reviews')
    .update({
      status,
      admin_comment: adminComment ? String(adminComment).trim() : null,
    })
    .eq('id', reviewId)
    .select(
      'id, user_id, payment_request_id, username, avatar_path, avatar_shape, review_text, status, admin_comment, created_at, updated_at, review_images(id, image_path, sort_order, created_at)'
    )
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Не удалось обновить статус отзыва')
  }

  return mapReviewRow(data)
}

export async function hideReview(reviewId, adminComment = null) {
  return setReviewStatus(reviewId, 'hidden', adminComment)
}

export async function publishReview(reviewId, adminComment = null) {
  return setReviewStatus(reviewId, 'published', adminComment)
}

export async function deleteReview(reviewId) {
  if (!supabase) {
    throw new Error('Supabase не подключён')
  }

  const { data: reviewData, error: reviewLoadError } = await supabase
    .from('reviews')
    .select('id, review_images(image_path)')
    .eq('id', reviewId)
    .single()

  if (reviewLoadError || !reviewData) {
    throw new Error(reviewLoadError?.message || 'Не удалось найти отзыв')
  }

  const imagePaths = Array.isArray(reviewData.review_images)
    ? reviewData.review_images.map((item) => item.image_path).filter(Boolean)
    : []

  const { error: deleteError } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId)

  if (deleteError) {
    throw new Error(deleteError.message || 'Не удалось удалить отзыв')
  }

  if (imagePaths.length) {
    await removeReviewImagesByPaths(imagePaths)
  }

  return {
    ok: true,
  }
}

export async function fetchReviewsStats() {
  if (!supabase) {
    return {
      published_reviews_count: 0,
    }
  }

  const { data, error } = await supabase.rpc('get_reviews_stats')

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить статистику отзывов')
  }

  const row = Array.isArray(data) ? data[0] : data

  return {
    published_reviews_count: Number(row?.published_reviews_count || 0),
  }
}