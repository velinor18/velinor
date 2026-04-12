import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { downloadAvatarAsObjectUrl } from '../lib/avatar'
import {
  MAX_REVIEW_IMAGES_COUNT,
  createReviewWithImages,
  deleteReview,
  fetchAllReviewsForAdmin,
  fetchMyReviews,
  fetchPublishedReviews,
  fetchReviewablePaymentRequests,
  hideReview,
  inspectReviewImages,
  publishReview,
  revokeReviewPreviewUrl,
} from '../lib/reviews'

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return '—'
  }
}

function formatFileSize(size) {
  const safeSize = Number(size || 0)

  if (safeSize >= 1024 * 1024) {
    return `${(safeSize / (1024 * 1024)).toFixed(2)} МБ`
  }

  return `${Math.max(1, Math.round(safeSize / 1024))} КБ`
}

function getShapeClass(shape) {
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

function getReviewStatusMeta(status) {
  if (status === 'hidden') {
    return {
      label: 'Скрыт',
      className: 'border-yellow-400/20 bg-yellow-500/10 text-yellow-100',
    }
  }

  return {
    label: 'Опубликован',
    className: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
  }
}

function ReviewAvatar({ username, avatarUrl, avatarShape }) {
  const shapeClass = getShapeClass(avatarShape)

  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-fuchsia-500/20 bg-black text-sm font-black uppercase text-fuchsia-300 ${shapeClass}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username}
          className={`h-full w-full object-cover ${shapeClass}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span>{(username || 'U').slice(0, 1)}</span>
      )}
    </div>
  )
}

function StarIcon({ fillPercent = 0, sizeClass = 'text-[24px]' }) {
  return (
    <div className={`relative h-6 w-6 ${sizeClass} leading-none text-zinc-700`}>
      <span className="absolute inset-0">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.55)]"
        style={{ width: `${fillPercent}%` }}
      >
        ★
      </span>
    </div>
  )
}

function RatingStars({ value, withLabel = true }) {
  const safeValue = Number(value || 0)

  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((starNumber) => {
        let fillPercent = 0

        if (safeValue >= starNumber) {
          fillPercent = 100
        } else if (safeValue >= starNumber - 0.5) {
          fillPercent = 50
        }

        return <StarIcon key={starNumber} fillPercent={fillPercent} />
      })}

      {withLabel ? (
        <div className="ml-1 text-sm font-bold text-yellow-300">
          {safeValue > 0 ? safeValue.toFixed(1) : '—'}
        </div>
      ) : null}
    </div>
  )
}

function RatingInput({ value, onChange }) {
  return (
    <div>
      <div className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
        Оценка
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {[1, 2, 3, 4, 5].map((starNumber) => {
          const currentFill =
            value >= starNumber ? 100 : value >= starNumber - 0.5 ? 50 : 0

          return (
            <div
              key={starNumber}
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-500/15 bg-black/30"
            >
              <button
                type="button"
                aria-label={`Поставить ${starNumber - 0.5} звезды`}
                onClick={() => onChange(starNumber - 0.5)}
                className="absolute inset-y-0 left-0 z-10 w-1/2 rounded-l-2xl"
              />
              <button
                type="button"
                aria-label={`Поставить ${starNumber} звезд`}
                onClick={() => onChange(starNumber)}
                className="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-2xl"
              />

              <StarIcon fillPercent={currentFill} sizeClass="text-[28px]" />
            </div>
          )
        })}

        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-200">
          {Number(value).toFixed(1)} / 5
        </div>
      </div>

      <div className="mt-3 text-sm text-zinc-500">
        Можно выбрать шагом 0.5 звезды
      </div>
    </div>
  )
}

function ReviewImageLightbox({ images, startIndex, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(startIndex || 0)

  useEffect(() => {
    setCurrentIndex(startIndex || 0)
  }, [startIndex])

  if (!images?.length) return null

  const current = images[currentIndex]

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fuchsia-500/15 px-6 py-5">
          <div>
            <div className="text-2xl font-black text-white">
              Изображение отзыва
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              {currentIndex + 1} из {images.length}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <img
            src={current?.image_url}
            alt={`Изображение ${currentIndex + 1}`}
            className="max-h-[75vh] w-full rounded-[22px] border border-fuchsia-500/15 object-contain bg-black"
          />

          {images.length > 1 ? (
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) =>
                    prev === 0 ? images.length - 1 : prev - 1
                  )
                }
                className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Назад
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) =>
                    prev === images.length - 1 ? 0 : prev + 1
                  )
                }
                className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Дальше
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ReviewCard({
  review,
  avatarUrl,
  isAdmin,
  adminBusy,
  onHide,
  onPublish,
  onDelete,
  onOpenImage,
}) {
  const statusMeta = getReviewStatusMeta(review.status)

  return (
    <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <ReviewAvatar
          username={review.username}
          avatarUrl={avatarUrl}
          avatarShape={review.avatar_shape}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="break-all text-xl font-black text-white">
                {review.username}
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                {formatDateTime(review.created_at)}
              </div>
            </div>

            <div
              className={`rounded-2xl border px-4 py-2 text-xs font-bold uppercase tracking-wide ${statusMeta.className}`}
            >
              {statusMeta.label}
            </div>
          </div>

          <div className="mt-4">
            <RatingStars value={review.rating || 5} />
          </div>

          <div className="mt-4 whitespace-pre-wrap break-words text-base leading-8 text-zinc-200">
            {review.review_text}
          </div>

          {review.review_images?.length ? (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {review.review_images.map((image, index) => (
                <button
                  key={image.id || `${review.id}-${index}`}
                  type="button"
                  onClick={() => onOpenImage(review.review_images, index)}
                  className="overflow-hidden rounded-[22px] border border-fuchsia-500/15 bg-black transition hover:border-fuchsia-400/30"
                >
                  <img
                    src={image.image_url}
                    alt={`Изображение отзыва ${index + 1}`}
                    className="h-[220px] w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {review.admin_comment ? (
            <div className="mt-5 rounded-2xl border border-fuchsia-500/15 bg-black/30 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Комментарий администратора
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                {review.admin_comment}
              </div>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="mt-5 flex flex-wrap gap-3">
              {review.status === 'hidden' ? (
                <button
                  type="button"
                  disabled={adminBusy}
                  onClick={() => onPublish(review)}
                  className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  Показать отзыв
                </button>
              ) : (
                <button
                  type="button"
                  disabled={adminBusy}
                  onClick={() => onHide(review)}
                  className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-yellow-500/20 disabled:opacity-60"
                >
                  Скрыть отзыв
                </button>
              )}

              <button
                type="button"
                disabled={adminBusy}
                onClick={() => onDelete(review)}
                className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
              >
                Удалить отзыв
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PurchaseSelectList({
  items,
  selectedId,
  onSelect,
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-5 text-sm leading-7 text-yellow-100">
        У вас пока нет подтверждённых покупок без отзыва.
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const active = String(item.id) === String(selectedId)

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(String(item.id))}
            className={`w-full rounded-[24px] border p-4 text-left transition ${
              active
                ? 'border-fuchsia-400/45 bg-fuchsia-700/10 shadow-[0_0_30px_rgba(168,85,247,0.12)]'
                : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/25 hover:bg-fuchsia-900/10'
            }`}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="break-words text-lg font-black text-white">
                  {item.plan_name}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <div className="rounded-full border border-fuchsia-500/15 bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-300">
                    {item.price_label}
                  </div>

                  <div className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-100">
                    Подтверждено
                  </div>
                </div>

                <div className="mt-3 text-sm text-zinc-500">
                  Дата подтверждения: {formatDateTime(item.approved_at)}
                </div>
              </div>

              <div
                className={`rounded-2xl border px-4 py-3 text-sm font-bold uppercase tracking-wide ${
                  active
                    ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-white'
                    : 'border-white/10 bg-black/30 text-zinc-300'
                }`}
              >
                {active ? 'Выбрано' : 'Выбрать'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CreateReviewCard({
  user,
  profile,
  creating,
  submitError,
  submitMessage,
  reviewText,
  rating,
  paymentRequestId,
  paymentOptions,
  selectedImages,
  onTextChange,
  onRatingChange,
  onPaymentRequestChange,
  onAddImages,
  onRemoveImage,
  onSubmit,
}) {
  const fileInputRef = useRef(null)
  const selectedPayment = paymentOptions.find(
    (item) => String(item.id) === String(paymentRequestId)
  )

  return (
    <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-8">
      <div>
        <h2 className="text-3xl font-black">Оставить отзыв</h2>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Отзыв можно оставить только после подтверждённой покупки. Можно прикрепить до{' '}
          {MAX_REVIEW_IMAGES_COUNT} изображений.
        </p>
      </div>

      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div>
          <label className="mb-3 block text-sm font-bold uppercase tracking-wide text-zinc-400">
            Выберите покупку
          </label>

          <PurchaseSelectList
            items={paymentOptions}
            selectedId={paymentRequestId}
            onSelect={onPaymentRequestChange}
          />
        </div>

        {selectedPayment ? (
          <div className="rounded-[24px] border border-fuchsia-500/15 bg-black/30 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Текущая покупка для отзыва
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-full border border-fuchsia-500/15 bg-fuchsia-700/10 px-3 py-2 text-sm font-bold text-white">
                {selectedPayment.plan_name}
              </div>

              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-zinc-300">
                {selectedPayment.price_label}
              </div>
            </div>
          </div>
        ) : null}

        <RatingInput value={rating} onChange={onRatingChange} />

        <div>
          <label className="mb-3 block text-sm font-bold uppercase tracking-wide text-zinc-400">
            Текст отзыва
          </label>

          <textarea
            value={reviewText}
            onChange={(e) => onTextChange(e.target.value)}
            rows={7}
            maxLength={3000}
            placeholder="Напишите подробный отзыв о покупке, качестве товара и вашем впечатлении"
            className="w-full resize-none rounded-2xl border border-fuchsia-500/20 bg-black/40 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/40"
          />

          <div className="mt-2 text-sm text-zinc-500">
            {reviewText.trim().length}/3000
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
            Изображения к отзыву
          </div>

          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={creating || selectedImages.length >= MAX_REVIEW_IMAGES_COUNT}
              className="rounded-[24px] border-2 border-dashed border-fuchsia-500/35 bg-fuchsia-900/10 px-5 py-8 text-center transition hover:border-fuchsia-400/45 hover:bg-fuchsia-900/15 disabled:opacity-60"
            >
              <div className="text-5xl text-fuchsia-500">⇧</div>
              <div className="mt-4 text-lg font-black text-white">
                Добавить изображения
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                До 3 файлов, до 6 МБ на файл
              </div>
            </button>

            {selectedImages.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedImages.map((item, index) => (
                  <div
                    key={item.previewKey || `${item.file?.name}-${index}`}
                    className="overflow-hidden rounded-[22px] border border-fuchsia-500/15 bg-black"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Предпросмотр ${index + 1}`}
                      className="h-[200px] w-full object-cover"
                    />

                    <div className="space-y-2 px-4 py-4">
                      <div className="break-all text-sm font-bold text-white">
                        {item.file?.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {item.width} × {item.height} · {formatFileSize(item.file?.size || 0)}
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveImage(index)}
                        className="mt-2 w-full rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-red-500/20"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[160px] items-center justify-center rounded-[24px] border border-fuchsia-500/15 bg-black/30 px-5 py-6 text-center text-zinc-500">
                Вы пока не добавили изображения
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              await onAddImages(files)
              e.target.value = ''
            }}
          />
        </div>

        {submitError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {submitError}
          </div>
        ) : null}

        {submitMessage ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-200">
            {submitMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
        >
          {creating ? 'Публикуем отзыв...' : 'Опубликовать отзыв'}
        </button>
      </form>
    </div>
  )
}

