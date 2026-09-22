/**
 * 공통 UI — 큰 글자·큰 버튼·과도한 카드 금지. 홈페이지·운영 OS 의 Tailwind 패턴을 따르되 브랜드 토큰을 쓴다.
 */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { EvidenceStatus, Level } from '../types/domain'
import { EVIDENCE_LABEL, LEVEL_LABEL } from '../content/labels'

/* ── Button ───────────────────────────────────────────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white border border-accent-600 hover:bg-accent-700 hover:border-accent-700',
  secondary: 'bg-white text-ink-900 border border-line-strong hover:bg-paper-2',
  ghost: 'bg-transparent text-ink-700 border border-transparent hover:bg-paper-2',
  danger: 'bg-white text-danger-700 border border-danger-600/40 hover:bg-danger-50',
  dark: 'bg-ink-900 text-white border border-ink-900 hover:bg-ink-700',
}
const SIZE: Record<Size, string> = {
  sm: 'h-10 px-3 t-sub gap-1.5',
  md: 'h-12 px-4 t-body gap-2',
  lg: 'h-14 px-5 text-[1.1rem] gap-2',
}
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button type={type} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

/* ── 큰 선택 버튼 (클릭 입력의 주인공) ────────────────────── */
export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  multi = false,
  ariaLabel,
}: {
  options: { value: T; label: string; hint?: string }[]
  value: T | T[] | null
  onChange: (v: T) => void
  columns?: 1 | 2 | 3
  multi?: boolean
  ariaLabel?: string
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v)
  const cols = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={ariaLabel} className={`grid gap-2.5 ${cols}`}>
      {options.map((o) => {
        const on = selected(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`tap flex min-h-14 flex-col items-start justify-center rounded-(--radius-control) border-2 px-4 py-3 text-left transition-colors ${
              on ? 'border-accent-600 bg-accent-50 text-ink-900' : 'border-line bg-white text-ink-900 hover:border-line-strong'
            }`}
          >
            <span className="text-[1.05rem] font-bold leading-snug">{o.label}</span>
            {o.hint && <span className="t-sub mt-0.5 text-ink-500">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ── 입력 ─────────────────────────────────────────────────── */
export const inputClass = 'w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1.05rem] text-ink-900 placeholder:text-ink-300 outline-none focus:border-accent-600'
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-28 leading-relaxed ${props.className ?? ''}`} />
}
export function Field({ label, hint, children, optional }: { label: string; hint?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[1rem] font-bold text-ink-900">
        {label}
        {optional && <span className="t-meta font-medium text-ink-500">선택</span>}
      </span>
      {hint && <span className="t-sub mb-2 block text-ink-500">{hint}</span>}
      {children}
    </label>
  )
}

/* ── 배지 ─────────────────────────────────────────────────── */
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info' | 'dark'; children: ReactNode }) {
  const cls = {
    neutral: 'bg-paper-2 text-ink-700',
    accent: 'bg-accent-50 text-accent-800',
    ok: 'bg-ok-50 text-ok-700',
    warn: 'bg-warn-50 text-warn-700',
    danger: 'bg-danger-50 text-danger-700',
    info: 'bg-info-50 text-info-600',
    dark: 'bg-ink-900 text-white',
  }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 t-meta font-bold ${cls}`}>{children}</span>
}
export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const m = EVIDENCE_LABEL[status]
  const tone = status === 'confirmed' ? 'ok' : status === 'assumed' ? 'warn' : 'neutral'
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{m.icon}</span> {m.label}
    </Badge>
  )
}
export function LevelBadge({ level }: { level: Level }) {
  const tone = level === 'high' ? 'accent' : level === 'medium' ? 'info' : 'neutral'
  return <Badge tone={tone}>{LEVEL_LABEL[level]}</Badge>
}

/* ── 구역 ─────────────────────────────────────────────────── */
export function Section({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-(--radius-card) border border-line bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="t-section">{title}</h2>
          {sub && <p className="t-sub mt-0.5 text-ink-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
export function PageTitle({ title, sub, action, back }: { title: string; sub?: string; action?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="t-page">{title}</h1>
        {sub && <p className="t-body mt-1 text-ink-500">{sub}</p>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  )
}
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-10 text-center">
      <p className="t-section">{title}</p>
      {body && <p className="t-body mt-1 text-ink-500">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
export function Disclosure({ label, children, onOpen }: { label: string; children: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) onOpen?.()
        }}
        className="tap inline-flex items-center gap-1 rounded-(--radius-control) px-2 py-1.5 text-[0.95rem] font-semibold text-accent-700 hover:bg-accent-50"
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <div className="rise mt-1 rounded-(--radius-control) bg-paper-2 px-4 py-3 t-body text-ink-700">{children}</div>}
    </div>
  )
}
export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-500" role="status">
      <span aria-hidden className="size-5 animate-spin rounded-full border-[3px] border-accent-600 border-t-transparent" />
      <span className="t-sub">{label}</span>
    </div>
  )
}

/* ── 토스트 ───────────────────────────────────────────────── */
interface ToastCtx {
  show: (message: string, tone?: 'ok' | 'danger' | 'neutral') => void
}
const ToastContext = createContext<ToastCtx | null>(null)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'ok' | 'danger' | 'neutral' } | null>(null)
  const show = useCallback((message: string, tone: 'ok' | 'danger' | 'neutral' = 'neutral') => {
    const id = Date.now()
    setToast({ id, message, tone })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
          <div className={`rise rounded-(--radius-control) px-4 py-3 text-[1rem] font-semibold shadow-(--shadow-float) ${toast.tone === 'ok' ? 'bg-ok-700 text-white' : toast.tone === 'danger' ? 'bg-danger-700 text-white' : 'bg-ink-900 text-white'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 는 ToastProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
