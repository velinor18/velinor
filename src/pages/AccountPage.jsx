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
import { normalizeAvatarShape } from '../lib/avatarShapes'
import {
  getStrikeReasonLabel,
  getViolationSourceLabel,
} from '../lib/violations'
import {
  buildTelegramBotStartUrl,
  buildTelegramBotUrl,
  TELEGRAM_BOT_USERNAME,
} from '../lib/telegram'

const PROFILE_CACHE_PREFIX = 'velinor_profile_cache_'

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

function InfoCard({ label, value, valueClassName = '' }) {
  return (
    <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6">
      <div className="text-sm uppercase tracking-wide text-zinc-500">
        {label}
      </div>

      <div
        className={`mt-3 break-words text-xl font-black text-white sm:text-2xl ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  )
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
            <div className="mt-1 text-sm text-zinc-400">
              Полная информация по подтверждённому нарушению
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

export default function AccountPage({ user, profile, profileLoading }) {
  const navigate = useNavigate()
  const avatarUrlRef = useRef('')

  const [profileView, setProfileView] = useState(profile ?? null)
  const [avatarObjectUrl, setAvatarObjectUrl] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [shapeSaving, setShapeSaving] = useState(false)
  const [violations, setViolations] = useState([])
  const [violationsLoading, setViolationsLoading] = useState(true)
  const [selectedViolation, setSelectedViolation] = useState(null)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')

  const [telegramSectionLoading, setTelegramSectionLoading] = useState(true)
  const [telegramActionLoading, setTelegramActionLoading] = useState(false)
  const [telegramMessage, setTelegramMessage] = useState('')
  const [activeTelegramCode, setActiveTelegramCode] = useState(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    setProfileView(profile ?? null)
  }, [profile])

  useEffect(() => {
    return () => {
      revokeObjectUrl(avatarUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!avatarMessage) return

    const timer = setTimeout(() => {
      setAvatarMessage('')
    }, 2600)

    return () => clearTimeout(timer)
  }, [avatarMessage])

  useEffect(() => {
    if (!avatarError) return

    const timer = setTimeout(() => {
      setAvatarError('')
    }, 3200)

    return () => clearTimeout(timer)
  }, [avatarError])

  useEffect(() => {
    if (!telegramMessage) return

    const timer = setTimeout(() => {
      setTelegramMessage('')
    }, 3200)

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

      setAvatarLoading(true)

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

      setAvatarLoading(false)
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

      setViolationsLoading(true)

      const { data, error } = await supabase
        .from('violations')
        .select(
          'id, user_id, source_type, reason_code, reason_text, created_at, is_revoked'
        )
        .eq('user_id', user.id)
        .eq('is_revoked', false)
        .order('created_at', { ascending: false })

      if (!isMounted) return

      if (error) {
        console.error(error)
        setViolations([])
        setViolationsLoading(false)
        return
      }

      setViolations(data ?? [])
      setViolationsLoading(false)
    }

    loadViolations()

    return () => {
      isMounted = false
    }
  }, [user])

  const loadTelegramState = useCallback(async () => {
    if (!supabase || !user) {
      setTelegramSectionLoading(false)
      setActiveTelegramCode(null)
      return
    }

    setTelegramSectionLoading(true)

    const profileRequest = supabase
      .from('profiles')
      .select(PROFILE_SELECT_QUERY)
      .eq('id', user.id)
      .single()

    const codeRequest = supabase
      .from('telegram_link_codes')
      .select('code, created_at, expires_at')
      .eq('user_id', user.id)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    const [{ data: profileData, error: profileError }, { data: codeData, error: codeError }] =
      await Promise.all([profileRequest, codeRequest])

    if (profileError) {
      console.error(profileError)
    } else if (profileData) {
      setProfileView(profileData)
      writeCachedProfile(user.id, profileData)
    }

    if (codeError) {
      console.error(codeError)
      setActiveTelegramCode(null)
    } else {
      setActiveTelegramCode(codeData?.[0] ?? null)
    }

    setTelegramSectionLoading(false)
  }, [user])

  useEffect(() => {
    loadTelegramState()
  }, [loadTelegramState])

  useEffect(() => {
    if (profileView?.telegram_user_id) {
      return
    }

    const interval = window.setInterval(() => {
      loadTelegramState()
    }, 6000)

    return () => {
      window.clearInterval(interval)
    }
  }, [profileView?.telegram_user_id, loadTelegramState])

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

  const linkedTelegramLabel = profileLoading || telegramSectionLoading
    ? 'Загрузка...'
    : profileView?.telegram_username
      ? `@${profileView.telegram_username}`
      : profileView?.telegram_user_id
        ? 'Telegram привязан'
        : 'Не подключён'

  const telegramLinkedAtText = profileView?.telegram_linked_at
    ? new Date(profileView.telegram_linked_at).toLocaleString('ru-RU')
    : '—'

  const telegramCodeExpiresText = activeTelegramCode?.expires_at
    ? new Date(activeTelegramCode.expires_at).toLocaleString('ru-RU')
    : '—'

  const avatarShape = normalizeAvatarShape(profileView?.avatar_shape)

  const openTelegramBot = () => {
    const url = activeTelegramCode?.code
      ? buildTelegramBotStartUrl(activeTelegramCode.code)
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

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({
        avatar_path: path,
      })
      .eq('id', user.id)
      .select(PROFILE_SELECT_QUERY)
      .single()

    if (updateError || !data) {
      console.error(updateError)
      setAvatarSaving(false)
      setAvatarError('Не удалось сохранить путь аватара в профиле')
      return false
    }

    setProfileView(data)
    writeCachedProfile(user.id, data)
    setAvatarSaving(false)
    setAvatarMessage('Аватар успешно обновлён')

    if (previousAvatarPath && previousAvatarPath !== path) {
      removeAvatarByPath(previousAvatarPath)
    }

    return true
  }

  async function handleAvatarShapeChange(nextShape) {
    if (!supabase || !user) {
      setAvatarError('Сессия не найдена')
      return
    }

    const safeNextShape = normalizeAvatarShape(nextShape)
    const currentShape = normalizeAvatarShape(profileView?.avatar_shape)

    if (safeNextShape === currentShape) {
      return
    }

    setShapeSaving(true)
    setAvatarMessage('')
    setAvatarError('')

    const { data, error } = await supabase
      .from('profiles')
      .update({
        avatar_shape: safeNextShape,
      })
      .eq('id', user.id)
      .select(PROFILE_SELECT_QUERY)
      .single()

    setShapeSaving(false)

    if (error || !data) {
      console.error(error)
      setAvatarError('Не удалось сохранить форму аватара')
      return
    }

    setProfileView(data)
    writeCachedProfile(user.id, data)
    setAvatarMessage('Форма аватара обновлена')
  }

  async function handleCreateTelegramCode() {
    if (!supabase || !user) {
      setTelegramMessage('Сессия не найдена')
      return
    }

    setTelegramActionLoading(true)
    setTelegramMessage('')

    const { data, error } = await supabase.rpc('create_telegram_link_code')

    setTelegramActionLoading(false)

    if (error) {
      console.error(error)
      setTelegramMessage('Не удалось создать код привязки')
      return
    }

    const nextRow = Array.isArray(data) ? data[0] : null

    if (!nextRow?.code) {
      setTelegramMessage('Код не был создан')
      return
    }

    setActiveTelegramCode({
      code: nextRow.code,
      expires_at: nextRow.expires_at,
      created_at: new Date().toISOString(),
    })
    setTelegramMessage('Код привязки создан. Теперь откройте бота.')
    openTelegramBot()
  }

  async function handleCopyTelegramCode() {
    if (!activeTelegramCode?.code) {
      setTelegramMessage('Сначала создайте код привязки')
      return
    }

    const success = await copyText(activeTelegramCode.code)
    setTelegramMessage(
      success ? 'Код привязки скопирован' : 'Не удалось скопировать код'
    )
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

    const confirmed = window.confirm(
      'Отвязать Telegram от этого аккаунта?'
    )

    if (!confirmed) return

    setTelegramActionLoading(true)
    setTelegramMessage('')

    const { error } = await supabase.rpc('unlink_telegram_account')

    setTelegramActionLoading(false)

    if (error) {
      console.error(error)
      setTelegramMessage('Не удалось отвязать Telegram')
      return
    }

    setActiveTelegramCode(null)
    await loadTelegramState()
    setTelegramMessage('Telegram успешно отвязан')
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

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (verifyError) {
      setPasswordLoading(false)
      setPasswordError('Текущий пароль введён неверно')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    setPasswordLoading(false)

    if (updateError) {
      setPasswordError(updateError.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setRepeatPassword('')
    setPasswordMessage('Пароль успешно изменён')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
        <AvatarUploader
          username={profileView?.username ?? user?.email ?? 'U'}
          avatarUrl={avatarObjectUrl}
          shape={avatarShape}
          loading={avatarLoading || profileLoading}
          saving={avatarSaving}
          shapeSaving={shapeSaving}
          onSave={handleAvatarSave}
          onShapeChange={handleAvatarShapeChange}
        />

        <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-black">Профиль</h1>

              <p className="mt-3 max-w-3xl text-zinc-400">
                Здесь находится ваш профиль. Обычный пользователь видит только важную
                информацию о своём аккаунте. Дополнительные технические поля доступны
                только администратору.
              </p>
            </div>

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

          {!isAdmin && profileView?.is_blocked ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-200">
              Аккаунт сейчас заблокирован.
              <br />
              Срок блокировки до: {blockedUntilText}
            </div>
          ) : null}

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <InfoCard
              label="Логин"
              value={profileLoading ? 'Загрузка...' : profileView?.username ?? '—'}
            />

            <InfoCard label="Telegram" value={linkedTelegramLabel} />

            {profileView?.telegram_user_id ? (
              <InfoCard label="Привязан" value={telegramLinkedAtText} />
            ) : (
              <InfoCard label="Код привязки" value={activeTelegramCode?.code ?? '—'} />
            )}

            {isAdmin ? (
              <InfoCard
                label="Технический email"
                value={user?.email ?? '—'}
                valueClassName="text-lg font-semibold text-zinc-200"
              />
            ) : null}
          </div>

          <div className="mt-8 rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-3xl font-black">Привязка Telegram</h2>
                <p className="mt-3 max-w-3xl text-zinc-400">
                  Сайт создаёт одноразовый код привязки. После этого открывается бот,
                  который получает код через /start и связывает ваш Telegram с
                  аккаунтом сайта.
                </p>
              </div>

              <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                Бот: @{TELEGRAM_BOT_USERNAME}
              </div>
            </div>

            {telegramMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {telegramMessage}
              </div>
            ) : null}

            {profileView?.telegram_user_id ? (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-fuchsia-500/10 bg-white/[0.02] p-5">
                    <div className="text-sm uppercase tracking-wide text-zinc-500">
                      Статус
                    </div>
                    <div className="mt-3 text-2xl font-black text-white">
                      Telegram привязан
                    </div>
                    <div className="mt-3 text-sm leading-6 text-zinc-400">
                      Username: {profileView.telegram_username ? `@${profileView.telegram_username}` : 'не указан'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">
                      Дата привязки: {telegramLinkedAtText}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-fuchsia-500/10 bg-white/[0.02] p-5">
                    <div className="text-sm uppercase tracking-wide text-zinc-500">
                      Что дальше
                    </div>
                    <div className="mt-3 text-base leading-7 text-zinc-300">
                      Теперь этот бот можно использовать для уведомлений, получения
                      цифровых товаров и будущих действий, которые мы добавим в следующих этапах.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={openTelegramBot}
                    className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
                  >
                    Открыть бота
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyTelegramUsername}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Скопировать username
                  </button>

                  <button
                    type="button"
                    onClick={handleRefreshTelegram}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Обновить статус
                  </button>

                  <button
                    type="button"
                    onClick={handleUnlinkTelegram}
                    disabled={telegramActionLoading}
                    className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-red-500/20 disabled:opacity-60"
                  >
                    {telegramActionLoading ? 'Отвязываем...' : 'Отвязать Telegram'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] border border-fuchsia-500/10 bg-white/[0.02] p-5">
                  <div className="text-sm uppercase tracking-wide text-zinc-500">
                    Как привязать Telegram
                  </div>
                  <div className="mt-3 space-y-2 text-base leading-7 text-zinc-300">
                    <div>1. Создайте одноразовый код привязки.</div>
                    <div>2. Откройте бота по кнопке ниже.</div>
                    <div>3. Нажмите Start в Telegram.</div>
                    <div>4. Вернитесь сюда. Статус обновится автоматически или по кнопке.</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-fuchsia-500/10 bg-white/[0.02] p-5">
                    <div className="text-sm uppercase tracking-wide text-zinc-500">
                      Активный код
                    </div>
                    <div className="mt-3 break-all text-2xl font-black text-white">
                      {activeTelegramCode?.code ?? 'Код ещё не создан'}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-zinc-400">
                      Бот использует этот код только один раз.
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-fuchsia-500/10 bg-white/[0.02] p-5">
                    <div className="text-sm uppercase tracking-wide text-zinc-500">
                      Действует до
                    </div>
                    <div className="mt-3 text-xl font-black text-white">
                      {telegramCodeExpiresText}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-zinc-400">
                      Если код истёк, просто создайте новый.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={handleCreateTelegramCode}
                    disabled={telegramActionLoading}
                    className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
                  >
                    {telegramActionLoading
                      ? 'Создаём...'
                      : activeTelegramCode?.code
                        ? 'Создать новый код'
                        : 'Создать код'}
                  </button>

                  <button
                    type="button"
                    onClick={openTelegramBot}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Открыть бота
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyTelegramCode}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Скопировать код
                  </button>

                  <button
                    type="button"
                    onClick={handleRefreshTelegram}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Обновить статус
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCopyTelegramUsername}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Скопировать username бота
                  </button>

                  <button
                    type="button"
                    onClick={() => window.open(buildTelegramBotUrl(), '_blank', 'noopener,noreferrer')}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Открыть бота без кода
                  </button>
                </div>
              </div>
            )}
          </div>

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
                <p className="mt-3 max-w-2xl text-zinc-400">
                  Нажмите на нарушение, чтобы открыть его в полном виде.
                </p>
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

            <p className="mt-3 max-w-2xl text-zinc-400">
              Для смены пароля введите текущий пароль, затем новый пароль и повторите его.
            </p>

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