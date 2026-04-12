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

function StarIcon({ fillPercent = 0 }) {
  return (
    <div className="relative h-8 w-8 text-zinc-700">
      <span className="absolute inset-0 text-[32px] leading-none">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-[32px] leading-none text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.55)]"
        style={{ width: `${fillPercent}%` }}
      >
        ★
      </span>
    </div>
  )
}

function RatingStars({ value, onChange, readonly = false, size = 'normal' }) {
  const safeValue = Number(value || 0)
  const starClass = size === 'small' ? 'h-6 w-6' : 'h-8 w-8'
  const numberClass =
    size === 'small'
      ? 'ml-2 text-xs font-bold text-yellow-300'
      : 'ml-2 text-sm font-bold text-yellow-300'

  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((starNumber) => {
        let fillPercent = 0

        if (safeValue >= starNumber) {
          fillPercent = 100
        } else if (safeValue >= starNumber - 0.5) {
          fillPercent = 50
        }

        return (
          <div key={starNumber} className={`relative ${starClass}`}>
            {!readonly ? (
              <>
                <button
                  type="button"
                  onClick={() => onChange(starNumber - 0.5)}
                  className="absolute inset-y-0 left-0 z-10 w-1/2"
                  aria-label={`Поставить ${starNumber - 0.5} звезды`}
                />
                <button
                  type="button"
                  onClick={() => onChange(starNumber)}
                  className="absolute inset-y-0 right-0 z-10 w-1/2"
                  aria-label={`Поставить ${starNumber} звезды`}
                />
              </>
            ) : null}

            <StarIcon fillPercent={fillPercent} />
          </div>
        )
      })}

      <div className={numberClass}>{safeValue.toFixed(1)}</div>
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
  const isHidden = review.status === 'hidden'

  return (
    <div
      className={`rounded-[28px] border p-5 sm:p-6 ${
        isHidden
          ? 'border-yellow-500/20 bg-yellow-500/10'
          : 'border-fuchsia-500/15 bg-zinc-950/80'
      }`}
    >
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

              <div className="mt-2">
                <RatingStars value={review.rating || 5} readonly size="small" />
              </div>

              <div className="mt-2 text-sm text-zinc-500">
                {formatDateTime(review.created_at)}
              </div>
            </div>

            <div
              className={`rounded-2xl border px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                isHidden
                  ? 'border-yellow-400/20 bg-yellow-500/10 text-yellow-100'
                  : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
              }`}
            >
              {isHidden ? 'Скрыт' : 'Опубликован'}
            </div>
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
              {isHidden ? (
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

  return (
    <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-black">Оставить отзыв</h2>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Один отзыв можно оставить на одну подтверждённую покупку. Можно прикрепить до{' '}
            {MAX_REVIEW_IMAGES_COUNT} изображений.
          </p>
        </div>

        <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
          {profile?.username || user?.email || 'Пользователь'}
        </div>
      </div>

      {paymentOptions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-5 text-sm leading-7 text-yellow-100">
          У вас пока нет подтверждённых покупок без отзыва. Как только появится подтверждённая покупка,
          вы сможете оставить отзыв.
        </div>
      ) : (
        <form
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <div>
            <label className="mb-3 block text-sm font-bold uppercase tracking-wide text-zinc-400">
              Покупка для отзыва
            </label>

            <div className="grid gap-3">
              {paymentOptions.map((item) => {
                const active = String(item.id) === String(paymentRequestId)

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPaymentRequestChange(String(item.id))}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      active
                        ? 'border-fuchsia-400/40 bg-fuchsia-700/10'
                        : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/25 hover:bg-fuchsia-900/10'
                    }`}
                  >
                    <div className="text-lg font-black text-white">{item.plan_name}</div>
                    <div className="mt-2 text-sm text-zinc-400">{item.price_label}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {formatDateTime(item.approved_at || item.reviewed_at || item.created_at)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
              Оценка
            </div>

            <div className="rounded-[24px] border border-fuchsia-500/15 bg-black/30 px-4 py-4">
              <RatingStars value={rating} onChange={onRatingChange} />
            </div>
          </div>

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
      )}
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
  const [reviewsView, setReviewsView] = useState('public')

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

  const loadAllData = useCallback(async () => {
    setLoading(true)

    try {
      const [publicResult, userResult, adminResult] = await Promise.all([
        fetchPublishedReviews(50),
        user
          ? Promise.all([fetchReviewablePaymentRequests(), fetchMyReviews()])
          : Promise.resolve([[], []]),
        isAdmin ? fetchAllReviewsForAdmin() : Promise.resolve([]),
      ])

      setPublicReviews(publicResult)
      setPaymentOptions(userResult[0] || [])
      setMyReviews(userResult[1] || [])
      setAdminReviews(adminResult || [])
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

  const visibleReviews = useMemo(() => {
    if (reviewsView === 'mine') return myReviews
    if (reviewsView === 'admin') return adminReviews
    return publicReviews
  }, [reviewsView, publicReviews, myReviews, adminReviews])

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
      setRating(5)
      setPaymentRequestId('')
      setSubmitMessage('Отзыв успешно опубликован')

      await loadAllData()
      if (user) {
        setReviewsView('mine')
      }
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
          </div>

          <NavLink
            to="/"
            className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
          >
            На главную
          </NavLink>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setReviewsView('public')}
            className={`rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition ${
              reviewsView === 'public'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
            }`}
          >
            Публичные отзывы
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => setReviewsView('mine')}
              className={`rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition ${
                reviewsView === 'mine'
                  ? 'bg-fuchsia-600 text-white'
                  : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
              }`}
            >
              Мои отзывы
            </button>
          ) : null}

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setReviewsView('admin')}
              className={`rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition ${
                reviewsView === 'admin'
                  ? 'bg-fuchsia-600 text-white'
                  : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
              }`}
            >
              Админ режим
            </button>
          ) : null}
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
          <div className="mt-10">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-black">
                {reviewsView === 'mine'
                  ? 'Мои отзывы'
                  : reviewsView === 'admin'
                    ? 'Панель администратора отзывов'
                    : 'Публичные отзывы'}
              </h2>

              <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                Всего: {visibleReviews.length}
              </div>
            </div>

            {visibleReviews.length === 0 ? (
              <div className="rounded-[28px] border border-fuchsia-500/15 bg-black/30 px-4 py-10 text-center text-zinc-500">
                {reviewsView === 'mine'
                  ? 'Вы пока не оставляли отзывы.'
                  : reviewsView === 'admin'
                    ? 'Отзывов пока нет.'
                    : 'Публичных отзывов пока нет.'}
              </div>
            ) : (
              <div className="space-y-5">
                {visibleReviews.map((review) => (
                  <ReviewCard
                    key={`${reviewsView}-${review.id}`}
                    review={review}
                    avatarUrl={
                      review.avatar_path ? avatarUrls[review.avatar_path] || '' : ''
                    }
                    isAdmin={reviewsView === 'admin'}
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