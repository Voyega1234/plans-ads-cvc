'use client'

export type Language = 'th' | 'en' | 'both'

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'th',   label: 'ภาษาไทย' },
  { value: 'en',   label: 'English' },
  { value: 'both', label: 'ทั้งคู่' },
]

export default function LanguagePicker({
  value,
  onChange,
  label = 'ภาษาของผลลัพธ์',
}: {
  value: Language
  onChange: (v: Language) => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {label && (
        <span className="text-xs text-neutral-500 shrink-0">{label}:</span>
      )}
      <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 gap-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              value === opt.value
                ? 'bg-white text-neutral-950 border border-neutral-200'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
