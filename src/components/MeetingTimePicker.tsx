/**
 * 미팅 일시 — datetime-local 을 주역으로 쓰지 않는다.
 * 기본은 "오늘 · 지금"(Live Now: 실제 현재 시각이 계속 갱신되고 저장하는 순간의 시각이 확정된다).
 * [지금][오늘][내일] · [+30분][+1시간] · [다른 날짜] → 날짜 + 시간 선택. 다시 [지금] 을 누르면 Live Now 복귀.
 */
import { useMemo, useState } from 'react'
import { CalendarDays, Clock3, X } from 'lucide-react'
import { useClock } from '../lib/clock'
import { formatDate, isoToLocalInput, localInputToIso, relativeDay } from '../lib/util'

export type MeetingTimeValue = { mode: 'now' } | { mode: 'custom'; iso: string } | { mode: 'none' }

/** 저장 시점의 실제 ISO — now 모드는 저장하는 순간의 시각 */
export function resolveMeetingTime(v: MeetingTimeValue): string | null {
  if (v.mode === 'now') return new Date().toISOString()
  if (v.mode === 'custom') return v.iso
  return null
}

export function meetingTimeFromIso(iso: string | null | undefined): MeetingTimeValue {
  return iso ? { mode: 'custom', iso } : { mode: 'none' }
}

const HOURS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

function nextHalfHour(from: Date): Date {
  const d = new Date(from)
  d.setSeconds(0, 0)
  const m = d.getMinutes()
  d.setMinutes(m < 30 ? 30 : 60)
  return d
}

