import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { downloadPrivateImageAsObjectUrl } from '../lib/storage'
import {
  STRIKE_REASON_OPTIONS,
  getDefaultStrikeReasonCode,
  getStrikeReasonLabel,
} from '../lib/violations'

function generatePromoCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'VEL-'
  for (let i = 0; i < 10; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return result
}

function ImagePreviewModal({ item, loading, onClose }) {
  if (!item && !loading) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fuchsia-500/15 px-6 py-5">
          <div>
            <div className="text-2xl font-black text-white">
              {item?.username ?? 'Загрузка'}
            </div>
            {item?.plan_name ? (
              <div className="mt-1 text-sm text-zinc-400">
                {item.plan_name} · {item.price_label}
              </div>
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
              alt={`Скриншот оплаты ${item.username}`}
              className="max-h-[75vh] w-full rounded-[22px] border border-fuchsia-500/15 bg-black object-contain"
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

function StrikeModal({
  open,
  item,
  reasonCode,
  reasonText,
  onReasonCodeChange,
  onReasonTextChange,
  onClose,
  onConfirm,
  processing,
}) {
  if (!open || !item) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-fuchsia-500/15 px-6 py-5">
          <div className="text-2xl font-black text-white">
            Отклонить заявку со страйком
          </div>
          <div className="mt-2 text-sm leading-6 text-zinc-400">
            Пользователь: <span className="font-semibold text-white">{item.username}</span>
            <br />
            Тариф: <span className="font-semibold text-white">{item.plan_name}</span>
          </div>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
              Выберите причину
            </div>

            <div className="grid gap-3">
              {STRIKE_REASON_OPTIONS.map((option) => {
                const active = option.code === reasonCode

                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => onReasonCodeChange(option.code)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-fuchsia-400/50 bg-fuchsia-700/15'
                        : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/35 hover:bg-fuchsia-900/10'
                    }`}
                  >
                    <div className="text-base font-black text-white">
                      {option.label}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {option.description}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-zinc-400">
              Комментарий администратора
            </label>

            <textarea
              value={reasonText}
              onChange={(e) => onReasonTextChange(e.target.value)}
              rows={4}
              placeholder="Можно уточнить причину, если нужно."
              className="w-full resize-none rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/10 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-zinc-200 transition hover:bg-white/5"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={processing}
              className="rounded-2xl border border-red-400/20 bg-red-500/10 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
            >
              {processing ? 'Применяем...' : 'Отклонить и выдать страйк'}
            </button>
          </div>
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

export default function RequestsPage() {
  const [requests, setRequests] = useState([])
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(true)
  const [violationsLoading, setViolationsLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [requestsTab, setRequestsTab] = useState('pending')
  const [clearingArchive, setClearingArchive] = useState(false)
  const [pageMessage, setPageMessage] = useState('')
  const [pageError, setPageError] = useState('')

  const [strikeModalItem, setStrikeModalItem] = useState(null)
  const [strikeReasonCode, setStrikeReasonCode] = useState(getDefaultStrikeReasonCode())
  const [strikeReasonText, setStrikeReasonText] = useState('')

  const pendingRequests = useMemo(
    () => requests.filter((item) => item.status === 'pending'),
    [requests]
  )

  const archivedRequests = useMemo(
    () => requests.filter((item) => item.status === 'approved' || item.status === 'rejected'),
    [requests]
  )

  useEffect(() => {
    if (!pageMessage) return
    const timer = setTimeout(() => setPageMessage(''), 2800)
    return () => clearTimeout(timer)
  }, [pageMessage])

  useEffect(() => {
    if (!pageError) return
    const timer = setTimeout(() => setPageError(''), 3200)
    return () => clearTimeout(timer)
  }, [pageError])

  const loadRequests = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('payment_requests')
      .select(
        'id, user_id, username, plan_name, price_label, image_path, status, created_at, promo_code'
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setRequests([])
      setLoading(false)
      return
    }

    setRequests(data ?? [])
    setLoading(false)
  }

  const loadViolations = async () => {
    if (!supabase) {
      setViolationsLoading(false)
      return
    }

    setViolationsLoading(true)

    const { data, error } = await supabase
      .from('violations')
      .select(
        'id, user_id, username_snapshot, admin_user_id, source_type, request_id, reason_code, reason_text, created_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setViolations([])
      setViolationsLoading(false)
      return
    }

    setViolations(data ?? [])
    setViolationsLoading(false)
  }

  useEffect(() => {
    loadRequests()
    loadViolations()
  }, [])

  const openPreview = async (item) => {
    setPreviewLoading(true)
    setSelectedRequest({
      ...item,
      imageUrl: null,
    })

    const imageUrl = await downloadPrivateImageAsObjectUrl(item.image_path)

    setSelectedRequest({
      ...item,
      imageUrl,
    })
    setPreviewLoading(false)
  }

  const approvePayment = async (item) => {
    const code = item.promo_code || generatePromoCode()
    setProcessingId(item.id)
    setPageMessage('')
    setPageError('')

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'approved',
        promo_code: code,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      setPageError('Не удалось подтвердить оплату')
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? { ...request, status: 'approved', promo_code: code }
          : request
      )
    )

    setProcessingId(null)
    setPageMessage('Оплата подтверждена')
  }

  const rejectPayment = async (item) => {
    setProcessingId(item.id)
    setPageMessage('')
    setPageError('')

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'rejected',
        promo_code: null,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      setPageError('Не удалось отклонить заявку')
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? { ...request, status: 'rejected', promo_code: null }
          : request
      )
    )

    setProcessingId(null)
    setPageMessage('Заявка отклонена без страйка')
  }

  const openStrikeModal = (item) => {
    setStrikeModalItem(item)
    setStrikeReasonCode(getDefaultStrikeReasonCode())
    setStrikeReasonText('')
  }

  const closeStrikeModal = () => {
    setStrikeModalItem(null)
    setStrikeReasonCode(getDefaultStrikeReasonCode())
    setStrikeReasonText('')
  }

  const rejectWithStrike = async () => {
    if (!strikeModalItem) return

    setProcessingId(strikeModalItem.id)
    setPageMessage('')
    setPageError('')

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser()

    const reasonTextFinal =
      strikeReasonText.trim() || getStrikeReasonLabel(strikeReasonCode)

    const { error: rejectError } = await supabase
      .from('payment_requests')
      .update({
        status: 'rejected',
        promo_code: null,
      })
      .eq('id', strikeModalItem.id)

    if (rejectError) {
      console.error(rejectError)
      setProcessingId(null)
      setPageError('Не удалось отклонить заявку')
      return
    }

    const { error: violationError } = await supabase.from('violations').insert({
      user_id: strikeModalItem.user_id,
      username_snapshot: strikeModalItem.username,
      admin_user_id: adminUser?.id ?? null,
      source_type: 'payment_request',
      request_id: strikeModalItem.id,
      reason_code: strikeReasonCode,
      reason_text: reasonTextFinal,
    })

    if (violationError) {
      console.error(violationError)
      setProcessingId(null)
      setPageError('Заявка отклонена, но страйк не сохранился')
      setRequests((prev) =>
        prev.map((request) =>
          request.id === strikeModalItem.id
            ? { ...request, status: 'rejected', promo_code: null }
            : request
        )
      )
      closeStrikeModal()
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === strikeModalItem.id
          ? { ...request, status: 'rejected', promo_code: null }
          : request
      )
    )

    await loadViolations()

    setProcessingId(null)
    closeStrikeModal()
    setPageMessage('Заявка отклонена, страйк выдан')
  }

  const restoreToPending = async (item) => {
    setProcessingId(item.id)
    setPageMessage('')
    setPageError('')

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'pending',
        promo_code: null,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      setPageError('Не удалось вернуть заявку на проверку')
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? { ...request, status: 'pending', promo_code: null }
          : request
      )
    )

    setProcessingId(null)
    setPageMessage('Заявка возвращена на проверку')
  }

  const deleteRequest = async (item) => {
    const confirmed = window.confirm('Удалить эту заявку полностью?')
    if (!confirmed) return

    setProcessingId(item.id)
    setPageMessage('')
    setPageError('')

    if (item.image_path) {
      await supabase.storage.from('payment-screenshots').remove([item.image_path])
    }

    const { error } = await supabase
      .from('payment_requests')
      .delete()
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      setPageError('Не удалось удалить заявку')
      return
    }

    setRequests((prev) => prev.filter((request) => request.id !== item.id))
    setProcessingId(null)
    setPageMessage('Заявка удалена')
  }

  const clearArchive = async () => {
    if (archivedRequests.length === 0) return

    const confirmed = window.confirm('Очистить весь архив?')
    if (!confirmed) return

    setClearingArchive(true)
    setPageMessage('')
    setPageError('')

    const paths = archivedRequests
      .map((item) => item.image_path)
      .filter(Boolean)

    if (paths.length > 0) {
      await supabase.storage.from('payment-screenshots').remove(paths)
    }

    const ids = archivedRequests.map((item) => item.id)

    const { error } = await supabase
      .from('payment_requests')
      .delete()
      .in('id', ids)

    if (error) {
      console.error(error)
      setClearingArchive(false)
      setPageError('Не удалось очистить архив')
      return
    }

    setRequests((prev) => prev.filter((item) => !ids.includes(item.id)))
    setClearingArchive(false)
    setPageMessage('Архив очищен')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-black">Заявки</h1>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Здесь администратор видит новые заявки, архив, историю нарушений,
            подтверждает оплату, отклоняет заказы и при необходимости выдаёт страйки.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setRequestsTab('pending')}
            className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
              requestsTab === 'pending'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
            }`}
          >
            Новые заявки ({pendingRequests.length})
          </button>

          <button
            onClick={() => setRequestsTab('archive')}
            className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
              requestsTab === 'archive'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
            }`}
          >
            Архив ({archivedRequests.length})
          </button>

          <button
            onClick={() => setRequestsTab('violations')}
            className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
              requestsTab === 'violations'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
            }`}
          >
            Нарушения ({violations.length})
          </button>

          <button
            onClick={() => {
              loadRequests()
              loadViolations()
            }}
            className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
          >
            Обновить
          </button>

          {requestsTab === 'archive' ? (
            <button
              onClick={clearArchive}
              disabled={clearingArchive}
              className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
            >
              {clearingArchive ? 'Очищаем...' : 'Удалить все'}
            </button>
          ) : null}
        </div>
      </div>

      {pageMessage ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {pageMessage}
        </div>
      ) : null}

      {pageError ? (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {pageError}
        </div>
      ) : null}

      {requestsTab === 'violations' ? (
        violationsLoading ? (
          <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center text-lg text-zinc-300">
            Загружаем нарушения...
          </div>
        ) : violations.length === 0 ? (
          <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center text-lg text-zinc-300">
            Нарушений пока нет.
          </div>
        ) : (
          <div className="space-y-5">
            {violations.map((item) => (
              <div
                key={item.id}
                className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_40px_rgba(168,85,247,0.06)]"
              >
                <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="space-y-3">
                    <div className="text-3xl font-black text-white">
                      {item.username_snapshot}
                    </div>

                    <div className="text-lg text-zinc-200">
                      Причина: {getStrikeReasonLabel(item.reason_code)}
                    </div>

                    <div className="text-sm leading-6 text-zinc-400">
                      {item.reason_text}
                    </div>

                    <div className="text-sm text-zinc-500">
                      Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                    </div>

                    <div className="text-xs uppercase tracking-wide text-zinc-600">
                      Источник: {item.source_type}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
                    Страйк
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center text-lg text-zinc-300">
          Загружаем заявки...
        </div>
      ) : requestsTab === 'pending' ? (
        pendingRequests.length === 0 ? (
          <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center text-lg text-zinc-300">
            Новых заявок нет.
          </div>
        ) : (
          <div className="space-y-6">
            {pendingRequests.map((item) => (
              <div
                key={item.id}
                className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_40px_rgba(168,85,247,0.06)]"
              >
                <div className="grid gap-6 lg:grid-cols-[1.4fr_220px]">
                  <div className="space-y-3">
                    <div className="text-3xl font-black">{item.username}</div>
                    <div className="text-lg text-zinc-300">Тариф: {item.plan_name}</div>
                    <div className="text-lg text-zinc-300">Сумма: {item.price_label}</div>
                    <div className="text-lg text-zinc-300">
                      Статус: {getStatusLabel(item.status)}
                    </div>
                    <div className="text-base text-zinc-500">
                      Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        onClick={() => openPreview(item)}
                        className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
                      >
                        Смотреть изображение
                      </button>

                      <button
                        onClick={() => approvePayment(item)}
                        disabled={processingId === item.id}
                        className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        {processingId === item.id ? 'Подтверждаем...' : 'Подтвердить оплату'}
                      </button>

                      <button
                        onClick={() => rejectPayment(item)}
                        disabled={processingId === item.id}
                        className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-yellow-500/20 disabled:opacity-60"
                      >
                        {processingId === item.id ? 'Отклоняем...' : 'Отклонить без страйка'}
                      </button>

                      <button
                        onClick={() => openStrikeModal(item)}
                        disabled={processingId === item.id}
                        className="rounded-2xl border border-red-400/20 bg-red-500/10 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
                      >
                        Выдать страйк
                      </button>

                      <button
                        onClick={() => deleteRequest(item)}
                        disabled={processingId === item.id}
                        className="rounded-2xl border border-zinc-400/20 bg-white/5 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-white/10 disabled:opacity-60"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => openPreview(item)}
                    className="flex min-h-[220px] w-full items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-[#09090f] p-6 text-center text-2xl font-black uppercase tracking-wide text-fuchsia-400 transition hover:border-fuchsia-400/30 hover:bg-fuchsia-950/20"
                  >
                    Скриншот
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : archivedRequests.length === 0 ? (
        <div className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center text-lg text-zinc-300">
          Архив пуст.
        </div>
      ) : (
        <div className="space-y-6">
          {archivedRequests.map((item) => (
            <div
              key={item.id}
              className="rounded-[28px] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_40px_rgba(168,85,247,0.06)]"
            >
              <div className="grid gap-6 lg:grid-cols-[1.4fr_220px]">
                <div className="space-y-3">
                  <div className="text-3xl font-black">{item.username}</div>
                  <div className="text-lg text-zinc-300">Тариф: {item.plan_name}</div>
                  <div className="text-lg text-zinc-300">Сумма: {item.price_label}</div>
                  <div className="text-lg text-zinc-300">
                    Статус: {getStatusLabel(item.status)}
                  </div>
                  <div className="text-base text-zinc-500">
                    Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                  </div>

                  {item.promo_code ? (
                    <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div className="text-sm uppercase tracking-wide text-emerald-200">
                        Выданный промокод
                      </div>
                      <div className="mt-2 text-xl font-black text-white">
                        {item.promo_code}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => openPreview(item)}
                      className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
                    >
                      Смотреть изображение
                    </button>

                    <button
                      onClick={() => restoreToPending(item)}
                      disabled={processingId === item.id}
                      className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-yellow-500/20 disabled:opacity-60"
                    >
                      {processingId === item.id ? 'Возвращаем...' : 'Вернуть на проверку'}
                    </button>

                    <button
                      onClick={() => deleteRequest(item)}
                      disabled={processingId === item.id}
                      className="rounded-2xl border border-zinc-400/20 bg-white/5 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-white/10 disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => openPreview(item)}
                  className="flex min-h-[220px] w-full items-center justify-center rounded-[22px] border border-fuchsia-500/15 bg-[#09090f] p-6 text-center text-2xl font-black uppercase tracking-wide text-fuchsia-400 transition hover:border-fuchsia-400/30 hover:bg-fuchsia-950/20"
                >
                  Скриншот
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImagePreviewModal
        item={selectedRequest}
        loading={previewLoading}
        onClose={() => {
          setSelectedRequest(null)
          setPreviewLoading(false)
        }}
      />

      <StrikeModal
        open={Boolean(strikeModalItem)}
        item={strikeModalItem}
        reasonCode={strikeReasonCode}
        reasonText={strikeReasonText}
        onReasonCodeChange={setStrikeReasonCode}
        onReasonTextChange={setStrikeReasonText}
        onClose={closeStrikeModal}
        onConfirm={rejectWithStrike}
        processing={processingId === strikeModalItem?.id}
      />
    </div>
  )
}