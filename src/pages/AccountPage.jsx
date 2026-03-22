import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AccountPage({ user, profile, profileLoading }) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    if (!supabase) return

    await supabase.auth.signOut()
    navigate('/')
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
              Здесь позже появятся реальные заявки пользователя и история отправленных скриншотов оплаты.
              Раздел <span className="font-bold text-fuchsia-400">«Заявки»</span> виден только админу.
            </>
          )}
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