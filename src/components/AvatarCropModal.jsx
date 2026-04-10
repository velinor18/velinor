import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedAvatarBlob } from '../lib/avatar'
import { normalizeAvatarShape } from '../lib/avatarShapes'

export default function AvatarCropModal({
  open,
  imageSrc,
  shape = 'circle',
  onClose,
  onSave,
  saving = false,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!open) return
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setErrorText('')
  }, [open, imageSrc])

  if (!open || !imageSrc) return null

  const safeShape = normalizeAvatarShape(shape)
  const cropShape = safeShape === 'circle' ? 'round' : 'rect'

  const handleSave = async () => {
    try {
      setErrorText('')

      if (!croppedAreaPixels) {
        setErrorText('Сначала выбери область изображения')
        return
      }

      const croppedBlob = await getCroppedAvatarBlob(
        imageSrc,
        croppedAreaPixels,
        'image/jpeg'
      )

      const success = await onSave(croppedBlob)

      if (success) {
        onClose()
      }
    } catch (error) {
      console.error(error)
      setErrorText('Не удалось обработать изображение')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fuchsia-500/15 px-5 py-4 sm:px-6">
          <div>
            <div className="text-2xl font-black text-white">
              Редактор аватара
            </div>

            <div className="mt-1 text-sm text-zinc-400">
              Перемещай изображение и меняй масштаб. Форма применяется отдельно в профиле.
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-6">
          <div className="relative h-[380px] overflow-hidden rounded-[24px] bg-black sm:h-[460px]">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape={cropShape}
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, croppedPixels) =>
                setCroppedAreaPixels(croppedPixels)
              }
            />
          </div>

          <div className="mt-6">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Масштаб
            </label>

            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-fuchsia-500"
            />
          </div>

          {errorText ? (
            <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={onClose}
              className="rounded-2xl border border-white/10 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-zinc-200 transition hover:bg-white/5"
            >
              Отмена
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
            >
              {saving ? 'Сохраняем...' : 'Сохранить аватар'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}