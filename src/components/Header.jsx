import { NavLink, useLocation, useNavigate } from 'react-router-dom'

export default function Header({ user, profile, authLoading }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = profile?.role === 'admin'

  const linkClass = ({ isActive }) =>
    `rounded-xl border px-4 py-2.5 text-sm font-semibold transition lg:px-5 lg:text-base ${
      isActive
        ? 'border-fuchsia-400/50 bg-fuchsia-700/20 text-white'
        : 'border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200 hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50'
    }`

  const plainButtonClass =
    'rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 lg:px-5 lg:text-base'

  const goToHomeSection = (sectionId) => {
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        const el = document.getElementById(sectionId)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 140)
      return
    }

    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const goHomeTop = () => {
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 140)
      return
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openPurchasesModal = () => {
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        window.dispatchEvent(new Event('openPurchasesModal'))
      }, 150)
      return
    }

    window.dispatchEvent(new Event('openPurchasesModal'))
  }

  return (
    <header className="sticky top-0 z-40 border-b border-fuchsia-700/20 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-10 px-4 py-4 sm:px-6 lg:gap-14 lg:px-8">
        <button
          onClick={goHomeTop}
          className="flex shrink-0 items-center gap-3 text-left"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-600/10 text-fuchsia-300 shadow-[0_0_30px_rgba(168,85,247,0.22)]">
            ✦
          </div>

          <div className="text-2xl font-extrabold uppercase tracking-[0.14em] text-fuchsia-400 lg:text-[28px]">
            velinor
          </div>
        </button>

        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
          <button onClick={() => goToHomeSection('hero')} className={plainButtonClass}>
            Главная
          </button>

          <button onClick={() => goToHomeSection('tariffs')} className={plainButtonClass}>
            Тарифы
          </button>

          <button onClick={openPurchasesModal} className={plainButtonClass}>
            Мои покупки
          </button>

          <button onClick={() => goToHomeSection('how-to-buy')} className={plainButtonClass}>
            Как купить
          </button>

          <button onClick={() => goToHomeSection('support')} className={plainButtonClass}>
            Поддержка
          </button>

          {!authLoading && !user && (
            <>
              <NavLink to="/login" className={linkClass}>
                Вход
              </NavLink>

              <NavLink to="/register" className={linkClass}>
                Регистрация
              </NavLink>
            </>
          )}

          {!authLoading && user && (
            <NavLink to="/account" className={linkClass}>
              Аккаунт
            </NavLink>
          )}

          {!authLoading && user && isAdmin && (
            <NavLink to="/requests" className={linkClass}>
              Заявки
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}