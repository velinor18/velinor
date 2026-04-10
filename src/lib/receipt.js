export const MAX_RECEIPT_SIZE = 6 * 1024 * 1024
export const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function loadImageByUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Не удалось открыть изображение'))
    image.src = url
  })
}

export function revokeReceiptPreviewUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function validateReceiptFile(file) {
  if (!file) {
    return 'Файл не выбран'
  }

  if (!file.type?.startsWith('image/')) {
    return 'Можно загружать только изображения'
  }

  if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
    return 'Разрешены только PNG, JPG и WEBP'
  }

  if (file.size > MAX_RECEIPT_SIZE) {
    return 'Скриншот должен быть не больше 6 МБ'
  }

  return ''
}

export async function inspectReceiptImage(file) {
  const validationError = validateReceiptFile(file)

  if (validationError) {
    return {
      ok: false,
      error: validationError,
    }
  }

  const previewUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageByUrl(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const ratio = width / height

    if (width < 360 || height < 360) {
      revokeReceiptPreviewUrl(previewUrl)
      return {
        ok: false,
        error: 'Изображение слишком маленькое. Нужен более чёткий скриншот.',
      }
    }

    if (ratio < 0.4 || ratio > 2.2) {
      revokeReceiptPreviewUrl(previewUrl)
      return {
        ok: false,
        error:
          'Формат изображения выглядит неподходящим для квитанции. Загрузите обычный скриншот оплаты.',
      }
    }

    return {
      ok: true,
      previewUrl,
      width,
      height,
    }
  } catch {
    revokeReceiptPreviewUrl(previewUrl)
    return {
      ok: false,
      error: 'Не удалось обработать изображение',
    }
  }
}