import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import AvatarUploader from '../components/AvatarUploader'
import { supabase } from '../lib/supabase'
import {
  downloadAvatarAsObjectUrl,
  removeAvatarByPath,
  revokeObjectUrl,
  uploadAvatarBlob,
} from '../lib/avatar'
import {
  getStrikeReasonLabel,
  getViolationSourceLabel,
} from '../lib/violations'
import {
  buildTelegramBotStartUrl,
  buildTelegramBotUrl,
  TELEGRAM_BOT_USERNAME,
} from '../lib/telegram'
import {
  readDataCache,
  safeSupabase,
  writeDataCache,
} from '../lib/asyncData'

const PROFILE_CACHE_PREFIX = 'velinor_profile_cache_'
const VIOLATIONS_CACHE_PREFIX = 'velinor_account_violations_'

const PROFILE_SELECT_QUERY = `
  id,
  username,
  role,
  created_at,
  avatar_path,
  avatar_shape,
  hearts_left,
  strikes_count,
  is_blocked,
  blocked_until,
  telegram_user_id,
  telegram_username,
  telegram_linked_at
`

function writeCachedProfile(userId, nextProfile) {
  try {
    localStorage.setItem(
      `${PROFILE_CACHE_PREFIX}${userId}`,
      JSON.stringify(nextProfile)
    )
  } catch {
    // ignore cache write errors
  }
}

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

async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback below
  }

  return fallbackCopyText(text)
}

