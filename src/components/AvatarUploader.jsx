import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeAvatarShape } from '../lib/avatarShapes'

const VIEWPORT_SIZE = 320
const OUTPUT_SIZE = 640
const SHAPE_OPTIONS = ['circle', 'rounded', 'square', 'diamond', 'hexagon', 'triangle']

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeRotation(rotation) {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function shapePreviewClass(shape) {
  if (shape === 'circle') return 'rounded-full'
  if (shape === 'rounded') return 'rounded-[28%]'
  if (shape === 'square') return 'rounded-[18px]'
  if (shape === 'diamond') {
    return '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]'
  }
  if (shape === 'hexagon') {
    return '[clip-path:polygon(25%_6.7%,75%_6.7%,100%_50%,75%_93.3%,25%_93.3%,0%_50%)]'
  }
  if (shape === 'triangle') {
    return '[clip-path:polygon(50%_0%,0%_100%,100%_100%)]'
  }
  return 'rounded-full'
}

function shapeButtonPreviewClass(shape) {
  if (shape === 'circle') return 'rounded-full'
  if (shape === 'rounded') return 'rounded-[28%]'
  if (shape === 'square') return 'rounded-[16px]'
  if (shape === 'diamond') {
    return '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]'
  }
  if (shape === 'hexagon') {
    return '[clip-path:polygon(25%_6.7%,75%_6.7%,100%_50%,75%_93.3%,25%_93.3%,0%_50%)]'
  }
  if (shape === 'triangle') {
    return '[clip-path:polygon(50%_0%,0%_100%,100%_100%)]'
  }
  return 'rounded-full'
}

async function readImageFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })

  return {
    src: dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

function getBaseScale(width, height) {
  return Math.max(VIEWPORT_SIZE / width, VIEWPORT_SIZE / height)
}

function getScaledImageSize(width, height, scale) {
  return {
    scaledWidth: width * scale,
    scaledHeight: height * scale,
  }
}

function getRotatedBoundingSize(width, height, scale, rotation) {
  const { scaledWidth, scaledHeight } = getScaledImageSize(width, height, scale)
  const safeRotation = normalizeRotation(rotation)
  const isQuarterTurn = safeRotation === 90 || safeRotation === 270

  return {
    displayWidth: isQuarterTurn ? scaledHeight : scaledWidth,
    displayHeight: isQuarterTurn ? scaledWidth : scaledHeight,
    scaledWidth,
    scaledHeight,
  }
}

function getBounds(width, height, scale, rotation) {
  const { displayWidth, displayHeight } = getRotatedBoundingSize(
    width,
    height,
    scale,
    rotation
  )

  return {
    maxX: Math.max(0, (displayWidth - VIEWPORT_SIZE) / 2),
    maxY: Math.max(0, (displayHeight - VIEWPORT_SIZE) / 2),
    displayWidth,
    displayHeight,
  }
}

function clampOffset(offset, bounds) {
  return {
    x: clamp(offset.x, -bounds.maxX, bounds.maxX),
    y: clamp(offset.y, -bounds.maxY, bounds.maxY),
  }
}

function AvatarCropModal({
  open,
  imageState,
  saving,
  onClose,
  onSubmit,
}) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [localError, setLocalError] = useState('')
  const dragStateRef = useRef(null)
  const viewportRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setZoom(1)
    setRotation(0)
    setOffset({ x: 0, y: 0 })
    setLocalError('')
  }, [open, imageState?.src])

  useEffect(() => {
    if (!open || !imageState) return

    const baseScale = getBaseScale(imageState.width, imageState.height)
    const scale = baseScale * zoom
    const bounds = getBounds(
      imageState.width,
      imageState.height,
      scale,
      rotation
    )

    setOffset((prev) => clampOffset(prev, bounds))
  }, [zoom, rotation, open, imageState])

  useEffect(() => {
    if (!open) return

    function handlePointerMove(event) {
      const dragState = dragStateRef.current
      if (!dragState || !imageState) return

      const nextX = dragState.startOffsetX + (event.clientX - dragState.startX)
      const nextY = dragState.startOffsetY + (event.clientY - dragState.startY)

      const baseScale = getBaseScale(imageState.width, imageState.height)
      const scale = baseScale * zoom
      const bounds = getBounds(
        imageState.width,
        imageState.height,
        scale,
        rotation
      )

      setOffset(
        clampOffset(
          {
            x: nextX,
            y: nextY,
          },
          bounds
        )
      )
    }

    function handlePointerUp() {
      dragStateRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [open, imageState, zoom, rotation])

  useEffect(() => {
    if (!open) return

    const originalHtmlOverflow = document.documentElement.style.overflow
    const originalBodyOverflow = document.body.style.overflow
    const originalBodyOverscroll = document.body.style.overscrollBehavior
    const originalBodyTouchAction = document.body.style.touchAction

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    document.body.style.touchAction = 'none'

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow
      document.body.style.overflow = originalBodyOverflow
      document.body.style.overscrollBehavior = originalBodyOverscroll
      document.body.style.touchAction = originalBodyTouchAction
    }
  }, [open])

  useEffect(() => {
    if (!open || !viewportRef.current) return

    const element = viewportRef.current

    function handleNativeWheel(event) {
      event.preventDefault()
      event.stopPropagation()

      const direction = event.deltaY > 0 ? -0.12 : 0.12
      updateZoom(zoom + direction)
    }

    element.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      element.removeEventListener('wheel', handleNativeWheel)
    }
  }, [open, zoom, imageState, rotation])

  function updateZoom(nextZoom) {
    if (!imageState) {
      setZoom(nextZoom)
      return
    }

    const safeNextZoom = clamp(nextZoom, 1, 3)
    const baseScale = getBaseScale(imageState.width, imageState.height)
    const currentScale = baseScale * zoom
    const nextScale = baseScale * safeNextZoom
    const ratio = nextScale / currentScale

    const nextBounds = getBounds(
      imageState.width,
      imageState.height,
      nextScale,
      rotation
    )

    setOffset((prev) =>
      clampOffset(
        {
          x: prev.x * ratio,
          y: prev.y * ratio,
        },
        nextBounds
      )
    )

    setZoom(safeNextZoom)
  }

  function rotateLeft() {
    if (!imageState) return

    const nextRotation = normalizeRotation(rotation - 90)
    const baseScale = getBaseScale(imageState.width, imageState.height)
    const scale = baseScale * zoom
    const nextBounds = getBounds(
      imageState.width,
      imageState.height,
      scale,
      nextRotation
    )

    setRotation(nextRotation)
    setOffset((prev) => clampOffset(prev, nextBounds))
  }

  function rotateRight() {
    if (!imageState) return

    const nextRotation = normalizeRotation(rotation + 90)
    const baseScale = getBaseScale(imageState.width, imageState.height)
    const scale = baseScale * zoom
    const nextBounds = getBounds(
      imageState.width,
      imageState.height,
      scale,
      nextRotation
    )

    setRotation(nextRotation)
    setOffset((prev) => clampOffset(prev, nextBounds))
  }

  const previewWrapperStyle = useMemo(() => {
    if (!imageState) return {}

    const baseScale = getBaseScale(imageState.width, imageState.height)
    const scale = baseScale * zoom
    const { displayWidth, displayHeight } = getRotatedBoundingSize(
      imageState.width,
      imageState.height,
      scale,
      rotation
    )

    return {
      width: `${displayWidth}px`,
      height: `${displayHeight}px`,
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
    }
  }, [imageState, zoom, rotation, offset])

  const previewImageStyle = useMemo(() => {
    if (!imageState) return {}

    const baseScale = getBaseScale(imageState.width, imageState.height)
    const scale = baseScale * zoom
    const { scaledWidth, scaledHeight } = getScaledImageSize(
      imageState.width,
      imageState.height,
      scale
    )

    return {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      left: '50%',
      top: '50%',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
      maxWidth: 'none',
      maxHeight: 'none',
    }
  }, [imageState, zoom, rotation])

  async function handleSave() {
    if (!imageState) return

    try {
      setLocalError('')

      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = imageState.src
      })

      const baseScale = getBaseScale(imageState.width, imageState.height)
      const totalScale = baseScale * zoom
      const factor = OUTPUT_SIZE / VIEWPORT_SIZE
      const safeRotation = normalizeRotation(rotation)

      const drawWidth = imageState.width * totalScale * factor
      const drawHeight = imageState.height * totalScale * factor

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE

      const context = canvas.getContext('2d')
      if (!context) {
        setLocalError('Не удалось подготовить изображение')
        return
      }

      context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      context.translate(
        OUTPUT_SIZE / 2 + offset.x * factor,
        OUTPUT_SIZE / 2 + offset.y * factor
      )
      context.rotate((safeRotation * Math.PI) / 180)

      context.drawImage(
        img,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      )

      const blob = await new Promise((resolve) => {
        canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png', 1)
      })

      if (!blob) {
        setLocalError('Не удалось сохранить изображение')
        return
      }

      await onSubmit(blob)
    } catch (error) {
      console.error(error)
      setLocalError('Не удалось обработать изображение')
    }
  }

  if (!open || !imageState) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-fuchsia-500/15 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xl font-black text-white sm:text-2xl">
                Редактирование аватара
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-400 sm:text-sm">
                Перетаскивай изображение, меняй масштаб и поворачивай его при необходимости.
              </div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5">
            <div className="mx-auto w-full max-w-[320px]">
              <div
                ref={viewportRef}
                className="relative mx-auto aspect-square w-full overflow-hidden rounded-[24px] border border-fuchsia-500/20 bg-black sm:rounded-[28px]"
                style={{ touchAction: 'none' }}
              >
                <div
                  className="absolute"
                  style={previewWrapperStyle}
                >
                  <img
                    src={imageState.src}
                    alt="Предпросмотр аватара"
                    draggable={false}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return

                      dragStateRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        startOffsetX: offset.x,
                        startOffsetY: offset.y,
                      }
                    }}
                    className="absolute pointer-events-auto select-none"
                    style={previewImageStyle}
                  />
                </div>

                <div className="pointer-events-none absolute inset-0 border border-white/10" />
                <div className="pointer-events-none absolute inset-[12px] rounded-[18px] border border-fuchsia-400/30 sm:inset-[14px] sm:rounded-[20px]" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={rotateLeft}
                disabled={saving}
                className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
              >
                Повернуть влево
              </button>

              <button
                type="button"
                onClick={rotateRight}
                disabled={saving}
                className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
              >
                Повернуть вправо
              </button>
            </div>

            <div>
              <div className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
                Масштаб
              </div>

              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => updateZoom(Number(e.target.value))}
                className="w-full accent-fuchsia-500"
              />

              <div className="mt-3 text-xs leading-5 text-zinc-500 sm:text-sm">
                На компьютере можно масштабировать колесом мыши.
              </div>
            </div>

            {localError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {localError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-fuchsia-500/15 px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-zinc-200 transition hover:bg-white/5"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AvatarUploader({
  username,
  avatarUrl,
  shape,
  loading,
  saving,
  shapeSaving,
  onSave,
  onShapeChange,
}) {
  const fileInputRef = useRef(null)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [cropImageState, setCropImageState] = useState(null)

  const normalizedShape = normalizeAvatarShape(shape)

  const avatarShapeClass = useMemo(
    () => shapePreviewClass(normalizedShape),
    [normalizedShape]
  )

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function prepareFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      return
    }

    const nextImageState = await readImageFile(file)
    setCropImageState(nextImageState)
    setIsCropOpen(true)
  }

  async function handleInputChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      await prepareFile(file)
    }

    event.target.value = ''
  }

  useEffect(() => {
    async function handlePaste(event) {
      const items = Array.from(event.clipboardData?.items || [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))

      if (!imageItem) return

      const file = imageItem.getAsFile()
      if (!file) return

      event.preventDefault()
      await prepareFile(file)
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [])

  return (
    <>
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div
              className={`flex h-[208px] w-[208px] items-center justify-center overflow-hidden border border-fuchsia-500/20 bg-black shadow-[0_0_40px_rgba(168,85,247,0.12)] ${avatarShapeClass}`}
            >
              {loading ? (
                <div className="text-sm font-semibold text-zinc-400">
                  Загрузка...
                </div>
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Аватар"
                  className={`h-full w-full object-cover ${avatarShapeClass}`}
                />
              ) : (
                <div className="text-5xl font-black uppercase text-fuchsia-400">
                  {(username || 'U').slice(0, 1)}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={openFilePicker}
              className="absolute bottom-1 right-1 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 text-xl text-white shadow-[0_0_40px_rgba(168,85,247,0.32)] transition hover:scale-[1.03]"
              aria-label="Изменить аватар"
            >
              ✎
            </button>
          </div>

          <div className="mt-5 max-w-full overflow-x-auto whitespace-nowrap rounded-full border border-fuchsia-500/15 bg-white/[0.03] px-4 py-2 text-lg font-black text-white">
            {username || '—'}
          </div>

          <div className="mt-4 text-sm font-bold uppercase tracking-wide text-zinc-400">
            Фото профиля
          </div>

          <div className="mt-6 w-full max-w-[240px] space-y-3">
            <button
              type="button"
              onClick={openFilePicker}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
            >
              Выбрать файл
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-zinc-300">
              Ctrl+V на компьютере
            </div>
          </div>
        </div>

        <div className="mt-10">
          <div className="text-center text-sm font-bold uppercase tracking-wide text-zinc-400">
            Форма аватара
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4">
            {SHAPE_OPTIONS.map((option) => {
              const isActive = normalizeAvatarShape(option) === normalizedShape

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onShapeChange(option)}
                  disabled={shapeSaving}
                  className={`flex h-[128px] items-center justify-center rounded-[26px] border transition ${
                    isActive
                      ? 'border-fuchsia-400/35 bg-fuchsia-500/10 shadow-[0_0_30px_rgba(168,85,247,0.16)]'
                      : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/25 hover:bg-fuchsia-900/10'
                  } disabled:opacity-60`}
                >
                  <div className="flex h-[72px] w-[72px] items-center justify-center">
                    <div
                      className={`h-full w-full border-8 border-fuchsia-500/30 bg-fuchsia-500/10 ${shapeButtonPreviewClass(
                        option
                      )}`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <AvatarCropModal
        open={isCropOpen}
        imageState={cropImageState}
        saving={saving}
        onClose={() => {
          if (saving) return
          setIsCropOpen(false)
          setCropImageState(null)
        }}
        onSubmit={async (blob) => {
          const success = await onSave(blob)

          if (success) {
            setIsCropOpen(false)
            setCropImageState(null)
          }
        }}
      />
    </>
  )
}