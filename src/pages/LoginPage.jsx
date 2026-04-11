import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isValidUsername, usernameToEmail } from '../lib/auth'
import {
  clearGoogleOAuthPending,
  hasPendingGoogleOAuth,
  markGoogleOAuthPending,
  signInWithGoogle,
} from '../lib/socialAuth'

function SocialButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export default function LoginPage({ user }) {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorText, setErrorText] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(hasPendingGoogleOAuth())

  const resetGoogleButtonState = useCallback(async () => {
    if (!hasPendingGoogleOAuth()) {
      setGoogleLoading(false)
      return
    }

    if (document.visibilityState === 'hidden') {
      return
    }

    if (!supabase) {
      clearGoogleOAuthPending()
      setGoogleLoading(false)
      return
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        clearGoogleOAuthPending()
        setGoogleLoading(false)
        return
      }
    } catch {
      // ignore
    }

    clearGoogleOAuthPending()
    setGoogleLoading(false)
  }, [])

  useEffect(() => {
    if (user) {
      clearGoogleOAuthPending()
      setGoogleLoading(false)
      navigate('/profile')
    }
  }, [user, navigate])

  useEffect(() => {
    let timeoutId = null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        timeoutId = window.setTimeout(() => {
          resetGoogleButtonState()
        }, 250)
      }
    }

    const handleWindowFocus = () => {
      timeoutId = window.setTimeout(() => {
        resetGoogleButtonState()
      }, 250)
    }

    const handlePageShow = () => {
      timeoutId = window.setTimeout(() => {
        resetGoogleButtonState()
      }, 250)
    }

    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    timeoutId = window.setTimeout(() => {
      resetGoogleButtonState()
    }, 250)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [resetGoogleButtonState])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorText('')
    clearGoogleOAuthPending()
    setGoogleLoading(false)

    if (!supabase) {
      setErrorText('Supabase не подключён')
      return
    }

    if (!isValidUsername(username)) {
      setErrorText('Введите корректный логин')
      return
    }

    if (!password) {
      setErrorText('Введите пароль')
      return
    }

    setLoading(true)

    const email = usernameToEmail(username)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setErrorText('Неверный логин или пароль')
      return
    }

    navigate('/profile')
  }

  const handleGoogleLogin = async () => {
    setErrorText('')
    setGoogleLoading(true)
    markGoogleOAuthPending()

    const { error } = await signInWithGoogle()

    if (error) {
      console.error(error)
      clearGoogleOAuthPending()
      setGoogleLoading(false)
      setErrorText('Не удалось запустить вход через Google')
    }
  }

  const anyLoading = loading || googleLoading

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
        <h1 className="text-4xl font-black">Вход</h1>
        <p className="mt-3 text-zinc-400">
          Можно войти через логин и пароль или сразу через Google.
        </p>

        <div className="mt-8">
          <SocialButton onClick={handleGoogleLogin} disabled={anyLoading}>
            {googleLoading ? 'Переходим в Google...' : 'Войти через Google'}
          </SocialButton>
        </div>

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
            или
          </div>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm text-zinc-300">Логин</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
              placeholder="Введите логин"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
              placeholder="Введите пароль"
            />
          </div>

          {errorText ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          ) : null}

          <button
            disabled={anyLoading}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}