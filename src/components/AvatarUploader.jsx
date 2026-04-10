import { useCallback, useEffect, useRef, useState } from 'react'
import AvatarCropModal from './AvatarCropModal'
import { validateAvatarFile } from '../lib/avatar'

function getInitials(username) {
  const safe = String(username || 'U').trim()
  return safe.slice(0, 1).toUpperCase()
}

export default function AvatarUploader({
  username,
  avatarUrl,
  loading = false,
  saving = false,
  onSave,
}) {
  const inputRef = useRef(null)
  const [editorImageSrc, setEditorImageSrc] = useState('')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    return () => {
      if (editorImageSrc && editorImageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(editorImageSrc)
      }
    }
  }, [editorImageSrc])

  const openEditorFromFile = useCallback((file) => {
    const validationError = validateAvatarFile(file)

    if (validationError) {
      setErrorText(validationError)
      return
    }

    setErrorText('')
    setEditorImageSrc(URL.createObjectURL(file))
  }, [])

  useEffect(() => {
    const handlePaste = (event) => {
      if (saving) return

      const activeElement = document.activeElement
      const isTyping =
        activeElement &&
        (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable
        )

      if (isTyping) {
        return
      }

      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))

      if (!imageItem) {
        return
      }

      const file = imageItem.getAsFile()

      if (!file) {
        return
      }

      event.preventDefault()
      openEditorFromFile(file)
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [openEditorFromFile, saving])

  const handlePickClick = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file) return

    openEditorFromFile(file)
  }

  const closeEditor = () => {
    if (editorImageSrc && editorImageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(editorImageSrc)
    }

    setEditorImageSrc('')
  }

  const handleSave = async (croppedBlob) => {
    setErrorText('')
    return onSave(croppedBlob)
  }

  return (
    <>
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <button
              type="button"
              onClick={handlePickClick}
              disabled={saving}
              className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border border-fuchsia-500/30 bg-black/60 shadow-[0_0_35px_rgba(168,85,247,0.18)] transition hover:scale-[1.01] sm:h-48 sm:w-48"
              aria-label="Выбрать аватар"
            >
              {loading ? (
                <div className="text-sm font-semibold text-zinc-400">Загрузка...</div>
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Аватар ${username}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-700/30 to-violet-700/20 text-6xl font-black text-white">
                  {getInitials(username)}
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={handlePickClick}
              disabled={saving}
              className="absolute -bottom-2 -right-2 flex h-12 w-12 items-center justify-center rounded-full border border-fuchsia-400/30 bg-fuchsia-600 text-xl text-white shadow-[0_0_25px_rgba(168,85,247,0.32)] transition hover:scale-[1.04] disabled:opacity-60"
              aria-label="Изменить аватар"
            >
              ✎
            </button>
          </div>

          <div className="mt-5 text-lg font-black text-white">Фото профиля</div>

          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
            Нажми на аватар, чтобы выбрать новое изображение. На компьютере также можно вставить картинку через Ctrl+V.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handlePickClick}
              disabled={saving}
              className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
            >
              Выбрать файл
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-zinc-300">
              Ctrl+V на компьютере
            </div>
          </div>

          {saving ? (
            <div className="mt-5 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
              Сохраняем новый аватар...
            </div>
          ) : null}

          {errorText ? (
            <div className="mt-5 w-full max-w-xl rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <AvatarCropModal
        open={Boolean(editorImageSrc)}
        imageSrc={editorImageSrc}
        onClose={closeEditor}
        onSave={handleSave}
        saving={saving}
      />
    </>
  )
}