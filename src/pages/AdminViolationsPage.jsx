import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getStrikeReasonLabel, getViolationSourceLabel } from '../lib/violations'
import { readDataCache, safeSupabase, writeDataCache } from '../lib/asyncData'

const PROFILE_SELECT_QUERY = `
  id,
  username,
  role,
  hearts_left,
  strikes_count,
  is_blocked,
  blocked_until,
  chat_is_blocked,
  chat_blocked_until,
  payment_is_blocked,
  payment_blocked_until
`

const VIOLATIONS_CACHE_KEY = 'admin_violations_page_v2'
const VIOLATIONS_CACHE_TTL_MS = 60 * 1000

function isRestrictionActive(isBlocked, blockedUntil) {
  if (!isBlocked) return false
  if (!blockedUntil) return true

  const dateValue = new Date(blockedUntil).getTime()
  if (Number.isNaN(dateValue)) return true

  return dateValue > Date.now()
}

function formatDateTime(value) {
  if (!value) return '—'

  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return '—'

  return dateValue.toLocaleString('ru-RU')
}

function clampHearts(value) {
  return Math.max(0, Math.min(3, Number(value ?? 3)))
}

function clampStrikes(value) {
  return Math.max(0, Math.min(3, Number(value ?? 0)))
}

function buildOffenders(violations, profilesMap) {
  const grouped = new Map()

  for (const item of violations) {
    const current = grouped.get(item.user_id) || []
    current.push(item)
    grouped.set(item.user_id, current)
  }

  return Array.from(grouped.entries())
    .map(([userId, history]) => {
      const sortedHistory = [...history].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      const activeViolations = sortedHistory.filter((item) => !item.is_revoked)
      const latestViolation = sortedHistory[0] || null
      const profile = profilesMap[userId] || null

      return {
        userId,
        profile,
        history: sortedHistory,
        latestViolation,
        activeViolations,
        totalViolationsCount: sortedHistory.length,
        activeViolationsCount: activeViolations.length,
      }
    })
    .sort((a, b) => {
      const aTime = a.latestViolation?.created_at
        ? new Date(a.latestViolation.created_at).getTime()
        : 0
      const bTime = b.latestViolation?.created_at
        ? new Date(b.latestViolation.created_at).getTime()
        : 0

      return bTime - aTime
    })
}

