import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

export default function Header({ user, profile, authLoading }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  const linkClass = ({ isActive }) =>
    `rounded-xl border px-4 py-2.5 text-sm font-semibold transition lg:px-5 lg:text-base ${
      isActive
        ? 'border-fuchsia-400/50 bg-fuchsia-700/20 text-white'
        : 'border-fuchsia-500/20 bg-fuchsia-950/40 text-zinc-200 hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50'
    }`

  const plainButtonClass =
    'rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 lg:px-5 lg:text-base'

  const mobileButtonClass =
    'w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-left text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50'

  const goToHomeSection = (sectionId) => {
    closeMobileMenu()

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
    closeMobileMenu()

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
    closeMobileMenu()

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
    <>
      <header className="sticky top-0 z-40 border-b border-fuchsia-700/20 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:gap-14 lg:px-8">
          <button
            onClick={goHomeTop}
            className="flex shrink-0 items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-600/10 text-fuchsia-300 shadow-[0_0_30px_rgba(168,85,247,0.22)]">
              ✦
            </div>

            <div className="text-xl font-extrabold uppercase tracking-[0.14em] text-fuchsia-400 sm:text-2xl lg:text-[28px]">
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

            <NavLink to="/reviews" className={linkClass}>
              Отзывы
            </NavLink>

            <button onClick={openPurchasesModal} className={plainButtonClass}>
              Мои покупки
            </button>

            <NavLink to="/rules" className={linkClass}>
              Правила
            </NavLink>

            {!authLoading && user && (
              <NavLink to="/chat" className={linkClass}>
                Чат
              </NavLink>
            )}

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
              <NavLink to="/profile" className={linkClass}>
                Профиль
              </NavLink>
            )}

            {!authLoading && user && isAdmin && (
              <NavLink to="/requests" className={linkClass}>
                Заявки
              </NavLink>
            )}
          </nav>

          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 text-xl text-white transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 md:hidden"
            aria-label="Открыть меню"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />

          <div className="absolute right-0 top-0 h-full w-[86%] max-w-[360px] overflow-y-auto border-l border-fuchsia-500/20 bg-[#090912] p-5 shadow-[0_0_80px_rgba(168,85,247,0.16)]">
            <div className="mb-6 flex items-center justify-between">
              <div className="text-xl font-black uppercase tracking-[0.14em] text-fuchsia-400">
                velinor
              </div>

              <button
                onClick={closeMobileMenu}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-500/20 bg-white/5 text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => goToHomeSection('hero')}
                className={mobileButtonClass}
              >
                Главная
              </button>

              <button
                onClick={() => goToHomeSection('tariffs')}
                className={mobileButtonClass}
              >
                Тарифы
              </button>

              <NavLink
                to="/reviews"
                onClick={closeMobileMenu}
                className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Отзывы
              </NavLink>

              <button
                onClick={openPurchasesModal}
                className={mobileButtonClass}
              >
                Мои покупки
              </button>

              <NavLink
                to="/rules"
                onClick={closeMobileMenu}
                className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
              >
                Правила
              </NavLink>

              {!authLoading && user && (
                <NavLink
                  to="/chat"
                  onClick={closeMobileMenu}
                  className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                >
                  Чат
                </NavLink>
              )}

              <button
                onClick={() => goToHomeSection('support')}
                className={mobileButtonClass}
              >
                Поддержка
              </button>

              {!authLoading && !user && (
                <>
                  <NavLink
                    to="/login"
                    onClick={closeMobileMenu}
                    className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Вход
                  </NavLink>

                  <NavLink
                    to="/register"
                    onClick={closeMobileMenu}
                    className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                  >
                    Регистрация
                  </NavLink>
                </>
              )}

              {!authLoading && user && (
                <NavLink
                  to="/profile"
                  onClick={closeMobileMenu}
                  className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                >
                  Профиль
                </NavLink>
              )}

              {!authLoading && user && isAdmin && (
                <NavLink
                  to="/requests"
                  onClick={closeMobileMenu}
                  className="block w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-4 text-base font-semibold text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
                >
                  Заявки
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}