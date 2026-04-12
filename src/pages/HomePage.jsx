import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { inspectReceiptImage, revokeReceiptPreviewUrl } from '../lib/receipt'
import { downloadPrivateImageAsObjectUrl } from '../lib/storage'
import { fetchPublishedReviews, fetchReviewsStats } from '../lib/reviews'
import {
  readDataCache,
  safeSupabase,
  writeDataCache,
} from '../lib/asyncData'

const WIDGET_STORAGE_KEY = 'velinor_widget_hidden_until'
const WIDGET_HIDE_HOURS = 12
const CARD_NUMBER = '2202 2088 0146 2053'

const ORDERS_CACHE_PREFIX = 'velinor_orders_cache_'
const PUBLIC_STATS_CACHE_KEY = 'velinor_public_stats_v1'
const REVIEWS_PREVIEW_CACHE_KEY = 'velinor_reviews_preview_v1'

const plans = [
  {
    id: 'start',
    title: 'Start',
    badge: 'Популярный',
    priceLabel: '299 ₽',
    accent: 'Базовый доступ',
    features: [
      'Стартовый набор материалов',
      'Регулярные обновления',
      'Более 120 материалов',
      'Подходит для первого знакомства',
    ],
  },
  {
    id: 'mix',
    title: 'Mix',
    badge: 'Популярный',
    priceLabel: '799 ₽',
    accent: 'Расширенный пакет',
    features: [
      'Несколько тематических разделов',
      'Еженедельные обновления',
      'Подборки и расширенные материалы',
      'Приоритетная поддержка',
    ],
  },
  {
    id: 'pro',
    title: 'Pro',
    badge: 'Pro',
    priceLabel: '1 499 ₽',
    accent: 'Полный доступ',
    features: [
      'Максимальный доступ ко всем разделам',
      'Эксклюзивные материалы',
      'Расширенные возможности кабинета',
      'Приоритетная обработка заявок',
    ],
  },
  {
    id: 'ultimate',
    title: 'Ultimate',
    badge: '∞',
    priceLabel: '4 999 ₽',
    accent: 'Всё включено',
    features: [
      'Все доступные пакеты в одном тарифе',
      'Пожизненный формат доступа',
      'Особые условия',
      'Максимум возможностей',
    ],
  },
]

const cryptoOptions = [
  { symbol: 'BTC', network: 'Bitcoin' },
  { symbol: 'ETH', network: 'ERC-20' },
  { symbol: 'USDT', network: 'TRC-20' },
  { symbol: 'TON', network: 'TON' },
]

const walletOptions = ['Bybit', 'Binance Pay', 'OKX', 'Trust Wallet']

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let success = false
  try {
    success = document.execCommand('copy')
  } catch {
    success = false
  }

  document.body.removeChild(textarea)
  return success
}

async function copyText(text, onSuccess, onFail) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      onSuccess()
      return
    }
  } catch {
    // fallback below
  }

  const copied = fallbackCopyText(text)
  if (copied) {
    onSuccess()
  } else {
    onFail()
  }
}

function isRestrictionActive(isBlocked, blockedUntil) {
  if (!isBlocked) return false
  if (!blockedUntil) return true

  const dateValue = new Date(blockedUntil).getTime()
  if (Number.isNaN(dateValue)) return true

  return dateValue > Date.now()
}

function formatRestrictionUntil(blockedUntil) {
  if (!blockedUntil) return 'срок не указан'

  const dateValue = new Date(blockedUntil)
  if (Number.isNaN(dateValue.getTime())) return 'срок не указан'

  return dateValue.toLocaleString('ru-RU')
}

function formatFileSize(size) {
  const safeSize = Number(size || 0)

  if (safeSize >= 1024 * 1024) {
    return `${(safeSize / (1024 * 1024)).toFixed(2)} МБ`
  }

  return `${Math.max(1, Math.round(safeSize / 1024))} КБ`
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return '—'
  }
}

function GlowButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] hover:shadow-[0_0_50px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="text-center">
      <h2 className="text-4xl font-black sm:text-6xl">{title}</h2>
      <div className="mx-auto mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500" />
      <p className="mt-5 text-lg text-fuchsia-400">{subtitle}</p>
    </div>
  )
}