export function MeetingTimePicker({ value, onChange, allowNone = true }: { value: MeetingTimeValue; onChange: (v: MeetingTimeValue) => void; allowNone?: boolean }) {
  const clock = useClock()
  const [picking, setPicking] = useState(false)
  const base = useMemo(() => (value.mode === 'custom' ? new Date(value.iso) : new Date()), [value])

  const chip = (label: string, on: boolean, onClick: () => void, testId: string) => (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId} className={`tap btn inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border-2 px-4 text-[1rem] font-bold ${on ? 'border-accent-600 bg-accent-50 text-ink-900' : 'border-line bg-white text-ink-900 hover:border-accent-200'}`}>
      {label}
    </button>
  )
  const setCustom = (d: Date) => onChange({ mode: 'custom', iso: d.toISOString() })
  const add = (minutes: number) => {
    const d = value.mode === 'custom' ? new Date(value.iso) : new Date()
    d.setMinutes(d.getMinutes() + minutes)
    setCustom(d)
  }
  const isToday = value.mode === 'custom' && relativeDay(value.iso) === '오늘'
  const isTomorrow = value.mode === 'custom' && relativeDay(value.iso) === '내일'

  return (
    <div data-testid="meeting-time" data-mode={value.mode}>
      <div className="flex flex-wrap items-center gap-2">
        {chip('지금', value.mode === 'now', () => {
          setPicking(false)
          onChange({ mode: 'now' })
        }, 'time-now')}
        {chip('오늘', isToday, () => {
          setPicking(false)
          setCustom(nextHalfHour(new Date()))
        }, 'time-today')}
        {chip('내일', isTomorrow, () => {
          setPicking(false)
          const d = new Date()
          d.setDate(d.getDate() + 1)
          d.setHours(10, 0, 0, 0)
          setCustom(d)
        }, 'time-tomorrow')}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        {chip('+30분', false, () => add(30), 'time-plus-30')}
        {chip('+1시간', false, () => add(60), 'time-plus-60')}
        {chip('다른 날짜', picking, () => setPicking((p) => !p), 'time-other')}
        {allowNone && value.mode !== 'none' && (
          <button type="button" onClick={() => {
            setPicking(false)
            onChange({ mode: 'none' })
          }} className="tap inline-flex items-center gap-1 rounded-(--radius-control) px-3 t-sub font-semibold text-ink-500 hover:text-danger-700" data-testid="time-clear">
            <X aria-hidden="true" className="size-4" /> 지우기
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-(--radius-control) bg-paper-2 px-4 py-3" aria-live="polite">
        {value.mode === 'now' ? (
          <>
            <Clock3 aria-hidden="true" className="size-5 text-accent-600" />
            <div className="min-w-0">
              <p className="t-meta font-bold tracking-wide text-accent-800">오늘 · 지금</p>
              <p className="tnum text-[1.35rem] font-black leading-tight" data-testid="time-live">
                {clock.short}
                <span className="t-meta ml-1 font-semibold text-ink-500">{clock.time.slice(-2)}</span>
              </p>
              <p className="t-meta text-ink-500">저장하는 순간의 시각으로 확정됩니다</p>
            </div>
          </>
        ) : value.mode === 'custom' ? (
          <>
            <CalendarDays aria-hidden="true" className="size-5 text-accent-600" />
            <div className="min-w-0">
              <p className="t-meta font-bold tracking-wide text-accent-800">{relativeDay(value.iso) || '예정'}</p>
              <p className="tnum text-[1.35rem] font-black leading-tight" data-testid="time-custom">
                {formatDate(value.iso, true)}
              </p>
            </div>
          </>
        ) : (
          <p className="t-sub text-ink-500">미팅 일시 없음 — 나중에 넣어도 됩니다.</p>
        )}
      </div>

      {picking && (
        <div className="mt-3 rounded-(--radius-card) border border-line bg-white p-4" data-testid="time-picker">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <label className="block">
              <span className="t-sub mb-1.5 block font-bold text-ink-700">날짜</span>
              <input
                type="date"
                value={isoToLocalInput(base.toISOString()).slice(0, 10)}
                onChange={(e) => {
                  if (!e.target.value) return
                  const [y, m, d] = e.target.value.split('-').map(Number)
                  const next = new Date(base)
                  next.setFullYear(y, m - 1, d)
                  setCustom(next)
                }}
                className="tap rounded-(--radius-control) border border-line-strong bg-white px-3 text-[1rem]"
                data-testid="time-date"
              />
            </label>
            <div>
              <span className="t-sub mb-1.5 block font-bold text-ink-700">시간</span>
              <div className="flex flex-wrap gap-2">
                {HOURS.map((h) => {
                  const [hh, mm] = h.split(':').map(Number)
                  const on = value.mode === 'custom' && base.getHours() === hh && base.getMinutes() === mm
                  return (
                    <button key={h} type="button" onClick={() => {
                      const next = new Date(base)
                      next.setHours(hh, mm, 0, 0)
                      setCustom(next)
                    }} aria-pressed={on} className={`tap tnum rounded-(--radius-control) border px-3 text-[0.95rem] font-bold ${on ? 'border-accent-600 bg-accent-50' : 'border-line bg-white hover:border-accent-200'}`}>
                      {h}
                    </button>
                  )
                })}
                <input
                  type="time"
                  aria-label="직접 시간 입력"
                  value={value.mode === 'custom' ? isoToLocalInput(value.iso).slice(11, 16) : ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const [hh, mm] = e.target.value.split(':').map(Number)
                    const next = new Date(base)
                    next.setHours(hh, mm, 0, 0)
                    setCustom(next)
                  }}
                  className="tap rounded-(--radius-control) border border-line-strong bg-white px-3 text-[0.95rem]"
                  data-testid="time-manual"
                />
              </div>
            </div>
          </div>
          <p className="t-meta mt-3 text-ink-500">
            정확한 일시를 직접 넣으려면{' '}
            <input type="datetime-local" aria-label="정확한 일시" value={value.mode === 'custom' ? isoToLocalInput(value.iso) : ''} onChange={(e) => {
              const iso = localInputToIso(e.target.value)
              if (iso) onChange({ mode: 'custom', iso })
            }} className="rounded border border-line px-2 py-1 t-meta" data-testid="company-meeting-at" />
          </p>
        </div>
      )}
    </div>
  )
}
