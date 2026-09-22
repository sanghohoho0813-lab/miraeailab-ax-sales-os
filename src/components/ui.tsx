/**
 * 공통 UI — 큰 글자·큰 버튼·과도한 카드 금지. 홈페이지·운영 OS 의 Tailwind 패턴을 따르되 브랜드 토큰을 쓴다.
 */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  sm: 'h-10 px-3 text-[0.92rem] gap-1.5',
  md: 'h-12 px-4 text-[1rem] gap-2',
  lg: 'h-14 px-6 text-[1.1rem] gap-2',
}
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button type={type} className={`btn inline-flex shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest}>
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
            className={`choice tap flex min-h-14 flex-col items-start justify-center rounded-(--radius-control) border-2 px-4 py-3 text-left ${
              on ? 'border-accent-600 bg-accent-50 text-ink-900' : 'border-line bg-white text-ink-900 hover:border-accent-200 hover:bg-accent-50/40'
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
    <section className={`rounded-(--radius-card) border border-line bg-white p-4 sm:p-5 lg:p-6 ${className}`}>
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
interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}
interface ToastCtx {
  show: (message: string, tone?: 'ok' | 'danger' | 'neutral', action?: ToastAction) => void
}
const ToastContext = createContext<ToastCtx | null>(null)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'ok' | 'danger' | 'neutral'; action?: ToastAction } | null>(null)
  const show = useCallback((message: string, tone: 'ok' | 'danger' | 'neutral' = 'neutral', action?: ToastAction) => {
    const id = Date.now()
    setToast({ id, message, tone, action })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 8000 : 3500)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
          <div className={`rise pointer-events-auto flex items-center gap-3 rounded-(--radius-control) px-4 py-3 text-[1rem] font-semibold shadow-(--shadow-float) ${toast.tone === 'ok' ? 'bg-ok-700 text-white' : toast.tone === 'danger' ? 'bg-danger-700 text-white' : 'bg-ink-900 text-white'}`} data-testid="toast">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  void toast.action?.onClick()
                  setToast(null)
                }}
                className="btn rounded-full bg-white/15 px-3 py-1 text-[0.95rem] font-bold text-white hover:bg-white/25"
                data-testid="toast-action"
              >
                {toast.action.label}
              </button>
            )}
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

