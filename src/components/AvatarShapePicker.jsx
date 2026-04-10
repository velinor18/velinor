import {
  AVATAR_SHAPE_OPTIONS,
  getAvatarShapeClasses,
  normalizeAvatarShape,
} from '../lib/avatarShapes'

function ShapePreview({ shape, active }) {
  const classes = getAvatarShapeClasses(shape)

  return (
    <div
      className={`flex h-14 w-14 items-center justify-center bg-fuchsia-500/20 p-[2px] ${
        classes.optionOuter
      } ${active ? 'shadow-[0_0_25px_rgba(168,85,247,0.35)]' : ''}`}
    >
      <div
        className={`flex h-full w-full items-center justify-center bg-[#090912] text-base font-black text-white ${
          classes.optionInner
        }`}
      >
        A
      </div>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AVATAR_SHAPE_OPTIONS.map((option) => {
          const active = option.value === currentValue

          return (
            <button
              key={option.value}
              type="button"
              disabled={loading}
              onClick={() => onChange(option.value)}
              className={`rounded-2xl border px-3 py-4 text-center transition ${
                active
                  ? 'border-fuchsia-400/50 bg-fuchsia-700/15'
                  : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/35 hover:bg-fuchsia-900/10'
              } ${loading ? 'opacity-60' : ''}`}
            >
              <div className="flex justify-center">
                <ShapePreview shape={option.value} active={active} />
              </div>

              <div className="mt-3 text-xs font-bold uppercase tracking-wide text-zinc-200">
                {option.label}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}