function StatusIcon({
  active,
  children,
  activeClassName,
  inactiveClassName,
}) {
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl shadow-[0_0_30px_rgba(0,0,0,0.18)] sm:h-16 sm:w-16 sm:text-3xl ${
        active ? activeClassName : inactiveClassName
      }`}
    >
      {children}
    </div>
  )
}

function ViolationDetailsModal({ item, onClose }) {
  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-[28px] border border-fuchsia-500/20 bg-[#0b0b18] shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fuchsia-500/15 px-6 py-5">
          <div>
            <div className="text-2xl font-black text-white">
              Детали нарушения
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-fuchsia-500/15 bg-white/5 px-3 py-2 text-zinc-300 transition hover:border-fuchsia-400/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5">
            <div className="text-sm uppercase tracking-wide text-zinc-500">
              Причина
            </div>
            <div className="mt-3 text-2xl font-black text-white">
              {getStrikeReasonLabel(item.reason_code)}
            </div>
          </div>

          <div className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5">
            <div className="text-sm uppercase tracking-wide text-zinc-500">
              Комментарий администратора
            </div>
            <div className="mt-3 whitespace-pre-wrap text-base leading-7 text-zinc-200">
              {item.reason_text || 'Комментарий отсутствует'}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5">
              <div className="text-sm uppercase tracking-wide text-zinc-500">
                Дата
              </div>
              <div className="mt-3 text-base text-zinc-200">
                {new Date(item.created_at).toLocaleString('ru-RU')}
              </div>
            </div>

            <div className="rounded-[22px] border border-fuchsia-500/15 bg-white/[0.02] p-5">
              <div className="text-sm uppercase tracking-wide text-zinc-500">
                Источник
              </div>
              <div className="mt-3 text-base text-zinc-200">
                {getViolationSourceLabel(item.source_type)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TelegramStatusCard({
  isLinked,
  statusText,
  telegramUsername,
  linkedAtText,
  loading,
  actionLoading,
  onRefresh,
  onLink,
  onOpenBot,
  onCopyUsername,
  onUnlink,
}) {
  const topLabel = isLinked ? 'Username Telegram' : 'Статус'
  const topValue = isLinked ? `@${telegramUsername}` : statusText

  return (
    <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm uppercase tracking-wide text-zinc-500">
          Telegram
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || actionLoading}
          className="shrink-0 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
        >
          Обновить статус
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-fuchsia-500/10 bg-white/[0.03] px-4 py-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {topLabel}
        </div>

        <div className="mt-2 overflow-x-auto whitespace-nowrap text-base font-semibold text-zinc-100 sm:text-lg">
          {topValue}
        </div>

        {isLinked && linkedAtText !== '—' ? (
          <div className="mt-3 text-xs text-zinc-500">
            Привязан: {linkedAtText}
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-8 w-full max-w-[420px] space-y-3">
        {isLinked ? (
          <>
            <button
              type="button"
              onClick={onOpenBot}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
            >
              Открыть бота
            </button>

            <button
              type="button"
              onClick={onCopyUsername}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
            >
              Скопировать username
            </button>

            <button
              type="button"
              onClick={onUnlink}
              disabled={actionLoading}
              className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
            >
              {actionLoading ? 'Отвязываем...' : 'Отвязать'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onLink}
            disabled={actionLoading}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
          >
            {actionLoading ? 'Создаём код...' : 'Привязать Telegram'}
          </button>
        )}
      </div>
    </div>
  )
}

function AdminEmailCard({ email }) {
  return (
    <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6">
      <div className="text-sm uppercase tracking-wide text-zinc-500">
        Технический email
      </div>

      <div className="mt-3 break-all text-lg font-semibold text-zinc-200">
        {email || '—'}
      </div>
    </div>
  )
}

export default function AccountPage({ user, profile, profileLoading }) {
  const navigate = useNavigate()
  const avatarUrlRef = useRef('')

  const [profileView, setProfileView] = useState(profile ?? null)
  const [avatarObjectUrl, setAvatarObjectUrl] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [shapeSaving, setShapeSaving] = useState(false)
  const [violations, setViolations] = useState([])
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState(null)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')

  const [telegramSectionLoading, setTelegramSectionLoading] = useState(false)
  const [telegramActionLoading, setTelegramActionLoading] = useState(false)
  const [telegramMessage, setTelegramMessage] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    setProfileView(profile ?? null)
    if (profile) {
      setTelegramSectionLoading(false)
    }
  }, [profile])

  useEffect(() => {
    return () => {
      revokeObjectUrl(avatarUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!avatarMessage) return
    const timer = setTimeout(() => setAvatarMessage(''), 2600)
    return () => clearTimeout(timer)
  }, [avatarMessage])

  useEffect(() => {
    if (!avatarError) return
    const timer = setTimeout(() => setAvatarError(''), 3200)
    return () => clearTimeout(timer)
  }, [avatarError])

  useEffect(() => {
    if (!telegramMessage) return
    const timer = setTimeout(() => setTelegramMessage(''), 3200)
    return () => clearTimeout(timer)
  }, [telegramMessage])

  useEffect(() => {
    let isMounted = true

    async function loadAvatar() {
      if (!profileView?.avatar_path) {
        if (isMounted) {
          setAvatarObjectUrl((prevUrl) => {
            if (prevUrl) {
              revokeObjectUrl(prevUrl)
            }
            avatarUrlRef.current = ''
            return ''
          })
          setAvatarLoading(false)
        }
        return
      }

      if (!avatarObjectUrl) {
        setAvatarLoading(true)
      }

      try {
        const nextUrl = await downloadAvatarAsObjectUrl(profileView.avatar_path)

        if (!isMounted) {
          revokeObjectUrl(nextUrl)
          return
        }

        setAvatarObjectUrl((prevUrl) => {
          if (prevUrl && prevUrl !== nextUrl) {
            revokeObjectUrl(prevUrl)
          }

          avatarUrlRef.current = nextUrl || ''
          return nextUrl || ''
        })
      } catch (error) {
        console.error(error)
      } finally {
        if (isMounted) {
          setAvatarLoading(false)
        }
      }
    }

    loadAvatar()

    return () => {
      isMounted = false
    }
  }, [profileView?.avatar_path])

  useEffect(() => {
    let isMounted = true

    async function loadViolations() {
      if (!supabase || !user) {
        if (isMounted) {
          setViolations([])
          setViolationsLoading(false)
        }
        return
      }

      const cacheKey = `${VIOLATIONS_CACHE_PREFIX}${user.id}`
      const cachedViolations = readDataCache(cacheKey, 60 * 1000)

      if (cachedViolations) {
        setViolations(cachedViolations)
        setViolationsLoading(false)
      } else {
        setViolationsLoading(true)
      }

      try {
        const { data, error } = await safeSupabase(
          () =>
            supabase
              .from('violations')
              .select(
                'id, user_id, source_type, reason_code, reason_text, created_at, is_revoked'
              )
              .eq('user_id', user.id)
              .eq('is_revoked', false)
              .order('created_at', { ascending: false }),
          {
            timeoutMs: 5000,
            retries: 0,
            timeoutMessage: 'История нарушений загружается слишком долго',
          }
        )

        if (!isMounted) return

        if (error) {
          throw error
        }

        const nextViolations = data ?? []
        setViolations(nextViolations)
        writeDataCache(cacheKey, nextViolations)
      } catch (error) {
        console.error(error)
        if (!cachedViolations && isMounted) {
          setViolations([])
        }
      } finally {
        if (isMounted) {
          setViolationsLoading(false)
        }
      }
    }

    loadViolations()

    return () => {
      isMounted = false
    }
  }, [user])

  const loadTelegramState = useCallback(async () => {
    if (!supabase || !user) {
      setTelegramSectionLoading(false)
      return
    }

    setTelegramSectionLoading(true)

    try {
      const { data: profileData, error: profileError } = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .select(PROFILE_SELECT_QUERY)
            .eq('id', user.id)
            .single(),
        {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Статус Telegram загружается слишком долго',
        }
      )

      if (profileError) {
        throw profileError
      }

      setProfileView(profileData)
      writeCachedProfile(user.id, profileData)
    } catch (error) {
      console.error(error)
      setTelegramMessage(error?.message || 'Не удалось обновить статус Telegram')
    } finally {
      setTelegramSectionLoading(false)
    }
  }, [user])

  const isAdmin = profileView?.role === 'admin'

  const heartsLeft = useMemo(() => {
    if (isAdmin) return 3
    const value = Number(profileView?.hearts_left ?? 3)
    return Math.max(0, Math.min(3, value))
  }, [profileView?.hearts_left, isAdmin])

  const strikesCount = useMemo(() => {
    if (isAdmin) return 0
    const value = Number(profileView?.strikes_count ?? 0)
    return Math.max(0, Math.min(3, value))
  }, [profileView?.strikes_count, isAdmin])

  const blockedUntilText = profileView?.blocked_until
    ? new Date(profileView.blocked_until).toLocaleString('ru-RU')
    : '—'

  const isTelegramLinked = Boolean(profileView?.telegram_user_id)

  const telegramStatusText =
    profileLoading || telegramSectionLoading
      ? 'Загрузка...'
      : isTelegramLinked
        ? 'Подключён'
        : 'Не подключён'

  const telegramLinkedAtText = profileView?.telegram_linked_at
    ? new Date(profileView.telegram_linked_at).toLocaleString('ru-RU')
    : '—'

  const openTelegramBot = (codeOverride = '') => {
    const url = codeOverride
      ? buildTelegramBotStartUrl(codeOverride)
      : buildTelegramBotUrl()

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    navigate('/')
  }

  async function handleAvatarSave(croppedBlob) {
    if (!supabase || !user) {
      setAvatarError('Сессия не найдена')
      return false
    }

    setAvatarSaving(true)
    setAvatarMessage('')
    setAvatarError('')

    const previousAvatarPath = profileView?.avatar_path ?? null

    const { path, error: uploadError } = await uploadAvatarBlob(
      user.id,
      croppedBlob
    )

    if (uploadError || !path) {
      console.error(uploadError)
      setAvatarSaving(false)
      setAvatarError('Не удалось загрузить аватар')
      return false
    }

    try {
      const { data, error: updateError } = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .update({
              avatar_path: path,
            })
            .eq('id', user.id)
            .select(PROFILE_SELECT_QUERY)
            .single(),
        {
          timeoutMs: 6000,
          retries: 0,
          timeoutMessage: 'Сохранение аватара заняло слишком много времени',
        }
      )

      if (updateError || !data) {
        throw updateError || new Error('Не удалось сохранить путь аватара')
      }

      setProfileView(data)
      writeCachedProfile(user.id, data)
      setAvatarMessage('Аватар успешно обновлён')

      if (previousAvatarPath && previousAvatarPath !== path) {
        removeAvatarByPath(previousAvatarPath)
      }

      return true
    } catch (error) {
      console.error(error)
      setAvatarError(error?.message || 'Не удалось сохранить аватар')
      return false
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleAvatarShapeChange(nextShape) {
    if (!supabase || !user) {
      setAvatarError('Сессия не найдена')
      return
    }

    setShapeSaving(true)
    setAvatarError('')
    setAvatarMessage('')

    try {
      const { data, error } = await safeSupabase(
        () =>
          supabase
            .from('profiles')
            .update({
              avatar_shape: nextShape,
            })
            .eq('id', user.id)
            .select(PROFILE_SELECT_QUERY)
            .single(),
        {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Сохранение формы аватара заняло слишком много времени',
        }
      )

      if (error || !data) {
        throw error || new Error('Не удалось сохранить форму аватара')
      }

      setProfileView(data)
      writeCachedProfile(user.id, data)
      setAvatarMessage('Форма аватара обновлена')
    } catch (error) {
      console.error(error)
      setAvatarError(error?.message || 'Не удалось сохранить форму аватара')
    } finally {
      setShapeSaving(false)
    }
  }

  async function handleCreateTelegramCode() {
    if (!supabase || !user) {
      setTelegramMessage('Сессия не найдена')
      return
    }

    setTelegramActionLoading(true)
    setTelegramMessage('')

    try {
      const { data, error } = await safeSupabase(
        () => supabase.rpc('create_telegram_link_code'),
        {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Создание кода заняло слишком много времени',
        }
      )

      if (error) {
        throw error
      }

      const nextRow = Array.isArray(data) ? data[0] : null

      if (!nextRow?.code) {
        setTelegramMessage('Код не был создан')
        return
      }

      setTelegramMessage('Код создан. Открываем Telegram-бота...')
      openTelegramBot(nextRow.code)
    } catch (error) {
      console.error(error)
      setTelegramMessage(error?.message || 'Не удалось создать код привязки')
    } finally {
      setTelegramActionLoading(false)
    }
  }

  async function handleCopyTelegramUsername() {
    const success = await copyText(`@${TELEGRAM_BOT_USERNAME}`)
    setTelegramMessage(
      success ? 'Username бота скопирован' : 'Не удалось скопировать username'
    )
  }

  async function handleUnlinkTelegram() {
    if (!supabase) {
      setTelegramMessage('Supabase не подключён')
      return
    }

    const confirmed = window.confirm('Отвязать Telegram от этого аккаунта?')
    if (!confirmed) return

    setTelegramActionLoading(true)
    setTelegramMessage('')

    try {
      const { error } = await safeSupabase(
        () => supabase.rpc('unlink_telegram_account'),
        {
          timeoutMs: 5000,
          retries: 0,
          timeoutMessage: 'Отвязка Telegram заняла слишком много времени',
        }
      )

      if (error) {
        throw error
      }

      await loadTelegramState()
      setTelegramMessage('Telegram успешно отвязан')
    } catch (error) {
      console.error(error)
      setTelegramMessage(error?.message || 'Не удалось отвязать Telegram')
    } finally {
      setTelegramActionLoading(false)
    }
  }

  async function handleRefreshTelegram() {
    await loadTelegramState()
    setTelegramMessage('Статус Telegram обновлён')
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordMessage('')
    setPasswordError('')

    if (!supabase || !user) {
      setPasswordError('Сессия не найдена')
      return
    }

    if (!currentPassword || !newPassword || !repeatPassword) {
      setPasswordError('Заполните все поля')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('Новый пароль должен быть не короче 6 символов')
      return
    }

    if (newPassword !== repeatPassword) {
      setPasswordError('Новые пароли не совпадают')
      return
    }

    if (currentPassword === newPassword) {
      setPasswordError('Новый пароль должен отличаться от текущего')
      return
    }

    setPasswordLoading(true)

    try {
      const { error: verifyError } = await safeSupabase(
        () =>
          supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
          }),
        {
          timeoutMs: 6000,
          retries: 0,
          timeoutMessage: 'Проверка текущего пароля заняла слишком много времени',
        }
      )

      if (verifyError) {
        setPasswordError('Текущий пароль введён неверно')
        setPasswordLoading(false)
        return
      }

      const { error: updateError } = await safeSupabase(
        () =>
          supabase.auth.updateUser({
            password: newPassword,
          }),
        {
          timeoutMs: 6000,
          retries: 0,
          timeoutMessage: 'Смена пароля заняла слишком много времени',
        }
      )

      if (updateError) {
        throw updateError
      }

      setCurrentPassword('')
      setNewPassword('')
      setRepeatPassword('')
      setPasswordMessage('Пароль успешно изменён')
    } catch (error) {
      console.error(error)
      setPasswordError(error?.message || 'Не удалось изменить пароль')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <AvatarUploader
          username={profileView?.username ?? user?.email ?? '—'}
          avatarUrl={avatarObjectUrl}
          shape={profileView?.avatar_shape}
          loading={avatarLoading || profileLoading}
          saving={avatarSaving}
          shapeSaving={shapeSaving}
          onSave={handleAvatarSave}
          onShapeChange={handleAvatarShapeChange}
        />

        <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-4xl font-black">Профиль</h1>

            <NavLink
              to="/rules"
              className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
            >
              Открыть правила
            </NavLink>
          </div>

          {avatarMessage ? (
            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {avatarMessage}
            </div>
          ) : null}

          {avatarError ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {avatarError}
            </div>
          ) : null}

          {telegramMessage ? (
            <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              {telegramMessage}
            </div>
          ) : null}

          {!isAdmin && profileView?.is_blocked ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-200">
              Аккаунт сейчас заблокирован.
              <br />
              Срок блокировки до: {blockedUntilText}
            </div>
          ) : null}

          <div className="mt-8">
            <TelegramStatusCard
              isLinked={isTelegramLinked}
              statusText={telegramStatusText}
              telegramUsername={profileView?.telegram_username ?? ''}
              linkedAtText={telegramLinkedAtText}
              loading={telegramSectionLoading}
              actionLoading={telegramActionLoading}
              onRefresh={handleRefreshTelegram}
              onLink={handleCreateTelegramCode}
              onOpenBot={() => openTelegramBot()}
              onCopyUsername={handleCopyTelegramUsername}
              onUnlink={handleUnlinkTelegram}
            />
          </div>

          {isAdmin ? (
            <div className="mt-5">
              <AdminEmailCard email={user?.email ?? '—'} />
            </div>
          ) : null}

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
              <div className="text-sm uppercase tracking-wide text-zinc-500">
                Сердца
              </div>

              <div className="mt-4 flex items-center gap-3">
                {[0, 1, 2].map((index) => (
                  <StatusIcon
                    key={`heart-${index}`}
                    active={index < heartsLeft}
                    activeClassName="border-red-400/30 bg-red-500/10 text-red-400"
                    inactiveClassName="border-white/10 bg-white/[0.03] text-zinc-700"
                  >
                    ❤
                  </StatusIcon>
                ))}
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-400">
                Сердца показывают, сколько подтверждённых нарушений ещё осталось до лимита.
              </p>
            </div>

            <div className="rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
              <div className="text-sm uppercase tracking-wide text-zinc-500">
                Страйки
              </div>

              <div className="mt-4 flex items-center gap-3">
                {[0, 1, 2].map((index) => (
                  <StatusIcon
                    key={`skull-${index}`}
                    active={index < strikesCount}
                    activeClassName="border-zinc-400/20 bg-zinc-100/10 text-zinc-100"
                    inactiveClassName="border-white/10 bg-white/[0.03] text-zinc-700"
                  >
                    ☠
                  </StatusIcon>
                ))}
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-400">
                После трёх страйков аккаунт блокируется на 14 дней.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-3xl font-black">История нарушений</h2>
              </div>

              <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                Всего записей: {violations.length}
              </div>
            </div>

            {violationsLoading ? (
              <div className="mt-6 rounded-2xl border border-fuchsia-500/15 bg-white/[0.02] px-4 py-6 text-center text-zinc-300">
                Загружаем историю нарушений...
              </div>
            ) : violations.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-4 py-6 text-center text-emerald-200">
                Нарушений пока нет.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {violations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedViolation(item)}
                    className="block w-full rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-5 text-left transition hover:border-fuchsia-400/30 hover:bg-fuchsia-900/10"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                      <div className="space-y-3">
                        <div className="text-xl font-black text-white">
                          Причина: {getStrikeReasonLabel(item.reason_code)}
                        </div>

                        <div className="text-sm leading-7 text-zinc-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                          Комментарий администратора: {item.reason_text || 'Комментарий отсутствует'}
                        </div>

                        <div className="text-sm text-zinc-500">
                          Дата: {new Date(item.created_at).toLocaleString('ru-RU')}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
                        Открыть
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
            <h2 className="text-3xl font-black">Смена пароля</h2>

            <form className="mt-8 space-y-5" onSubmit={handleChangePassword}>
              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Текущий пароль
                </label>

                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
                  placeholder="Введите текущий пароль"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Новый пароль
                </label>

                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
                  placeholder="Минимум 6 символов"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Повторите новый пароль
                </label>

                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
                  placeholder="Повторите новый пароль"
                />
              </div>

              {passwordError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {passwordError}
                </div>
              ) : null}

              {passwordMessage ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {passwordMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
              >
                {passwordLoading ? 'Меняем пароль...' : 'Изменить пароль'}
              </button>
            </form>
          </div>

          <button
            onClick={handleSignOut}
            className="mt-8 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
          >
            Выйти
          </button>
        </div>
      </div>

      <ViolationDetailsModal
        item={selectedViolation}
        onClose={() => setSelectedViolation(null)}
      />
    </div>
  )
}