function StatusBadge({ active, activeText, inactiveText }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-bold uppercase tracking-wide ${
        active
          ? 'border-red-400/20 bg-red-500/10 text-red-100'
          : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
      }`}
    >
      {active ? activeText : inactiveText}
    </div>
  )
}

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="rounded-[28px] border border-fuchsia-500/15 bg-black/40 p-5">
      <div className="text-sm uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
      {subtitle ? (
        <div className="mt-2 text-sm leading-6 text-zinc-400">{subtitle}</div>
      ) : null}
    </div>
  )
}

function HistoryModal({
  open,
  offender,
  actionLoading,
  onClose,
  onRemoveStrike,
  onUnblockChat,
  onUnblockPayments,
}) {
  if (!open || !offender) return null

  const profile = offender.profile || {
    id: offender.userId,
    username: offender.userId,
    hearts_left: 3,
    strikes_count: offender.activeViolationsCount,
    chat_is_blocked: false,
    chat_blocked_until: null,
    payment_is_blocked: false,
    payment_blocked_until: null,
  }

  const chatBlocked = isRestrictionActive(
    profile?.chat_is_blocked,
    profile?.chat_blocked_until
  )
  const paymentBlocked = isRestrictionActive(
    profile?.payment_is_blocked,
    profile?.payment_blocked_until
  )

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-[30px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-fuchsia-500/15 px-6 py-5">
          <div>
            <div className="text-3xl font-black text-white">
              История пользователя
            </div>
            <div className="mt-1 text-zinc-400">
              {profile?.username || offender.userId}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="mb-6 grid gap-4 lg:grid-cols-4">
            <MetricCard
              title="Страйки"
              value={clampStrikes(profile?.strikes_count)}
            />
            <MetricCard
              title="Сердца"
              value={clampHearts(profile?.hearts_left)}
            />
            <MetricCard
              title="Чат"
              value={chatBlocked ? 'Заблокирован' : 'Открыт'}
              subtitle={
                chatBlocked
                  ? `До: ${formatDateTime(profile?.chat_blocked_until)}`
                  : ''
              }
            />
            <MetricCard
              title="Покупки"
              value={paymentBlocked ? 'Заблокированы' : 'Открыты'}
              subtitle={
                paymentBlocked
                  ? `До: ${formatDateTime(profile?.payment_blocked_until)}`
                  : ''
              }
            />
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              disabled={actionLoading}
              onClick={onRemoveStrike}
              className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-yellow-500/20 disabled:opacity-60"
            >
              {actionLoading ? 'Обрабатываем...' : 'Снять страйк'}
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={onUnblockChat}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {actionLoading ? 'Обрабатываем...' : 'Снять чат-блокировку'}
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={onUnblockPayments}
              className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {actionLoading ? 'Обрабатываем...' : 'Снять блокировку покупок'}
            </button>
          </div>

          {offender.history.length === 0 ? (
            <div className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] px-4 py-6 text-center text-zinc-300">
              История нарушений пуста.
            </div>
          ) : (
            <div className="space-y-4">
              {offender.history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-5"
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="space-y-3">
                      <div className="text-xl font-black text-white">
                        {getStrikeReasonLabel(item.reason_code)}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <div className="rounded-full border border-fuchsia-500/20 bg-fuchsia-700/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-100">
                          {getViolationSourceLabel(item.source_type)}
                        </div>

                        <div
                          className={`rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-wide ${
                            item.is_revoked
                              ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300'
                              : 'border-red-400/20 bg-red-500/10 text-red-100'
                          }`}
                        >
                          {item.is_revoked ? 'Страйк снят' : 'Активное нарушение'}
                        </div>
                      </div>

                      <div className="text-sm leading-7 text-zinc-300">
                        {item.reason_text || 'Комментарий администратора отсутствует'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400">
                      {formatDateTime(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminViolationsPage() {
  const [violations, setViolations] = useState([])
  const [profilesMap, setProfilesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!errorText) return
    const timer = setTimeout(() => setErrorText(''), 3600)
    return () => clearTimeout(timer)
  }, [errorText])

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!supabase) {
      setLoading(false)
      setReloading(false)
      setErrorText('Supabase не подключён')
      return
    }

    const cached = readDataCache(VIOLATIONS_CACHE_KEY, VIOLATIONS_CACHE_TTL_MS)

    if (!silent && cached?.violations) {
      setViolations(Array.isArray(cached.violations) ? cached.violations : [])
      setProfilesMap(cached.profilesMap || {})
      setLoading(false)
    } else if (silent) {
      setReloading(true)
    } else {
      setLoading(true)
    }

    try {
      const violationsResult = await safeSupabase(
        () =>
          supabase
            .from('violations')
            .select(
              'id, user_id, source_type, reason_code, reason_text, created_at, is_revoked'
            )
            .order('created_at', { ascending: false }),
        {
          timeoutMs: 7000,
          retries: 1,
          timeoutMessage: 'Раздел нарушений загружается слишком долго',
        }
      )

      const violationsError = violationsResult?.error
      const safeViolations = violationsResult?.data ?? []

      if (violationsError) {
        throw violationsError
      }

      const uniqueUserIds = [
        ...new Set(safeViolations.map((item) => item.user_id).filter(Boolean)),
      ]

      let nextProfilesMap = {}

      if (uniqueUserIds.length > 0) {
        const profilesResult = await safeSupabase(
          () =>
            supabase
              .from('profiles')
              .select(PROFILE_SELECT_QUERY)
              .in('id', uniqueUserIds),
          {
            timeoutMs: 7000,
            retries: 1,
            timeoutMessage: 'Профили пользователей загружаются слишком долго',
          }
        )

        if (profilesResult?.error) {
          console.error(profilesResult.error)
          setErrorText(
            'Нарушения загружены, но профили пользователей прочитать не удалось'
          )
        } else {
          nextProfilesMap = Object.fromEntries(
            (profilesResult?.data ?? []).map((profile) => [profile.id, profile])
          )
        }
      }

      setViolations(safeViolations)
      setProfilesMap(nextProfilesMap)
      writeDataCache(VIOLATIONS_CACHE_KEY, {
        violations: safeViolations,
        profilesMap: nextProfilesMap,
      })
      setLoading(false)
      setReloading(false)
    } catch (error) {
      console.error(error)

      if (!cached?.violations) {
        setViolations([])
        setProfilesMap({})
        setLoading(false)
      }

      setReloading(false)
      setErrorText(error?.message || 'Не удалось загрузить нарушения')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const offenders = useMemo(
    () => buildOffenders(violations, profilesMap),
    [violations, profilesMap]
  )

  const filteredOffenders = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return offenders.filter((item) => {
      if (filterMode === 'active' && item.activeViolationsCount === 0) {
        return false
      }

      if (!query) return true

      const username = (item.profile?.username || '').toLowerCase()
      const reasons = item.history
        .map((historyItem) =>
          getStrikeReasonLabel(historyItem.reason_code).toLowerCase()
        )
        .join(' ')
      const sources = item.history
        .map((historyItem) =>
          getViolationSourceLabel(historyItem.source_type).toLowerCase()
        )
        .join(' ')

      return (
        username.includes(query) ||
        reasons.includes(query) ||
        sources.includes(query) ||
        String(item.userId).toLowerCase().includes(query)
      )
    })
  }, [offenders, filterMode, searchText])

  useEffect(() => {
    if (!filteredOffenders.length) {
      setSelectedUserId('')
      return
    }

    const exists = filteredOffenders.some((item) => item.userId === selectedUserId)
    if (!exists) {
      setSelectedUserId(filteredOffenders[0].userId)
    }
  }, [filteredOffenders, selectedUserId])

  const selectedOffender =
    filteredOffenders.find((item) => item.userId === selectedUserId) ||
    offenders.find((item) => item.userId === selectedUserId) ||
    null

  const selectedProfile = selectedOffender?.profile || {
    id: selectedOffender?.userId || '',
    username: selectedOffender?.profile?.username || selectedOffender?.userId || '—',
    hearts_left: 3,
    strikes_count: selectedOffender?.activeViolationsCount ?? 0,
    is_blocked: false,
    blocked_until: null,
    chat_is_blocked: false,
    chat_blocked_until: null,
    payment_is_blocked: false,
    payment_blocked_until: null,
  }

  const heartsLeft = clampHearts(selectedProfile?.hearts_left)
  const strikesCount = clampStrikes(selectedProfile?.strikes_count)

  const accountBlocked = isRestrictionActive(
    selectedProfile?.is_blocked,
    selectedProfile?.blocked_until
  )

  const chatBlocked = isRestrictionActive(
    selectedProfile?.chat_is_blocked,
    selectedProfile?.chat_blocked_until
  )

  const paymentBlocked = isRestrictionActive(
    selectedProfile?.payment_is_blocked,
    selectedProfile?.payment_blocked_until
  )

  const handleRemoveStrike = useCallback(async () => {
    if (!supabase || !selectedOffender) {
      setErrorText('Пользователь не выбран')
      return
    }

    const latestActiveViolation = selectedOffender.history.find(
      (item) => !item.is_revoked
    )

    if (!latestActiveViolation) {
      setErrorText('У пользователя нет активных страйков для снятия')
      return
    }

    const confirmed = window.confirm(
      'Снять последний активный страйк у этого пользователя?'
    )
    if (!confirmed) return

    setActionLoading(true)
    setErrorText('')

    const nextStrikes = Math.max(0, strikesCount - 1)
    const nextHearts = Math.min(3, heartsLeft + 1)

    try {
      const violationUpdate = await safeSupabase(
        () =>
          supabase
            .from('violations')
            .update({
              is_revoked: true,
            })
            .eq('id', latestActiveViolation.id),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Снятие страйка заняло слишком много времени',
        }
      )

      if (violationUpdate?.error) {
        throw violationUpdate.error
      }

      const profilePatch = {
        strikes_count: nextStrikes,
        hearts_left: nextHearts,
      }

      if (nextStrikes < 3) {
        profilePatch.is_blocked = false
        profilePatch.blocked_until = null
      }

      const profileUpdate = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .update(profilePatch)
            .eq('id', selectedOffender.userId),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Обновление профиля заняло слишком много времени',
        }
      )

      if (profileUpdate?.error) {
        setErrorText(
          'Страйк в истории был снят, но профиль не обновился полностью. Нужна дополнительная проверка.'
        )
        await loadData({ silent: true })
        setActionLoading(false)
        return
      }

      setToast('Страйк снят')
      await loadData({ silent: true })
    } catch (error) {
      console.error(error)
      setErrorText(error?.message || 'Не удалось снять страйк')
    } finally {
      setActionLoading(false)
    }
  }, [heartsLeft, strikesCount, selectedOffender, loadData])

  const handleUnblockChat = useCallback(async () => {
    if (!supabase || !selectedOffender) {
      setErrorText('Пользователь не выбран')
      return
    }

    if (!chatBlocked) {
      setErrorText('Чат у пользователя уже открыт')
      return
    }

    const confirmed = window.confirm(
      'Снять чат-блокировку у этого пользователя?'
    )
    if (!confirmed) return

    setActionLoading(true)
    setErrorText('')

    try {
      const result = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .update({
              chat_is_blocked: false,
              chat_blocked_until: null,
            })
            .eq('id', selectedOffender.userId),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Снятие чат-блокировки заняло слишком много времени',
        }
      )

      if (result?.error) {
        throw result.error
      }

      setToast('Чат-блокировка снята')
      await loadData({ silent: true })
    } catch (error) {
      console.error(error)
      setErrorText(error?.message || 'Не удалось снять чат-блокировку')
    } finally {
      setActionLoading(false)
    }
  }, [chatBlocked, selectedOffender, loadData])

  const handleUnblockPayments = useCallback(async () => {
    if (!supabase || !selectedOffender) {
      setErrorText('Пользователь не выбран')
      return
    }

    if (!paymentBlocked) {
      setErrorText('Покупки у пользователя уже открыты')
      return
    }

    const confirmed = window.confirm(
      'Снять блокировку покупок у этого пользователя?'
    )
    if (!confirmed) return

    setActionLoading(true)
    setErrorText('')

    try {
      const result = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .update({
              payment_is_blocked: false,
              payment_blocked_until: null,
            })
            .eq('id', selectedOffender.userId),
        {
          timeoutMs: 7000,
          retries: 0,
          timeoutMessage: 'Снятие блокировки покупок заняло слишком много времени',
        }
      )

      if (result?.error) {
        throw result.error
      }

      setToast('Блокировка покупок снята')
      await loadData({ silent: true })
    } catch (error) {
      console.error(error)
      setErrorText(error?.message || 'Не удалось снять блокировку покупок')
    } finally {
      setActionLoading(false)
    }
  }, [paymentBlocked, selectedOffender, loadData])

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-black">Нарушения и нарушители</h1>
          <p className="mt-3 max-w-4xl text-zinc-400">
            Отдельный раздел для администратора со всеми пользователями, которые
            когда-либо нарушали правила, их полной историей, текущим статусом
            аккаунта и быстрыми действиями.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData({ silent: true })}
          disabled={loading || reloading || actionLoading}
          className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
        >
          {reloading ? 'Обновляем...' : 'Обновить раздел'}
        </button>
      </div>

      {toast ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {toast}
        </div>
      ) : null}

      {errorText ? (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorText}
        </div>
      ) : null}

      <div className="mb-8 rounded-[30px] border border-fuchsia-500/15 bg-zinc-950/80 p-5 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск по пользователю, причине или источнику..."
            className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/50 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/40"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-2xl px-5 py-4 text-sm font-extrabold uppercase tracking-wide transition ${
                filterMode === 'all'
                  ? 'bg-fuchsia-600 text-white'
                  : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
              }`}
            >
              Все нарушители
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('active')}
              className={`rounded-2xl px-5 py-4 text-sm font-extrabold uppercase tracking-wide transition ${
                filterMode === 'active'
                  ? 'bg-fuchsia-600 text-white'
                  : 'border border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200'
              }`}
            >
              Только с активными
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 px-6 py-12 text-center text-lg text-zinc-300 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
          Загружаем раздел нарушений...
        </div>
      ) : filteredOffenders.length === 0 ? (
        <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 px-6 py-12 text-center text-lg text-zinc-300 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
          Подходящих пользователей не найдено.
        </div>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-4 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
            <div className="mb-4 flex items-center justify-between px-2">
              <div className="text-sm uppercase tracking-wide text-zinc-500">
                Список нарушителей
              </div>
              <div className="rounded-full border border-fuchsia-500/15 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-300">
                {filteredOffenders.length}
              </div>
            </div>

            <div className="space-y-3">
              {filteredOffenders.map((item) => {
                const isActive = item.userId === selectedUserId
                const username = item.profile?.username || item.userId
                const latestReason = item.latestViolation
                  ? getStrikeReasonLabel(item.latestViolation.reason_code)
                  : '—'
                const chatIsBlocked = isRestrictionActive(
                  item.profile?.chat_is_blocked,
                  item.profile?.chat_blocked_until
                )
                const paymentsAreBlocked = isRestrictionActive(
                  item.profile?.payment_is_blocked,
                  item.profile?.payment_blocked_until
                )

                return (
                  <button
                    key={item.userId}
                    type="button"
                    onClick={() => setSelectedUserId(item.userId)}
                    className={`block w-full rounded-[24px] border p-4 text-left transition ${
                      isActive
                        ? 'border-fuchsia-400/40 bg-fuchsia-700/10'
                        : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/25 hover:bg-fuchsia-900/10'
                    }`}
                  >
                    <div className="text-xl font-black text-white">{username}</div>

                    <div className="mt-2 text-sm leading-6 text-zinc-400">
                      Последняя причина: {latestReason}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-100">
                        Активных: {item.activeViolationsCount}
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-300">
                        Всего: {item.totalViolationsCount}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                          chatIsBlocked
                            ? 'border-red-400/20 bg-red-500/10 text-red-100'
                            : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                        }`}
                      >
                        Чат: {chatIsBlocked ? 'Блок' : 'Ок'}
                      </div>

                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                          paymentsAreBlocked
                            ? 'border-red-400/20 bg-red-500/10 text-red-100'
                            : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                        }`}
                      >
                        Покупки: {paymentsAreBlocked ? 'Блок' : 'Ок'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
            {selectedOffender ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-wide text-zinc-500">
                      Пользователь
                    </div>
                    <h2 className="mt-2 text-4xl font-black text-white">
                      {selectedProfile.username}
                    </h2>
                    <div className="mt-3 text-zinc-400">
                      Последнее нарушение:{' '}
                      {formatDateTime(selectedOffender.latestViolation?.created_at)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Посмотреть историю пользователя
                  </button>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Страйки"
                    value={strikesCount}
                    subtitle="Текущее количество страйков"
                  />

                  <MetricCard
                    title="Сердца"
                    value={heartsLeft}
                    subtitle="Оставшийся лимит до максимума"
                  />

                  <MetricCard
                    title="Активных нарушений"
                    value={selectedOffender.activeViolationsCount}
                    subtitle="Только не снятые страйки"
                  />

                  <MetricCard
                    title="Всего нарушений"
                    value={selectedOffender.totalViolationsCount}
                    subtitle="Все записи по пользователю"
                  />
                </div>

                <div className="mt-8 grid gap-4 lg:grid-cols-4">
                  <StatusBadge
                    active={accountBlocked}
                    activeText="Аккаунт заблокирован"
                    inactiveText="Аккаунт открыт"
                  />

                  <StatusBadge
                    active={chatBlocked}
                    activeText="Чат заблокирован"
                    inactiveText="Чат открыт"
                  />

                  <StatusBadge
                    active={paymentBlocked}
                    activeText="Покупки заблокированы"
                    inactiveText="Покупки открыты"
                  />

                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400">
                    Блок аккаунта до:{' '}
                    <span className="text-zinc-200">
                      {formatDateTime(selectedProfile.blocked_until)}
                    </span>
                  </div>
                </div>

                <div className="mt-8 grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleRemoveStrike}
                    className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-yellow-500/20 disabled:opacity-60"
                  >
                    {actionLoading ? 'Обрабатываем...' : 'Снять страйк'}
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleUnblockChat}
                    className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-cyan-500/20 disabled:opacity-60"
                  >
                    {actionLoading ? 'Обрабатываем...' : 'Снять чат-блокировку'}
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleUnblockPayments}
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    {actionLoading ? 'Обрабатываем...' : 'Снять блокировку покупок'}
                  </button>
                </div>

                <div className="mt-8 rounded-[30px] border border-fuchsia-500/15 bg-black/40 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm uppercase tracking-wide text-zinc-500">
                        Последние нарушения
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">
                        Краткая сводка по пользователю
                      </div>
                    </div>

                    <div className="rounded-full border border-fuchsia-500/15 bg-white/[0.03] px-4 py-2 text-sm font-bold uppercase tracking-wide text-zinc-300">
                      {selectedOffender.history.length}
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {selectedOffender.history.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5"
                      >
                        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                          <div className="space-y-3">
                            <div className="text-xl font-black text-white">
                              {getStrikeReasonLabel(item.reason_code)}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <div className="rounded-full border border-fuchsia-500/20 bg-fuchsia-700/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-100">
                                {getViolationSourceLabel(item.source_type)}
                              </div>

                              <div
                                className={`rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-wide ${
                                  item.is_revoked
                                    ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300'
                                    : 'border-red-400/20 bg-red-500/10 text-red-100'
                                }`}
                              >
                                {item.is_revoked ? 'Снят' : 'Активен'}
                              </div>
                            </div>

                            <div className="text-sm leading-7 text-zinc-300">
                              {item.reason_text || 'Комментарий администратора отсутствует'}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400">
                            {formatDateTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[28px] border border-fuchsia-500/15 bg-black/40 px-6 py-12 text-center text-zinc-300">
                Выбери пользователя слева, чтобы увидеть полную картину.
              </div>
            )}
          </div>
        </div>
      )}

      <HistoryModal
        open={historyOpen}
        offender={selectedOffender}
        actionLoading={actionLoading}
        onClose={() => setHistoryOpen(false)}
        onRemoveStrike={handleRemoveStrike}
        onUnblockChat={handleUnblockChat}
        onUnblockPayments={handleUnblockPayments}
      />
    </div>
  )
}