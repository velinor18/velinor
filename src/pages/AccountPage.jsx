import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AccountPage({ user, profile, profileLoading }) {
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleSignOut = async () => {
    if (!supabase) return

    await supabase.auth.signOut()
    navigate('/')
  }

  const handleChangePassword = async (e) => {
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
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
        <h1 className="text-4xl font-black">Аккаунт</h1>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6">
            <div className="text-sm uppercase tracking-wide text-zinc-500">Логин</div>
            <div className="mt-3 text-2xl font-black text-white">
              {profileLoading ? 'Загрузка...' : profile?.username ?? '—'}
            </div>
          </div>

          <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6">
            <div className="text-sm uppercase tracking-wide text-zinc-500">Роль</div>
            <div className="mt-3 text-2xl font-black text-white">
              {profileLoading ? 'Загрузка...' : profile?.role ?? 'user'}
            </div>
          </div>

          <div className="rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6">
            <div className="text-sm uppercase tracking-wide text-zinc-500">Технический email</div>
            <div className="mt-3 break-all text-lg font-semibold text-zinc-200">
              {user?.email ?? '—'}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-fuchsia-500/10 bg-black/40 p-6 text-zinc-300">
          {profileLoading ? (
            <span>Профиль ещё догружается...</span>
          ) : (
            <>
              Здесь находится ваш аккаунт. Снизу можно безопасно изменить пароль,
              указав текущий пароль и новый.
            </>
          )}
        </div>

        <div className="mt-8 rounded-[32px] border border-fuchsia-500/15 bg-black/40 p-6">
          <h2 className="text-3xl font-black">Смена пароля</h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Для смены пароля введите текущий пароль, затем новый пароль и повторите его.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleChangePassword}>
            <div>
              <label className="mb-2 block text-sm text-zinc-300">Текущий пароль</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
                placeholder="Введите текущий пароль"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Новый пароль</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
                placeholder="Минимум 6 символов"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Повторите новый пароль</label>
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
  )
}