function ModalShell({ open, title, onClose, children }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[24px] border border-fuchsia-500/25 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-fuchsia-500/15 px-4 py-4 sm:px-6 sm:py-5">
          <div className="pr-2 text-xl font-black leading-tight text-white sm:text-2xl">
            {title}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[calc(92vh-78px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function ImagePreviewModal({ item, loading, onClose }) {
  if (!item && !loading) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fuchsia-500/15 px-6 py-5">
          <div>
            <div className="text-2xl font-black text-white">
              {item?.title ?? 'Загрузка изображения'}
            </div>
            {item?.subtitle ? (
              <div className="mt-1 text-sm text-zinc-400">{item.subtitle}</div>
            ) : null}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-black text-zinc-300">
              Загружаем изображение...
            </div>
          ) : item?.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="max-h-[75vh] w-full rounded-[22px] border border-fuchsia-500/15 object-contain bg-black"
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-black text-zinc-500">
              Не удалось загрузить изображение
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getStatusLabel(status) {
  if (status === 'approved') return 'Успешно оплачено'
  if (status === 'rejected') return 'Отклонено'
  return 'На проверке'
}

export default function HomePage({ user, profile }) {
  const navigate = useNavigate()
  const receiptPreviewUrlRef = useRef('')

  const [isWidgetVisible, setIsWidgetVisible] = useState(false)
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false)
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false)
  const [isCryptoModalOpen, setIsCryptoModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(plans[0])
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [selectedCrypto, setSelectedCrypto] = useState('BTC')
  const [selectedWallet, setSelectedWallet] = useState('Bybit')
  const [uploadedReceipt, setUploadedReceipt] = useState(null)
  const [isReceiptDragActive, setIsReceiptDragActive] = useState(false)
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ordersTab, setOrdersTab] = useState('active')
  const [previewItem, setPreviewItem] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [siteStats, setSiteStats] = useState({
    clientsCount: 0,
    successRate: 0,
    reviewsCount: 0,
  })
  const [reviewsPreview, setReviewsPreview] = useState([])

  const paymentBlocked = isRestrictionActive(
    profile?.payment_is_blocked,
    profile?.payment_blocked_until
  )

  const paymentBlockedUntilText = formatRestrictionUntil(
    profile?.payment_blocked_until
  )

  useEffect(() => {
    const hiddenUntil = Number(localStorage.getItem(WIDGET_STORAGE_KEY) || 0)
    setIsWidgetVisible(Date.now() >= hiddenUntil)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    return () => {
      if (receiptPreviewUrlRef.current) {
        revokeReceiptPreviewUrl(receiptPreviewUrlRef.current)
      }
    }
  }, [])

  const replaceUploadedReceipt = useCallback((nextReceipt) => {
    setUploadedReceipt((prevReceipt) => {
      if (
        prevReceipt?.previewUrl &&
        prevReceipt.previewUrl !== nextReceipt?.previewUrl
      ) {
        revokeReceiptPreviewUrl(prevReceipt.previewUrl)
      }

      receiptPreviewUrlRef.current = nextReceipt?.previewUrl || ''
      return nextReceipt
    })
  }, [])

  const clearUploadedReceipt = useCallback(() => {
    replaceUploadedReceipt(null)
    setIsReceiptDragActive(false)
  }, [replaceUploadedReceipt])

  const closePurchaseModal = useCallback(() => {
    setIsPurchaseModalOpen(false)
    clearUploadedReceipt()
  }, [clearUploadedReceipt])

  const handleReceiptSelected = useCallback(
    async (file, mode = 'select') => {
      if (paymentBlocked) {
        setToast(`Покупки временно недоступны до ${paymentBlockedUntilText}`)
        return
      }

      const hadPreviousReceipt = Boolean(receiptPreviewUrlRef.current)

      const result = await inspectReceiptImage(file)

      if (!result.ok) {
        setToast(result.error || 'Не удалось обработать изображение')
        return
      }

      replaceUploadedReceipt({
        file,
        previewUrl: result.previewUrl,
        width: result.width,
        height: result.height,
        previewKey: `${Date.now()}_${Math.random()}`,
      })

      if (mode === 'select') {
        setToast('Скриншот загружен')
        return
      }

      if (mode === 'paste' && hadPreviousReceipt) {
        setToast('Скриншот заменён через Ctrl+V')
      }
    },
    [paymentBlocked, paymentBlockedUntilText, replaceUploadedReceipt]
  )

  useEffect(() => {
    if (!isPurchaseModalOpen) return

    const handlePaste = async (event) => {
      const items = Array.from(event.clipboardData?.items || [])
      const imageItem = items.find(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      )

      if (!imageItem) return

      const file = imageItem.getAsFile()
      if (!file) return

      event.preventDefault()
      await handleReceiptSelected(file, 'paste')
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [isPurchaseModalOpen, handleReceiptSelected])

  async function loadPublicStats() {
    const cachedStats = readDataCache(PUBLIC_STATS_CACHE_KEY, 3 * 60 * 1000)

    if (cachedStats) {
      setSiteStats(cachedStats)
    }

    if (!supabase) {
      if (!cachedStats) {
        setSiteStats({
          clientsCount: 0,
          successRate: 0,
          reviewsCount: 0,
        })
      }
      return
    }

    try {
      const [statsResult, reviewsStats] = await Promise.all([
        safeSupabase(() => supabase.rpc('get_public_site_stats'), {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Статистика сайта загружается слишком долго',
        }),
        fetchReviewsStats(),
      ])

      const { data, error } = statsResult

      if (error) {
        throw error
      }

      const row = Array.isArray(data) ? data[0] : data
      const totalRequests = Number(row?.total_requests ?? 0)
      const approvedRequests = Number(row?.approved_requests ?? 0)
      const uniqueBuyers = Number(row?.unique_buyers ?? 0)

      const successRate =
        totalRequests > 0 ? Math.round((approvedRequests / totalRequests) * 100) : 0

      const nextStats = {
        clientsCount: uniqueBuyers,
        successRate,
        reviewsCount: Number(reviewsStats?.published_reviews_count || 0),
      }

      setSiteStats(nextStats)
      writeDataCache(PUBLIC_STATS_CACHE_KEY, nextStats)
    } catch (error) {
      console.error(error)

      if (!cachedStats) {
        setSiteStats({
          clientsCount: 0,
          successRate: 0,
          reviewsCount: 0,
        })
      }
    }
  }

  async function loadReviewsPreview() {
    const cachedReviews = readDataCache(REVIEWS_PREVIEW_CACHE_KEY, 3 * 60 * 1000)

    if (cachedReviews) {
      setReviewsPreview(cachedReviews)
    }

    try {
      const items = await fetchPublishedReviews(3)
      setReviewsPreview(items)
      writeDataCache(REVIEWS_PREVIEW_CACHE_KEY, items)
    } catch (error) {
      console.error(error)
      if (!cachedReviews) {
        setReviewsPreview([])
      }
    }
  }

  useEffect(() => {
    loadPublicStats()
    loadReviewsPreview()
  }, [])

  const stats = useMemo(
    () => [
      { value: `${siteStats.clientsCount}+`, label: 'клиентов' },
      { value: `${siteStats.successRate}%`, label: 'успешных заявок' },
      { value: `${siteStats.reviewsCount}+`, label: 'отзывов' },
    ],
    [siteStats]
  )

  const closeWidget = () => {
    const nextShowTime = Date.now() + WIDGET_HIDE_HOURS * 60 * 60 * 1000
    localStorage.setItem(WIDGET_STORAGE_KEY, String(nextShowTime))
    setIsWidgetVisible(false)
  }

  const showSuccessCopy = (message) => setToast(message)
  const showFailCopy = () => setToast('Не удалось скопировать')

  const scrollToTariffs = () => {
    const el = document.getElementById('tariffs')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const openPurchaseModal = (plan) => {
    setSelectedPlan(plan)
    setPaymentMethod('card')
    clearUploadedReceipt()
    setIsPurchaseModalOpen(true)
  }

  const openReviewsPage = () => {
    navigate('/reviews')
  }

  const loadOrders = useCallback(async () => {
    if (!user) {
      setOrders([])
      setOrdersLoading(false)
      return
    }

    const cacheKey = `${ORDERS_CACHE_PREFIX}${user.id}`
    const cachedOrders = readDataCache(cacheKey, 90 * 1000)

    if (cachedOrders) {
      setOrders(cachedOrders)
      setOrdersLoading(false)
    } else {
      setOrdersLoading(true)
    }

    if (!supabase) {
      if (!cachedOrders) {
        setOrders([])
      }
      setOrdersLoading(false)
      return
    }

    try {
      const { data, error } = await safeSupabase(
        () =>
          supabase
            .from('payment_requests')
            .select(
              'id, user_id, username, plan_id, plan_name, price_label, image_path, status, created_at, reviewed_at, promo_code, admin_hidden'
            )
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Покупки загружаются слишком долго',
        }
      )

      if (error) {
        throw error
      }

      const nextOrders = data ?? []
      setOrders(nextOrders)
      writeDataCache(cacheKey, nextOrders)
    } catch (error) {
      console.error(error)
      if (!cachedOrders) {
        setOrders([])
        setToast(error?.message || 'Не удалось загрузить заказы')
      }
    } finally {
      setOrdersLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    const handleOpenOrders = async () => {
      setIsOrdersModalOpen(true)
      setOrdersTab('active')
      if (user) {
        await loadOrders()
      }
    }

    window.addEventListener('openPurchasesModal', handleOpenOrders)

    return () => {
      window.removeEventListener('openPurchasesModal', handleOpenOrders)
    }
  }, [user, loadOrders])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    await handleReceiptSelected(file, 'select')
    e.target.value = ''
  }

  const openOrderPreview = async (item) => {
    setPreviewLoading(true)
    setPreviewItem({
      title: `Скриншот: ${item.plan_name}`,
      subtitle: `Статус: ${getStatusLabel(item.status)}`,
      imageUrl: null,
    })

    try {
      const imageUrl = await downloadPrivateImageAsObjectUrl(item.image_path)

      setPreviewItem({
        title: `Скриншот: ${item.plan_name}`,
        subtitle: `Статус: ${getStatusLabel(item.status)}`,
        imageUrl,
      })
    } catch (error) {
      console.error(error)
      setPreviewItem({
        title: `Скриншот: ${item.plan_name}`,
        subtitle: `Статус: ${getStatusLabel(item.status)}`,
        imageUrl: null,
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const submitCardPurchase = async () => {
    if (!supabase) {
      setToast('Supabase не подключён')
      return
    }

    if (paymentBlocked) {
      setToast(`Покупки временно недоступны до ${paymentBlockedUntilText}`)
      return
    }

    if (!user || !profile) {
      setToast('Сначала войдите в аккаунт')
      setIsPurchaseModalOpen(false)
      navigate('/login')
      return
    }

    if (!uploadedReceipt?.file) {
      setToast('Сначала загрузите скриншот оплаты')
      return
    }

    setSubmitting(true)

    const safeName = uploadedReceipt.file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')

    const filePath = `${user.id}/${Date.now()}-${safeName}`

    try {
      const uploadResult = await safeSupabase(
        () =>
          supabase.storage
            .from('payment-screenshots')
            .upload(filePath, uploadedReceipt.file, {
              cacheControl: '3600',
              upsert: false,
              contentType: uploadedReceipt.file.type || 'image/png',
            }),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Загрузка скриншота заняла слишком много времени',
        }
      )

      if (uploadResult?.error) {
        throw uploadResult.error
      }

      const insertResult = await safeSupabase(
        () =>
          supabase.from('payment_requests').insert({
            user_id: user.id,
            username: profile.username,
            plan_id: selectedPlan.id,
            plan_name: selectedPlan.title,
            price_label: selectedPlan.priceLabel,
            image_path: filePath,
            admin_hidden: false,
          }),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Сохранение заявки заняло слишком много времени',
        }
      )

      if (insertResult?.error) {
        throw insertResult.error
      }

      await loadOrders()
      await loadPublicStats()
      setSubmitting(false)
      clearUploadedReceipt()
      setIsPurchaseModalOpen(false)
      setIsOrdersModalOpen(true)
      setOrdersTab('active')
      setToast('Заявка успешно отправлена')
    } catch (error) {
      console.error(error)
      setToast(error?.message || 'Не удалось отправить заявку')
      setSubmitting(false)
    }
  }

  const submitCryptoAttempt = () => {
    setIsCryptoModalOpen(false)
    setToast('Криптооплата пока недоступна в этой версии')
  }

  const activeOrders = orders.filter((item) => item.status === 'pending')

  const approvedGoods = orders.filter(
    (item) => item.status === 'approved' && item.promo_code
  )

  const archivedOrders = orders.filter(
    (item) => item.status === 'approved' || item.status === 'rejected'
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(147,51,234,0.18),transparent_35%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.12),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <section
          id="hero"
          className="scroll-mt-28 flex min-h-[72vh] items-center justify-center py-20 sm:py-28"
        >
          <div className="max-w-4xl text-center">
            <h1 className="text-5xl font-black leading-tight text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.18)] sm:text-7xl">
              Добро пожаловать в{' '}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                velinor
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-3xl text-xl leading-9 text-zinc-300 sm:text-2xl">
              Выберите тариф, оплатите удобным способом и отправьте заявку на проверку.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <GlowButton onClick={scrollToTariffs}>Перейти к тарифам</GlowButton>
              <button
                type="button"
                onClick={openReviewsPage}
                className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Смотреть отзывы
              </button>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-3xl border border-fuchsia-500/10 bg-zinc-950/80 p-8 shadow-[0_0_0_1px_rgba(168,85,247,0.04),0_0_40px_rgba(0,0,0,0.3)] transition hover:-translate-y-1 hover:border-fuchsia-500/30 hover:shadow-[0_0_40px_rgba(168,85,247,0.12)]"
                >
                  <div className="text-5xl font-black tracking-tight">{stat.value}</div>
                  <div className="mt-3 text-zinc-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tariffs" className="scroll-mt-28 py-20">
          <SectionTitle title="Доступные подписки" subtitle="Выберите подходящий тариф" />

          <div className="mt-14 grid gap-8 lg:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="relative h-full overflow-hidden rounded-[32px] border border-fuchsia-500/10 bg-black/70 p-8 shadow-[0_0_0_1px_rgba(168,85,247,0.05),0_20px_80px_rgba(0,0,0,0.45)] transition duration-300 hover:-translate-y-2 hover:border-fuchsia-400/30 hover:shadow-[0_0_60px_rgba(168,85,247,0.12)]"
              >
                <div className="absolute inset-x-10 top-0 h-24 rounded-b-full bg-fuchsia-600/10 blur-2xl" />

                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-fuchsia-500/20 bg-zinc-950 text-center text-xs uppercase tracking-widest text-fuchsia-300 shadow-[0_0_30px_rgba(168,85,247,0.18)]">
                      {plan.title}
                    </div>

                    <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[0_0_30px_rgba(168,85,247,0.25)]">
                      {plan.badge}
                    </span>
                  </div>

                  <h3 className="text-4xl font-black uppercase tracking-tight">{plan.title}</h3>
                  <p className="mt-3 text-fuchsia-300">{plan.accent}</p>

                  <ul className="mt-8 space-y-4 text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 leading-7">
                        <span className="mt-2 h-2 w-2 rounded-full bg-fuchsia-500 shadow-[0_0_12px_rgba(168,85,247,0.9)]" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-12 text-center">
                    <div className="text-5xl font-black text-fuchsia-500">
                      {plan.priceLabel}
                    </div>
                    <div className="mt-2 text-lg text-zinc-500">навсегда</div>

                    <GlowButton className="mt-10 w-full" onClick={() => openPurchaseModal(plan)}>
                      Купить подписку
                    </GlowButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="reviews-preview" className="scroll-mt-28 py-20">
          <SectionTitle
            title="Живые отзывы"
            subtitle="Публичные отзывы пользователей после подтверждённых покупок"
          />

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {reviewsPreview.length === 0 ? (
              <div className="col-span-full rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-10 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
                <div className="text-3xl font-black">Пока нет отзывов</div>
                <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
                  После подтверждённых покупок пользователи смогут оставлять отзывы с изображениями.
                </p>

                <GlowButton className="mt-8" onClick={openReviewsPage}>
                  Перейти к отзывам
                </GlowButton>
              </div>
            ) : (
              reviewsPreview.map((review) => (
                <div
                  key={review.id}
                  className="overflow-hidden rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-6 shadow-[0_0_50px_rgba(0,0,0,0.35)]"
                >
                  {review.review_images?.[0]?.image_url ? (
                    <div className="overflow-hidden rounded-[22px] border border-fuchsia-500/15 bg-black">
                      <img
                        src={review.review_images[0].image_url}
                        alt={review.username}
                        className="h-[220px] w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="break-all text-xl font-black text-white">
                        {review.username}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {formatDateTime(review.created_at)}
                      </div>
                    </div>

                    <div className="mt-4 line-clamp-6 whitespace-pre-wrap text-base leading-8 text-zinc-300">
                      {review.review_text}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-10 flex justify-center">
            <GlowButton onClick={openReviewsPage}>Открыть все отзывы</GlowButton>
          </div>
        </section>

        <section id="how-to-buy" className="scroll-mt-28 py-20">
          <SectionTitle title="Как купить подписку" subtitle="Простой процесс покупки за 3 шага" />

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            <div className="relative rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="absolute -top-5 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-fuchsia-900 text-2xl font-black shadow-[0_0_30px_rgba(168,85,247,0.25)]">
                1
              </div>
              <h3 className="mt-8 text-2xl font-black">Выберите тариф</h3>
              <p className="mt-4 text-lg leading-8 text-zinc-400">
                Нажмите кнопку «Купить» на понравившемся тарифе.
              </p>
            </div>

            <div className="relative rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="absolute -top-5 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-fuchsia-900 text-2xl font-black shadow-[0_0_30px_rgba(168,85,247,0.25)]">
                2
              </div>
              <h3 className="mt-8 text-2xl font-black">Оплатите</h3>
              <p className="mt-4 text-lg leading-8 text-zinc-400">
                Загрузите скриншот после перевода и отправьте заявку на проверку.
              </p>
            </div>

            <div className="relative rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="absolute -top-5 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-fuchsia-900 text-2xl font-black shadow-[0_0_30px_rgba(168,85,247,0.25)]">
                3
              </div>
              <h3 className="mt-8 text-2xl font-black">Получите доступ</h3>
              <p className="mt-4 text-lg leading-8 text-zinc-400">
                После проверки заявки пользователь получит доступ в свой аккаунт.
              </p>
            </div>
          </div>
        </section>

        <section id="support" className="scroll-mt-28 py-20">
          <SectionTitle
            title="Поддержка"
            subtitle="Мы всегда готовы помочь вам с выбором и оплатой"
          />

          <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-3">
            <div className="rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-600 text-2xl text-white">
                ✈
              </div>
              <h3 className="mt-8 text-2xl font-black">Telegram</h3>
              <p className="mt-4 text-zinc-400">@VelynoriusBot</p>
              <button
                onClick={() =>
                  copyText(
                    '@VelynoriusBot',
                    () => showSuccessCopy('Telegram скопирован'),
                    showFailCopy
                  )
                }
                className="mt-6 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Скопировать
              </button>
            </div>

            <div className="rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-600 text-2xl text-white">
                @
              </div>
              <h3 className="mt-8 text-2xl font-black">Email</h3>
              <p className="mt-4 text-zinc-400">rivertfox61@gmail.com</p>
              <button
                onClick={() =>
                  copyText(
                    'rivertfox61@gmail.com',
                    () => showSuccessCopy('Email скопирован'),
                    showFailCopy
                  )
                }
                className="mt-6 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Скопировать
              </button>
            </div>

            <div className="rounded-[30px] border border-fuchsia-500/10 bg-black/70 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.35)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-600 text-2xl text-white">
                ⏰
              </div>
              <h3 className="mt-8 text-2xl font-black">Время работы</h3>
              <p className="mt-4 text-zinc-300">Круглосуточно</p>
              <p className="mt-4 text-zinc-400">Ответ в течение 1 часа</p>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-col items-center justify-between gap-6 border-t border-fuchsia-500/15 py-10 text-zinc-400 sm:flex-row">
          <div className="flex items-center gap-3 text-xl font-bold text-fuchsia-500">
            ✦ velinor
          </div>
          <div>© 2026 velinor. Все права защищены.</div>
        </footer>
      </main>

      {isWidgetVisible ? (
        <div className="fixed bottom-4 right-4 z-30 hidden w-[260px] rounded-3xl border border-cyan-400/20 bg-cyan-900/90 p-4 text-white shadow-[0_0_45px_rgba(34,211,238,0.18)] backdrop-blur-xl lg:block">
          <button
            onClick={closeWidget}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm text-white transition hover:bg-white/20"
          >
            ✕
          </button>

          <div className="flex items-start gap-3 pr-7">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm">
              ✈
            </div>

            <div>
              <div className="text-base font-bold">Акции и новости</div>
              <p className="mt-1 text-sm font-semibold text-cyan-50">@VelynoriusBot</p>
              <p className="mt-2 text-xs leading-5 text-cyan-100/80">
                Подписывайтесь, чтобы видеть обновления, бонусы и новые предложения.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <ModalShell
        open={isPurchaseModalOpen}
        title={`Оплата: ${selectedPlan.title}`}
        onClose={closePurchaseModal}
      >
        <div className="space-y-6">
          {!user ? (
            <div className="rounded-[22px] border border-yellow-600/30 bg-yellow-500/10 p-4 text-yellow-100/90">
              Чтобы отправить заявку на проверку, сначала войдите в аккаунт.
              <button
                onClick={() => {
                  closePurchaseModal()
                  navigate('/login')
                }}
                className="mt-4 block rounded-xl border border-yellow-300/20 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
              >
                Перейти ко входу
              </button>
            </div>
          ) : null}

          {paymentBlocked ? (
            <div className="rounded-[22px] border border-red-500/20 bg-red-500/10 p-4 text-red-200">
              Отправка новых заявок на оплату временно недоступна.
              <br />
              Срок ограничения до: {paymentBlockedUntilText}
            </div>
          ) : null}

          <div className="rounded-[22px] border border-fuchsia-500/20 bg-fuchsia-950/20 p-5">
            <div className="text-2xl font-black">
              Тариф: <span className="text-fuchsia-400">{selectedPlan.title}</span>
            </div>
            <div className="mt-3 text-2xl font-black">
              Цена: <span className="text-fuchsia-400">{selectedPlan.priceLabel}</span>
            </div>
          </div>

          <div>
            <div className="mb-4 text-2xl font-black">Выберите способ оплаты:</div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setPaymentMethod('card')}
                className={`rounded-2xl border px-4 py-4 text-lg transition ${
                  paymentMethod === 'card'
                    ? 'border-fuchsia-500 bg-fuchsia-700/10 text-fuchsia-300'
                    : 'border-yellow-200/40 bg-white/5 text-zinc-300'
                }`}
              >
                Банковская карта
              </button>

              <button
                onClick={() => {
                  setPaymentMethod('crypto')
                  setIsCryptoModalOpen(true)
                }}
                className={`rounded-2xl border px-4 py-4 text-lg transition ${
                  paymentMethod === 'crypto'
                    ? 'border-fuchsia-500 bg-fuchsia-700/10 text-fuchsia-300'
                    : 'border-yellow-200/40 bg-white/5 text-zinc-300'
                }`}
              >
                Криптовалюта
              </button>
            </div>
          </div>

          <div className="rounded-[22px] border border-fuchsia-500/20 bg-white/[0.02] p-5">
            <div className="text-xl text-zinc-300">Переведите точную сумму на карту:</div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 rounded-2xl bg-[#0d0d1f] px-5 py-4 text-lg tracking-[0.15em]">
                {CARD_NUMBER}
              </div>

              <button
                onClick={() =>
                  copyText(
                    CARD_NUMBER,
                    () => showSuccessCopy('Номер карты скопирован'),
                    showFailCopy
                  )
                }
                className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-700/10 px-6 py-4 text-lg text-fuchsia-400 transition hover:border-fuchsia-400/50"
              >
                Копировать
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-yellow-600/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100/80">
              Важно: переведите точную сумму, указанную выше
            </div>
          </div>

          <div>
            <div className="mb-4 text-2xl font-black">Загрузите скриншот оплаты</div>

            {!uploadedReceipt ? (
              <label
                onDragOver={(event) => {
                  event.preventDefault()
                  if (paymentBlocked) return
                  setIsReceiptDragActive(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setIsReceiptDragActive(false)
                }}
                onDrop={async (event) => {
                  event.preventDefault()
                  setIsReceiptDragActive(false)

                  if (paymentBlocked) {
                    setToast(`Покупки временно недоступны до ${paymentBlockedUntilText}`)
                    return
                  }

                  const file = event.dataTransfer?.files?.[0]
                  if (!file) return

                  await handleReceiptSelected(file, 'select')
                }}
                className={`flex min-h-[200px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed p-6 text-center transition ${
                  paymentBlocked
                    ? 'cursor-not-allowed border-fuchsia-600/30 bg-fuchsia-900/5 opacity-60'
                    : isReceiptDragActive
                      ? 'cursor-pointer border-fuchsia-400 bg-fuchsia-900/20'
                      : 'cursor-pointer border-fuchsia-600/50 bg-fuchsia-900/10 hover:bg-fuchsia-900/15'
                }`}
              >
                <div className="text-5xl text-fuchsia-500">⇧</div>
                <div className="mt-5 max-w-md text-2xl text-zinc-300">
                  Перетащите сюда скриншот или нажмите для выбора
                </div>
                <div className="mt-3 text-sm text-zinc-500">
                  После выбора блок загрузки исчезнет
                </div>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={paymentBlocked}
                  onChange={handleFileChange}
                />
              </label>
            ) : null}

            {uploadedReceipt ? (
              <div className="rounded-[24px] border border-fuchsia-500/20 bg-white/[0.02] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-black text-white">
                      Загруженное изображение
                    </div>
                    <div className="mt-1 break-all text-sm text-zinc-400">
                      {uploadedReceipt.file.name}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearUploadedReceipt}
                    className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-red-500/20"
                  >
                    Удалить
                  </button>
                </div>

                <div
                  key={uploadedReceipt.previewKey}
                  className="mt-4 overflow-hidden rounded-[22px] border border-fuchsia-500/15 bg-black"
                >
                  <img
                    src={uploadedReceipt.previewUrl}
                    alt="Предпросмотр скриншота оплаты"
                    className="max-h-[460px] w-full object-contain bg-black"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <div>Размер файла: {formatFileSize(uploadedReceipt.file.size)}</div>
                  <div>
                    Разрешение: {uploadedReceipt.width} × {uploadedReceipt.height}
                  </div>
                  <div>Формат: {uploadedReceipt.file.type || 'image/*'}</div>
                </div>

                <div className="mt-4 rounded-2xl border border-fuchsia-500/15 bg-black/30 px-4 py-3 text-sm text-zinc-400">
                  Чтобы заменить изображение, удалите текущее или вставьте новое через Ctrl+V.
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={closePurchaseModal}
              className="rounded-2xl border border-white/10 px-6 py-4 text-lg font-extrabold uppercase tracking-wide text-zinc-200 transition hover:bg-white/5"
            >
              Отмена
            </button>

            <GlowButton disabled={submitting || paymentBlocked} onClick={submitCardPurchase}>
              {paymentBlocked
                ? 'Покупка временно недоступна'
                : submitting
                  ? 'Отправляем...'
                  : 'Отправить на проверку'}
            </GlowButton>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={isOrdersModalOpen}
        title="Мои покупки"
        onClose={() => setIsOrdersModalOpen(false)}
      >
        {!user ? (
          <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-10 text-center">
            <div className="text-3xl font-black">Войдите в аккаунт</div>
            <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-zinc-400">
              Раздел с покупками доступен только после входа.
            </p>

            <GlowButton
              className="mt-8"
              onClick={() => {
                setIsOrdersModalOpen(false)
                navigate('/login')
              }}
            >
              Перейти ко входу
            </GlowButton>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:flex">
                <button
                  onClick={() => setOrdersTab('active')}
                  className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
                    ordersTab === 'active'
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
                  }`}
                >
                  Активные заказы
                </button>

                <button
                  onClick={() => setOrdersTab('goods')}
                  className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
                    ordersTab === 'goods'
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
                  }`}
                >
                  Полученные товары
                </button>

                <button
                  onClick={() => setOrdersTab('archive')}
                  className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
                    ordersTab === 'archive'
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
                  }`}
                >
                  Архив
                </button>
              </div>

              <button
                onClick={loadOrders}
                className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Обновить
              </button>
            </div>

            {ordersLoading ? (
              <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-10 text-center text-lg text-zinc-300">
                Загружаем данные...
              </div>
            ) : ordersTab === 'active' ? (
              activeOrders.length === 0 ? (
                <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-10 text-center">
                  <div className="text-3xl font-black">Активных заказов нет</div>
                  <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-zinc-400">
                    Здесь будут отображаться все заявки, которые ещё находятся на проверке.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeOrders.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-5"
                    >
                      <div className="grid gap-5 lg:grid-cols-[1.4fr_220px]">
                        <div className="space-y-3">
                          <div className="break-words text-2xl font-black leading-tight sm:text-3xl">
                            {item.plan_name}
                          </div>
                          <div className="break-words text-base text-zinc-300 sm:text-lg">
                            Сумма: {item.price_label}
                          </div>
                          <div className="break-words text-base text-zinc-300 sm:text-lg">
                            Статус: {getStatusLabel(item.status)}
                          </div>
                          <div className="text-base text-zinc-500">
                            Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                          </div>
                        </div>

                        <button
                          onClick={() => openOrderPreview(item)}
                          className="flex min-h-[140px] w-full items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-[#09090f] p-4 text-center text-lg font-black uppercase leading-tight tracking-wide text-fuchsia-400 transition hover:border-fuchsia-400/30 hover:bg-fuchsia-950/20 sm:min-h-[180px] sm:p-6 sm:text-2xl"
                        >
                          Скриншот
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : ordersTab === 'goods' ? (
              approvedGoods.length === 0 ? (
                <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-10 text-center">
                  <div className="text-3xl font-black">Пока нет товаров</div>
                  <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-zinc-400">
                    После подтверждения оплаты здесь появятся ваши полученные товары.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {approvedGoods.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-5"
                    >
                      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
                        <div className="space-y-3">
                          <div className="break-words text-xl font-black leading-tight text-white sm:text-2xl">
                            {item.plan_name}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                              <div className="text-xs uppercase tracking-wide text-zinc-500">
                                Стоимость
                              </div>
                              <div className="mt-2 text-base font-bold">
                                {item.price_label}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                              <div className="text-xs uppercase tracking-wide text-zinc-500">
                                Дата подтверждения
                              </div>
                              <div className="mt-2 text-base font-bold">
                                {new Date(item.reviewed_at || item.created_at).toLocaleString(
                                  'ru-RU'
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-emerald-300/20 bg-black/20 px-4 py-4">
                            <div className="text-xs uppercase tracking-wide text-emerald-200">
                              Промокод / товар
                            </div>
                            <div className="mt-2 break-all text-lg font-black text-white">
                              {item.promo_code}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            copyText(
                              item.promo_code,
                              () => showSuccessCopy('Промокод скопирован'),
                              showFailCopy
                            )
                          }
                          className="rounded-xl border border-emerald-300/20 bg-black/20 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white"
                        >
                          Скопировать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : archivedOrders.length === 0 ? (
              <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-10 text-center">
                <div className="text-3xl font-black">Архив пуст</div>
                <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-zinc-400">
                  Здесь будут находиться завершённые и отклонённые заказы.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {archivedOrders.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-5"
                  >
                    <div className="grid gap-5 lg:grid-cols-[1.4fr_220px]">
                      <div className="space-y-3">
                        <div className="break-words text-2xl font-black leading-tight sm:text-3xl">
                          {item.plan_name}
                        </div>
                        <div className="break-words text-base text-zinc-300 sm:text-lg">
                          Сумма: {item.price_label}
                        </div>
                        <div className="break-words text-base text-zinc-300 sm:text-lg">
                          Статус: {getStatusLabel(item.status)}
                        </div>
                        <div className="text-base text-zinc-500">
                          Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                        </div>
                      </div>

                      <button
                        onClick={() => openOrderPreview(item)}
                        className="flex min-h-[140px] w-full items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-[#09090f] p-4 text-center text-lg font-black uppercase leading-tight tracking-wide text-fuchsia-400 transition hover:border-fuchsia-400/30 hover:bg-fuchsia-950/20 sm:min-h-[180px] sm:p-6 sm:text-2xl"
                      >
                        Скриншот
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ModalShell>

      <ModalShell
        open={isCryptoModalOpen}
        title="Криптовалюта"
        onClose={() => setIsCryptoModalOpen(false)}
      >
        <div className="space-y-6">
          <div className="rounded-[22px] border border-yellow-600/30 bg-yellow-500/10 p-4 text-yellow-100/90">
            Этот раздел показан как демонстрация интерфейса. В текущей версии криптооплата
            не работает.
          </div>

          <div>
            <div className="mb-3 text-xl font-black">Выберите криптовалюту</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {cryptoOptions.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => setSelectedCrypto(item.symbol)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selectedCrypto === item.symbol
                      ? 'border-fuchsia-500 bg-fuchsia-700/10'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="text-lg font-black">{item.symbol}</div>
                  <div className="mt-1 text-sm text-zinc-400">Сеть: {item.network}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 text-xl font-black">Выберите кошелёк / криптобанк</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {walletOptions.map((wallet) => (
                <button
                  key={wallet}
                  onClick={() => setSelectedWallet(wallet)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selectedWallet === wallet
                      ? 'border-fuchsia-500 bg-fuchsia-700/10'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="text-lg font-bold">{wallet}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5">
            <div className="text-lg text-zinc-300">
              Выбрано: <span className="font-black text-fuchsia-400">{selectedCrypto}</span>{' '}
              через <span className="font-black text-fuchsia-400">{selectedWallet}</span>
            </div>

            <div className="mt-3 text-zinc-400">
              Здесь позже можно будет показать адрес кошелька, QR-код и расчёт суммы.
            </div>
          </div>

          <GlowButton className="w-full" onClick={submitCryptoAttempt}>
            Уже оплатил
          </GlowButton>
        </div>
      </ModalShell>

      <ImagePreviewModal
        item={previewItem}
        loading={previewLoading}
        onClose={() => {
          setPreviewItem(null)
          setPreviewLoading(false)
        }}
      />

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-fuchsia-500/30 bg-[#111127] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_40px_rgba(168,85,247,0.25)]">
          {toast}
        </div>
      ) : null}
    </div>
  )
}