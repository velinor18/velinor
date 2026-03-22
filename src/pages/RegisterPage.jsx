import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isValidUsername, usernameToEmail } from '../lib/auth'

export default function RegisterPage({ user }) {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [errorText, setErrorText] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/account')
    }
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorText('')

    if (!supabase) {
      setErrorText('Supabase не подключён')
      return
    }

    if (!isValidUsername(username)) {
      setErrorText('Логин должен быть от 3 до 24 символов: латиница, цифры и "_"')
      return
    }

    if (password.length < 6) {
      setErrorText('Пароль должен быть не короче 6 символов')
      return
    }

    if (password !== passwordRepeat) {
      setErrorText('Пароли не совпадают')
      return
    }

    setLoading(true)

    const email = usernameToEmail(username)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
        },
      },
    })

    setLoading(false)

    if (error) {
      setErrorText(error.message)
      return
    }

    if (data?.session) {
      navigate('/account')
      return
    }

    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
        <h1 className="text-4xl font-black">Регистрация</h1>
        <p className="mt-3 text-zinc-400">
          Для тестовой версии логин будет использоваться как технический email внутри системы.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm text-zinc-300">Логин</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
              placeholder="Например: vely_user"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
              placeholder="Минимум 6 символов"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">Повторите пароль</label>
            <input
              type="password"
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              className="w-full rounded-2xl border border-fuchsia-500/20 bg-black/60 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/50"
              placeholder="Повторите пароль"
            />
          </div>

          {errorText && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  )
}