import { useEffect, useMemo, useRef, useState } from 'react'
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
import { getStrikeReasonLabel } from '../lib/violations'

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
  telegram_username
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
  const [avatarMessage, setAvatarMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')

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
          'id, source_type, reason_code, reason_text, created_at'
        )
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

  const isAdmin = profileView?.role === 'admin'

  const heartsLeft = useMemo(() => {
    const value = Number(profileView?.hearts_left ?? 3)
    return Math.max(0, Math.min(3, value))
  }, [profileView?.hearts_left])

  const strikesCount = useMemo(() => {
    const value = Number(profileView?.strikes_count ?? 0)
    return Math.max(0, Math.min(3, value))
  }, [profileView?.strikes_count])

  const blockedUntilText = profileView?.blocked_until
    ? new Date(profileView.blocked_until).toLocaleString('ru-RU')
    : '—'

  const telegramText = profileLoading
    ? 'Загрузка...'
    : profileView?.telegram_username
      ? `@${profileView.telegram_username}`
      : 'Не подключён'

  const avatarShape = normalizeAvatarShape(profileView?.avatar_shape)

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

          {profileView?.is_blocked ? (
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

            <InfoCard label="Telegram" value={telegramText} />

            {isAdmin ? (
              <>
                <InfoCard
                  label="Роль"
                  value={profileLoading ? 'Загрузка...' : profileView?.role ?? '—'}
                />

                <InfoCard
                  label="Технический email"
                  value={user?.email ?? '—'}
                  valueClassName="text-lg font-semibold text-zinc-200"
                />
              </>
            ) : null}
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
                Сердца показывают, сколько подтверждённых нарушений ещё осталось до
                лимита.
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
                  Здесь отображаются подтверждённые нарушения по вашему аккаунту.
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
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-fuchsia-500/15 bg-white/[0.02] p-5"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                      <div className="space-y-3">
                        <div className="text-xl font-black text-white">
                          {getStrikeReasonLabel(item.reason_code)}
                        </div>

                        <div className="text-sm leading-7 text-zinc-300">
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
            )}
          </div>

          <div className="mt-8 rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
            <h2 className="text-3xl font-black">Смена пароля</h2>

            <p className="mt-3 max-w-2xl text-zinc-400">
              Для смены пароля введите текущий пароль, затем новый пароль и
              повторите его.
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
    </div>
  )
}