const CACHE_PREFIX = 'velinor_data_cache_'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withTimeout(
  factory,
  timeoutMs = 8000,
  timeoutMessage = 'Сервер отвечает слишком долго'
) {
  let timerId = null

  try {
    return await Promise.race([
      Promise.resolve().then(factory),
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(timeoutMessage))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timerId) {
      clearTimeout(timerId)
    }
  }
}

export async function withRetry(factory, options = {}) {
  const retries = Number(options.retries ?? 1)
  const delayMs = Number(options.delayMs ?? 300)

  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await factory()
    } catch (error) {
      lastError = error

      if (attempt === retries) {
        break
      }

      await sleep(delayMs * (attempt + 1))
    }
  }

  throw lastError
}

export async function safeSupabase(factory, options = {}) {
  return withRetry(
    () =>
      withTimeout(
        factory,
        options.timeoutMs ?? 6000,
        options.timeoutMessage ?? 'Сервер отвечает слишком долго'
      ),
    {
      retries: options.retries ?? 0,
      delayMs: options.delayMs ?? 250,
    }
  )
}

function getCacheKey(key) {
  return `${CACHE_PREFIX}${key}`
}

export function writeDataCache(key, value) {
  try {
    localStorage.setItem(
      getCacheKey(key),
      JSON.stringify({
        savedAt: Date.now(),
        value,
      })
    )
  } catch {
    // ignore cache write errors
  }
}

export function readDataCache(key, maxAgeMs = 60 * 1000) {
  try {
    const raw = localStorage.getItem(getCacheKey(key))
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    if (!parsed.savedAt || !('value' in parsed)) {
      return null
    }

    const isExpired = Date.now() - parsed.savedAt > maxAgeMs
    if (isExpired) {
      return null
    }

    return parsed.value
  } catch {
    return null
  }
}

export function readStaleDataCache(key) {
  try {
    const raw = localStorage.getItem(getCacheKey(key))
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    if (!('value' in parsed)) {
      return null
    }

    return parsed.value
  } catch {
    return null
  }
}

export function readDataCacheMeta(key) {
  try {
    const raw = localStorage.getItem(getCacheKey(key))
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      savedAt: Number(parsed.savedAt || 0),
      value: parsed.value,
    }
  } catch {
    return null
  }
}

export function clearDataCache(key) {
  try {
    localStorage.removeItem(getCacheKey(key))
  } catch {
    // ignore
  }
}