export default function ReviewsPage({ user, profile }) {
  const isAdmin = profile?.role === 'admin'

  const [publicReviews, setPublicReviews] = useState([])
  const [myReviews, setMyReviews] = useState([])
  const [adminReviews, setAdminReviews] = useState([])
  const [paymentOptions, setPaymentOptions] = useState([])

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [adminBusyId, setAdminBusyId] = useState(null)

  const [reviewText, setReviewText] = useState('')
  const [rating, setRating] = useState(5)
  const [paymentRequestId, setPaymentRequestId] = useState('')
  const [selectedImages, setSelectedImages] = useState([])

  const [submitError, setSubmitError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')

  const [avatarUrls, setAvatarUrls] = useState({})
  const requestedAvatarPathsRef = useRef(new Set())

  const [lightboxImages, setLightboxImages] = useState(null)
  const [lightboxStartIndex, setLightboxStartIndex] = useState(0)

  const [reviewsFilter, setReviewsFilter] = useState('all')

  const allReviewsForAvatarScan = useMemo(() => {
    const base = [...publicReviews]

    if (user) {
      base.push(...myReviews)
    }

    if (isAdmin) {
      base.push(...adminReviews)
    }

    return base
  }, [publicReviews, myReviews, adminReviews, user, isAdmin])

  const displayedReviews = useMemo(() => {
    if (reviewsFilter === 'mine' && user) {
      return myReviews
    }

    return publicReviews
  }, [reviewsFilter, user, myReviews, publicReviews])

  const loadAllData = useCallback(async () => {
    setLoading(true)

    try {
      const published = await fetchPublishedReviews(50)
      setPublicReviews(published)

      if (user) {
        const [reviewablePayments, ownReviews] = await Promise.all([
          fetchReviewablePaymentRequests(),
          fetchMyReviews(),
        ])

        setPaymentOptions(reviewablePayments)
        setMyReviews(ownReviews)
      } else {
        setPaymentOptions([])
        setMyReviews([])
      }

      if (isAdmin) {
        const allReviews = await fetchAllReviewsForAdmin()
        setAdminReviews(allReviews)
      } else {
        setAdminReviews([])
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  useEffect(() => {
    return () => {
      selectedImages.forEach((item) => {
        if (item?.previewUrl) {
          revokeReviewPreviewUrl(item.previewUrl)
        }
      })
    }
  }, [selectedImages])

  useEffect(() => {
    const uniquePaths = [
      ...new Set(
        allReviewsForAvatarScan
          .map((review) => review.avatar_path)
          .filter(Boolean)
          .filter((path) => !requestedAvatarPathsRef.current.has(path))
      ),
    ]

    if (!uniquePaths.length) return

    uniquePaths.forEach((path) => {
      requestedAvatarPathsRef.current.add(path)
    })

    Promise.all(
      uniquePaths.map(async (path) => ({
        path,
        url: await downloadAvatarAsObjectUrl(path),
      }))
    ).then((results) => {
      setAvatarUrls((prev) => {
        const next = { ...prev }

        results.forEach(({ path, url }) => {
          if (url) {
            next[path] = url
          }
        })

        return next
      })
    })
  }, [allReviewsForAvatarScan])

  useEffect(() => {
    if (!submitMessage) return
    const timer = setTimeout(() => setSubmitMessage(''), 3200)
    return () => clearTimeout(timer)
  }, [submitMessage])

  const handleAddImages = async (incomingFiles) => {
    setSubmitError('')
    setSubmitMessage('')

    const existingFiles = selectedImages.map((item) => item.file)
    const nextFiles = [...existingFiles, ...incomingFiles].slice(
      0,
      MAX_REVIEW_IMAGES_COUNT
    )

    const result = await inspectReviewImages(nextFiles)

    if (!result.ok) {
      setSubmitError(result.error || 'Не удалось обработать изображения')
      return
    }

    selectedImages.forEach((item) => {
      if (item?.previewUrl) {
        revokeReviewPreviewUrl(item.previewUrl)
      }
    })

    setSelectedImages(result.items)
  }

  const handleRemoveImage = (index) => {
    setSubmitError('')
    setSubmitMessage('')

    setSelectedImages((prev) => {
      const target = prev[index]
      if (target?.previewUrl) {
        revokeReviewPreviewUrl(target.previewUrl)
      }

      return prev.filter((_, currentIndex) => currentIndex !== index)
    })
  }

  const handleCreateReview = async () => {
    setSubmitError('')
    setSubmitMessage('')

    try {
      if (!user) {
        setSubmitError('Сначала войдите в аккаунт')
        return
      }

      await createReviewWithImages({
        userId: user.id,
        paymentRequestId,
        rating,
        reviewText,
        username: profile?.username || user.email || 'Пользователь',
        avatarPath: profile?.avatar_path || null,
        avatarShape: profile?.avatar_shape || null,
        imageItems: selectedImages,
      })

      selectedImages.forEach((item) => {
        if (item?.previewUrl) {
          revokeReviewPreviewUrl(item.previewUrl)
        }
      })

      setSelectedImages([])
      setReviewText('')
      setPaymentRequestId('')
      setRating(5)
      setSubmitMessage('Отзыв успешно опубликован')
      setReviewsFilter('mine')

      await loadAllData()
    } catch (error) {
      console.error(error)
      setSubmitError(error?.message || 'Не удалось сохранить отзыв')
    }
  }

  const handleHideReview = async (review) => {
    const comment = window.prompt(
      'При желании добавьте комментарий администратора:',
      review.admin_comment || ''
    )

    if (comment === null) return

    setAdminBusyId(review.id)

    try {
      await hideReview(review.id, comment || null)
      await loadAllData()
    } catch (error) {
      console.error(error)
    } finally {
      setAdminBusyId(null)
    }
  }

  const handlePublishReview = async (review) => {
    const comment = window.prompt(
      'При желании обновите комментарий администратора:',
      review.admin_comment || ''
    )

    if (comment === null) return

    setAdminBusyId(review.id)

    try {
      await publishReview(review.id, comment || null)
      await loadAllData()
    } catch (error) {
      console.error(error)
    } finally {
      setAdminBusyId(null)
    }
  }

  const handleDeleteReview = async (review) => {
    const confirmed = window.confirm(
      `Удалить отзыв пользователя ${review.username}? Это действие необратимо.`
    )

    if (!confirmed) return

    setAdminBusyId(review.id)

    try {
      await deleteReview(review.id)
      await loadAllData()
    } catch (error) {
      console.error(error)
    } finally {
      setAdminBusyId(null)
    }
  }

  const openImageLightbox = (images, index) => {
    setLightboxImages(images)
    setLightboxStartIndex(index)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-4xl font-black sm:text-5xl">Отзывы</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400 sm:text-lg">
              Здесь собраны реальные отзывы пользователей после подтверждённых покупок.
              Пользователи могут прикладывать изображения, а администратор может скрывать
              или удалять отзывы.
            </p>
          </div>

          <NavLink
            to="/"
            className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
          >
            На главную
          </NavLink>
        </div>

        {user ? (
          <div className="mt-8">
            <CreateReviewCard
              user={user}
              profile={profile}
              creating={creating}
              submitError={submitError}
              submitMessage={submitMessage}
              reviewText={reviewText}
              rating={rating}
              paymentRequestId={paymentRequestId}
              paymentOptions={paymentOptions}
              selectedImages={selectedImages}
              onTextChange={setReviewText}
              onRatingChange={setRating}
              onPaymentRequestChange={setPaymentRequestId}
              onAddImages={handleAddImages}
              onRemoveImage={handleRemoveImage}
              onSubmit={async () => {
                setCreating(true)
                try {
                  await handleCreateReview()
                } finally {
                  setCreating(false)
                }
              }}
            />
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-[28px] border border-fuchsia-500/15 bg-black/30 px-4 py-10 text-center text-zinc-300">
            Загружаем отзывы...
          </div>
        ) : (
          <>
            <div className="mt-10">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-black">
                  {reviewsFilter === 'mine' && user ? 'Мои отзывы' : 'Все отзывы'}
                </h2>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewsFilter('all')}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
                      reviewsFilter === 'all'
                        ? 'bg-fuchsia-600 text-white'
                        : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
                    }`}
                  >
                    Все отзывы ({publicReviews.length})
                  </button>

                  {user ? (
                    <button
                      type="button"
                      onClick={() => setReviewsFilter('mine')}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
                        reviewsFilter === 'mine'
                          ? 'bg-fuchsia-600 text-white'
                          : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
                      }`}
                    >
                      Мои отзывы ({myReviews.length})
                    </button>
                  ) : null}
                </div>
              </div>

              {displayedReviews.length === 0 ? (
                <div className="rounded-[28px] border border-fuchsia-500/15 bg-black/30 px-4 py-10 text-center text-zinc-500">
                  {reviewsFilter === 'mine' && user
                    ? 'У вас пока нет отзывов.'
                    : 'Публичных отзывов пока нет.'}
                </div>
              ) : (
                <div className="space-y-5">
                  {displayedReviews.map((review) => (
                    <ReviewCard
                      key={`${reviewsFilter}-${review.id}`}
                      review={review}
                      avatarUrl={
                        review.avatar_path ? avatarUrls[review.avatar_path] || '' : ''
                      }
                      isAdmin={false}
                      adminBusy={false}
                      onHide={() => {}}
                      onPublish={() => {}}
                      onDelete={() => {}}
                      onOpenImage={openImageLightbox}
                    />
                  ))}
                </div>
              )}
            </div>

            {isAdmin ? (
              <div className="mt-12">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h2 className="text-3xl font-black">Панель администратора отзывов</h2>

                  <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                    Всего: {adminReviews.length}
                  </div>
                </div>

                {adminReviews.length === 0 ? (
                  <div className="rounded-[28px] border border-fuchsia-500/15 bg-black/30 px-4 py-10 text-center text-zinc-500">
                    Отзывов пока нет.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {adminReviews.map((review) => (
                      <ReviewCard
                        key={`admin-${review.id}`}
                        review={review}
                        avatarUrl={
                          review.avatar_path ? avatarUrls[review.avatar_path] || '' : ''
                        }
                        isAdmin
                        adminBusy={adminBusyId === review.id}
                        onHide={handleHideReview}
                        onPublish={handlePublishReview}
                        onDelete={handleDeleteReview}
                        onOpenImage={openImageLightbox}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <ReviewImageLightbox
        images={lightboxImages}
        startIndex={lightboxStartIndex}
        onClose={() => {
          setLightboxImages(null)
          setLightboxStartIndex(0)
        }}
      />
    </div>
  )
}