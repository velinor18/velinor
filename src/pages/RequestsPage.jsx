import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { downloadPrivateImageAsObjectUrl } from '../lib/storage'

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

export default function RequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [requestsTab, setRequestsTab] = useState('pending')
  const [clearingArchive, setClearingArchive] = useState(false)

  const loadRequests = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('payment_requests')
      .select(
        'id, user_id, username, plan_name, price_label, image_path, status, created_at, reviewed_at, promo_code, admin_hidden'
      )
      .eq('admin_hidden', false)
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

  useEffect(() => {
    loadRequests()
  }, [])

  const pendingRequests = requests.filter((item) => item.status === 'pending')
  const archivedRequests = requests.filter(
    (item) => item.status === 'approved' || item.status === 'rejected'
  )

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
    if (!supabase) return

    const code = item.promo_code || generatePromoCode()
    const reviewedAt = new Date().toISOString()
    setProcessingId(item.id)

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'approved',
        promo_code: code,
        reviewed_at: reviewedAt,
        admin_hidden: false,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? {
              ...request,
              status: 'approved',
              promo_code: code,
              reviewed_at: reviewedAt,
              admin_hidden: false,
            }
          : request
      )
    )

    setProcessingId(null)
  }

  const rejectPayment = async (item) => {
    if (!supabase) return

    const reviewedAt = new Date().toISOString()
    setProcessingId(item.id)

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'rejected',
        promo_code: null,
        reviewed_at: reviewedAt,
        admin_hidden: false,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? {
              ...request,
              status: 'rejected',
              promo_code: null,
              reviewed_at: reviewedAt,
              admin_hidden: false,
            }
          : request
      )
    )

    setProcessingId(null)
  }

  const restoreToPending = async (item) => {
    if (!supabase) return

    setProcessingId(item.id)

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'pending',
        promo_code: null,
        reviewed_at: null,
        admin_hidden: false,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      return
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === item.id
          ? {
              ...request,
              status: 'pending',
              promo_code: null,
              reviewed_at: null,
              admin_hidden: false,
            }
          : request
      )
    )

    setProcessingId(null)
  }

  const hideArchivedRequestForAdmin = async (item) => {
    if (!supabase) return

    const confirmed = window.confirm(
      'Скрыть эту запись из архива администратора? У пользователя она останется.'
    )
    if (!confirmed) return

    setProcessingId(item.id)

    const { error } = await supabase
      .from('payment_requests')
      .update({
        admin_hidden: true,
      })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      setProcessingId(null)
      return
    }

    setRequests((prev) => prev.filter((request) => request.id !== item.id))
    setProcessingId(null)
  }

  const deletePendingRequest = async (item) => {
    if (!supabase) return

    const confirmed = window.confirm('Удалить эту заявку полностью?')
    if (!confirmed) return

    setProcessingId(item.id)

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
      return
    }

    setRequests((prev) => prev.filter((request) => request.id !== item.id))
    setProcessingId(null)
  }

  const clearArchive = async () => {
    if (!supabase || archivedRequests.length === 0) return

    const confirmed = window.confirm(
      'Скрыть весь архив у администратора? У пользователей записи останутся.'
    )
    if (!confirmed) return

    setClearingArchive(true)

    const ids = archivedRequests.map((item) => item.id)

    const { error } = await supabase
      .from('payment_requests')
      .update({
        admin_hidden: true,
      })
      .in('id', ids)

    if (error) {
      console.error(error)
      setClearingArchive(false)
      return
    }

    setRequests((prev) => prev.filter((item) => !ids.includes(item.id)))
    setClearingArchive(false)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-black">Заявки</h1>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Здесь администратор видит новые заявки, архив, подтверждает оплату,
            отклоняет заказы и при необходимости возвращает их обратно на проверку.
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
            Новые заявки
          </button>

          <button
            onClick={() => setRequestsTab('archive')}
            className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${
              requestsTab === 'archive'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
            }`}
          >
            Архив
          </button>

          <button
            onClick={loadRequests}
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
              {clearingArchive ? 'Скрываем...' : 'Скрыть всё'}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
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
                      Дата заявки: {new Date(item.created_at).toLocaleString('ru-RU')}
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
                        className="rounded-2xl border border-red-400/20 bg-red-500/10 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
                      >
                        {processingId === item.id ? 'Отклоняем...' : 'Отклонить заявку'}
                      </button>

                      <button
                        onClick={() => deletePendingRequest(item)}
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
                    Дата решения:{' '}
                    {new Date(item.reviewed_at || item.created_at).toLocaleString('ru-RU')}
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
                      onClick={() => hideArchivedRequestForAdmin(item)}
                      disabled={processingId === item.id}
                      className="rounded-2xl border border-zinc-400/20 bg-white/5 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-white/10 disabled:opacity-60"
                    >
                      Скрыть
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
    </div>
  )
}