/* ── 스켈레톤 ─────────────────────────────────────────────── */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}
export function SkeletonList({ rows = 3, lines = 2 }: { rows?: number; lines?: number }) {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-(--radius-card) border border-line bg-white p-4">
          <Skeleton className="h-5 w-2/5" />
          {Array.from({ length: lines }).map((_, j) => (
            <Skeleton key={j} className={`mt-2 h-4 ${j % 2 ? 'w-3/5' : 'w-4/5'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── 숫자 카운트업 (KPI) — 450~800ms, 1회 ───────────────── */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? target : 0))
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}
export function Stat({ label, value, unit = '', hint, tone = 'kpi' }: { label: string; value: number; unit?: string; hint?: string; tone?: 'kpi' | 'accent' }) {
  const v = useCountUp(value)
  return (
    <div>
      <p className="t-sub font-semibold text-ink-500">{label}</p>
      <p className={`t-kpi mt-1 ${tone === 'accent' ? 'text-accent-700' : 'text-kpi'}`}>
        {v}
        {unit && <span className="ml-1 text-[1.1rem] font-bold text-ink-500">{unit}</span>}
      </p>
      {hint && <p className="t-meta mt-1 text-ink-500">{hint}</p>}
    </div>
  )
}

/* ── 시트 / 모달 — 모바일은 바텀시트, PC 는 가운데 모달. 닫힘 시 스크롤·포커스 복원 ── */
export function Sheet({ open, onClose, title, children, wide = false, testId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; testId?: string }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lastActive = useRef<Element | null>(null)
  useEffect(() => {
    if (!open) return
    lastActive.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const first = panelRef.current?.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      const el = lastActive.current as HTMLElement | null
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" data-testid={testId}>
      <div className="backdrop-enter absolute inset-0 bg-ink-900/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-enter relative flex max-h-[88dvh] w-full flex-col rounded-t-[22px] bg-white shadow-(--shadow-sheet) sm:rounded-(--radius-card) ${wide ? 'sm:max-w-[820px]' : 'sm:max-w-[600px]'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="t-section truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="nav-item tap inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-paper-2">
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ── 레이아웃 변주: 플랫 구역·강조 스트립·하이라이트 인사이트 ───── */
export function FlatSection({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
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
export function AccentStrip({ label, children, tone = 'accent' }: { label?: string; children: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'info' }) {
  const border = { accent: 'border-accent-600', ok: 'border-ok-600', warn: 'border-warn-600', info: 'border-info-600' }[tone]
  const bg = { accent: 'bg-accent-50', ok: 'bg-ok-50', warn: 'bg-warn-50', info: 'bg-info-50' }[tone]
  return (
    <div className={`rounded-r-(--radius-control) border-l-4 ${border} ${bg} px-4 py-3`}>
      {label && <p className="t-meta font-black tracking-wide text-ink-500">{label}</p>}
      <div className="t-body text-ink-900">{children}</div>
    </div>
  )
}
export function Insight({ children }: { children: ReactNode }) {
  return (
    <blockquote className="rounded-(--radius-card) bg-ink-900 px-5 py-4 text-white">
      <p className="text-[1.1rem] font-semibold leading-relaxed">{children}</p>
    </blockquote>
  )
}

/* ── 위험 작업 모달 — window.confirm 금지. 영향 범위 · 복구 가능 여부 · (필요 시) 이름 입력 확인 ── */
export function DangerModal({
  open,
  onClose,
  title,
  impact,
  recoverable,
  confirmLabel,
  typedConfirm,
  onConfirm,
  busy = false,
  tone = 'danger',
  confirmDisabled = false,
  children,
  testId,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** 무엇이 영향을 받는가 */
  impact: string[]
  /** 복구 가능 여부 문장 */
  recoverable: string
  confirmLabel: string
  /** 있으면 이 문자열을 그대로 입력해야 버튼이 활성화된다 (2단계 검증) */
  typedConfirm?: string
  onConfirm: () => void | Promise<void>
  busy?: boolean
  tone?: 'danger' | 'warn'
  /** DB 가 거부할 작업이면 버튼 자체를 막는다 (이유는 recoverable 에) */
  confirmDisabled?: boolean
  children?: ReactNode
  testId?: string
}) {
  const [typed, setTyped] = useState('')
  const close = () => {
    setTyped('')
    onClose()
  }
  const norm = (s: string) => s.replace(/\s/g, '')
  const ok = !typedConfirm || norm(typed) === norm(typedConfirm)
  return (
    <Sheet open={open} onClose={close} title={title} testId={testId}>
      <div className="space-y-4">
        {impact.length > 0 && (
          <div className={`rounded-r-(--radius-control) border-l-4 px-4 py-3 ${tone === 'danger' ? 'border-danger-600 bg-danger-50' : 'border-warn-600 bg-warn-50'}`}>
            <p className="t-meta font-black tracking-wide text-ink-500">함께 영향을 받는 것</p>
            <ul className="t-body mt-1 list-disc space-y-0.5 pl-5">
              {impact.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <p className={`t-body font-semibold ${tone === 'danger' ? 'text-danger-700' : 'text-ink-900'}`}>{recoverable}</p>
        {children}
        {typedConfirm && (
          <label className="block">
            <span className="t-sub mb-1.5 block font-bold text-ink-700">
              확인을 위해 <span className="rounded bg-paper-2 px-1.5 py-0.5 font-black text-ink-900">{typedConfirm}</span> 을(를) 입력하세요
            </span>
            <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typedConfirm} autoComplete="off" data-testid="danger-typed" />
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button onClick={close} disabled={busy}>
            취소
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'dark'}
            onClick={() => {
              setTyped('')
              void onConfirm()
            }}
            disabled={!ok || busy || confirmDisabled}
            data-testid="danger-confirm"
          >
            {busy ? '처리 중…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ── 저장 상태 표시 ────────────────────────────────────────── */
export function SaveStatusPill({ status, pending }: { status: 'saved' | 'saving' | 'offline' | 'error'; pending: boolean }) {
  const map = {
    saved: { label: '저장됨 ✓', cls: 'bg-ok-50 text-ok-700' },
    saving: { label: '저장 중…', cls: 'bg-paper-2 text-ink-700' },
    offline: { label: '끊김 · 임시저장됨', cls: 'bg-warn-50 text-warn-700' },
    error: { label: pending ? '대기 · 임시저장됨' : '저장 실패', cls: 'bg-warn-50 text-warn-700' },
  }[status]
  return (
    <span role="status" aria-live="polite" data-testid="save-status" data-status={status} className={`tnum inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 t-meta font-bold ${map.cls}`}>
      {map.label}
    </span>
  )
}
