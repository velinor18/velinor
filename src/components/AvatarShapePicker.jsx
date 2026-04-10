import {
  AVATAR_SHAPE_OPTIONS,
  getAvatarShapeClasses,
  normalizeAvatarShape,
} from '../lib/avatarShapes'

function ShapePreview({ shape, active }) {
  const classes = getAvatarShapeClasses(shape)

  return (
    <div
      className={`flex h-20 w-20 items-center justify-center bg-fuchsia-500/20 p-[3px] transition sm:h-24 sm:w-24 ${
        classes.optionOuter
      } ${active ? 'shadow-[0_0_30px_rgba(168,85,247,0.35)]' : ''}`}
    >
      <div
        className={`flex h-full w-full items-center justify-center bg-[#090912] text-xl font-black text-white sm:text-2xl ${
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {AVATAR_SHAPE_OPTIONS.map((option) => {
          const active = option.value === currentValue

          return (
            <button
              key={option.value}
              type="button"
              disabled={loading}
              onClick={() => onChange(option.value)}
              className={`aspect-square rounded-[24px] border transition ${
                active
                  ? 'border-fuchsia-400/50 bg-fuchsia-700/15'
                  : 'border-fuchsia-500/15 bg-white/[0.02] hover:border-fuchsia-400/35 hover:bg-fuchsia-900/10'
              } ${loading ? 'opacity-60' : ''}`}
              aria-label={`Выбрать форму аватара: ${option.value}`}
            >
              <div className="flex h-full w-full items-center justify-center p-4 sm:p-5">
                <ShapePreview shape={option.value} active={active} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}