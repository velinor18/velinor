import {
  AVATAR_SHAPE_OPTIONS,
  normalizeAvatarShape,
} from '../lib/avatarShapes'

function ShapePreview({ shape, active }) {
  const outerBase =
    'relative flex h-[72px] w-[72px] items-center justify-center border border-fuchsia-400/25 bg-fuchsia-500/12 transition sm:h-[82px] sm:w-[82px]'

  const innerBase =
    'flex h-[56px] w-[56px] items-center justify-center bg-[#090912] transition sm:h-[64px] sm:w-[64px]'

  const activeGlow = active
    ? 'shadow-[0_0_28px_rgba(168,85,247,0.32)]'
    : ''

  if (shape === 'rounded') {
    return (
      <div className={`${outerBase} rounded-[24px] ${activeGlow}`}>
        <div className={`${innerBase} rounded-[18px]`} />
      </div>
    )
  }

  if (shape === 'square') {
    return (
      <div className={`${outerBase} rounded-[12px] ${activeGlow}`}>
        <div className={`${innerBase} rounded-[8px]`} />
      </div>
    )
  }

  if (shape === 'diamond') {
    return (
      <div className="flex h-[72px] w-[72px] items-center justify-center sm:h-[82px] sm:w-[82px]">
        <div
          className={`flex h-[58px] w-[58px] items-center justify-center border border-fuchsia-400/25 bg-fuchsia-500/12 rotate-45 ${activeGlow} sm:h-[66px] sm:w-[66px]`}
        >
          <div className="h-[44px] w-[44px] bg-[#090912] sm:h-[50px] sm:w-[50px]" />
        </div>
      </div>
    )
  }

  if (shape === 'hexagon') {
    return (
      <div
        className={`${outerBase} ${activeGlow}`}
        style={{
          clipPath:
            'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)',
        }}
      >
        <div
          className={innerBase}
          style={{
            clipPath:
              'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)',
          }}
        />
      </div>
    )
  }

  if (shape === 'triangle') {
    return (
      <div className="flex h-[72px] w-[72px] items-center justify-center sm:h-[82px] sm:w-[82px]">
        <div
          className={`${activeGlow} flex h-[64px] w-[64px] items-center justify-center border border-fuchsia-400/25 bg-fuchsia-500/12 sm:h-[72px] sm:w-[72px]`}
          style={{
            clipPath: 'polygon(50% 6%, 94% 94%, 6% 94%)',
          }}
        >
          <div
            className="h-[48px] w-[48px] bg-[#090912] sm:h-[54px] sm:w-[54px]"
            style={{
              clipPath: 'polygon(50% 6%, 94% 94%, 6% 94%)',
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`${outerBase} rounded-full ${activeGlow}`}>
      <div className={`${innerBase} rounded-full`} />
    </div>
  )
}

export default function AvatarShapePicker({
  value,
  loading = false,
  onChange,
}) {
  const currentValue = normalizeAvatarShape(value)

  return (
    <div className="mt-8 w-full">
      <div className="mb-4 text-sm font-bold uppercase tracking-wide text-zinc-400">
        Форма аватара
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {AVATAR_SHAPE_OPTIONS.map((option) => {
          const active = option.value === currentValue

          return (
            <button
              key={option.value}
              type="button"
              disabled={loading}
              onClick={() => onChange(option.value)}
              className={`flex h-[118px] items-center justify-center overflow-hidden rounded-[24px] border transition sm:h-[132px] ${
                active
                  ? 'border-fuchsia-400/50 bg-fuchsia-700/15'
                  : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/35 hover:bg-fuchsia-900/10'
              } ${loading ? 'opacity-60' : ''}`}
              aria-label={`Выбрать форму аватара: ${option.value}`}
            >
              <ShapePreview shape={option.value} active={active} />
            </button>
          )
        })}
      </div>
    </div>
  )
}