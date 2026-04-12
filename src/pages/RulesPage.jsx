import { NavLink } from 'react-router-dom'
import { SITE_RULE_SECTIONS } from '../lib/siteRules'

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-black sm:text-5xl">Правила сайта</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400 sm:text-lg">
              На этой странице собраны основные правила использования сайта, оплаты
              и общего чата. Нарушения могут привести к предупреждениям, страйкам
              и временной блокировке аккаунта.
            </p>
          </div>

          <NavLink
            to="/"
            className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50"
          >
            На главную
          </NavLink>
        </div>

        <div className="mt-10 grid gap-6">
          {SITE_RULE_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="rounded-[28px] border border-fuchsia-500/10 bg-black/40 p-6 sm:p-8"
            >
              <h2 className="text-2xl font-black text-white sm:text-3xl">
                {section.title}
              </h2>

              <div className="mt-5 grid gap-4">
                {section.items.map((item, index) => (
                  <div
                    key={`${section.id}-${index}`}
                    className="flex items-start gap-4 rounded-2xl border border-fuchsia-500/10 bg-white/[0.02] px-4 py-4"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-600/20 text-sm font-black text-fuchsia-300">
                      {index + 1}
                    </div>

                    <div className="text-sm leading-7 text-zinc-300 sm:text-base">
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}