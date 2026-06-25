import { Icon, type IconName } from './Icon'

export interface SegOption<T> {
  value: T
  icon?: IconName
  label?: string
  title: string
}

export function Segmented<T extends string | number>({
  options,
  value,
  onSelect,
}: {
  options: SegOption<T>[]
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div className="sketch-segmented">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.title}
          title={option.title}
          onClick={() => onSelect(option.value)}
        >
          {option.icon ? <Icon name={option.icon} size={16} /> : option.label}
        </button>
      ))}
    </div>
  )
}
