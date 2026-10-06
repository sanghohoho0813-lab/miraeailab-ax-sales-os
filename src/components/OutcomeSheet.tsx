/**
 * 결과 기록 — 계약 · 보류 · 무산. 큰 버튼 셋 중 하나, 필요한 것만 한 단계 더.
 *   계약 → 메모(선택)
 *   보류 → 언제 다시 연락할지 (2주 후 · 1달 후 · 3달 후 · 날짜 직접). 그날 홈 "지금 할 일" 에 "연락하기" 로 올라온다
 *   무산 → 사유 하나. 자유 입력이 아니라 고정 목록이어야 모아서 "왜 놓치는지" 를 볼 수 있다
 *
 * 2차 미팅 뒤에 쓰는 것이 기본이지만, 1차 미팅 뒤 대표가 거절했을 때도 쓴다 —
 * 그래야 "2차 제안 요청을 안 보냈다" 는 할 일이 영원히 남지 않는다.
 * 이미 기록돼 있으면 그 값으로 열리고, [결과 지우기] 로 진행 중으로 되돌린다.
 */
import { useState } from 'react'
import { useSession } from '../lib/auth'
import type { Company, DealOutcome, DealOutcomeKind, LostReason } from '../types/domain'
import { Button, ChoiceGrid, Sheet, TextInput, useToast } from './ui'
import { LOST_REASON_LABEL, LOST_REASON_ORDER, OUTCOME_HINT, OUTCOME_LABEL } from '../content/labels'
import { formatDate, isoToLocalInput, localInputToIso } from '../lib/util'
import { josa } from '../content/korean'

type FollowUp = '2w' | '1m' | '3m' | 'custom'
const FOLLOW_UP: { value: FollowUp; label: string; days: number }[] = [
  { value: '2w', label: '2주 후', days: 14 },
  { value: '1m', label: '1달 후', days: 30 },
  { value: '3m', label: '3달 후', days: 90 },
]

/** 오늘부터 n일 뒤 오전 10시 — 재연락은 날짜가 중요하고 시각은 아니다 */
function daysLater(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

export function OutcomeSheet({ company, open, onClose, onSaved }: { company: Company; open: boolean; onClose: () => void; onSaved: (c: Company) => void }) {
  // 시트를 열 때마다 폼을 새로 만든다 — 취소하고 다시 열면 저장된 값에서 시작한다
  return (
    <Sheet open={open} onClose={onClose} title={`${company.name} · 결과 기록`} testId="outcome-sheet">
      <OutcomeForm company={company} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  )
}

function initialFollowUp(o: DealOutcome | null): { mode: FollowUp; date: string } {
  return o?.followUpAt ? { mode: 'custom', date: isoToLocalInput(o.followUpAt).slice(0, 10) } : { mode: '1m', date: '' }
}

function OutcomeForm({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: (c: Company) => void }) {
  const { user, repo } = useSession()
  const toast = useToast()
  const cur = company.outcome ?? null
  const [kind, setKind] = useState<DealOutcomeKind | null>(cur?.kind ?? null)
  const [followUp, setFollowUp] = useState<FollowUp>(() => initialFollowUp(cur).mode)
  const [customDate, setCustomDate] = useState(() => initialFollowUp(cur).date)
  const [reason, setReason] = useState<LostReason | null>(cur?.reason ?? null)
  const [note, setNote] = useState(cur?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function followUpAt(): string | null {
    if (followUp !== 'custom') return daysLater(FOLLOW_UP.find((f) => f.value === followUp)?.days ?? 30)
    return customDate ? localInputToIso(`${customDate}T10:00`) : null
  }

  async function save() {
    if (!kind) return setError('결과를 골라 주세요.')
    if (kind === 'lost' && !reason) return setError('무산 사유를 하나 골라 주세요 — 모아서 설명을 고치는 데 씁니다.')
    const fu = kind === 'hold' ? followUpAt() : null
    if (kind === 'hold' && !fu) return setError('다시 연락할 날짜를 골라 주세요.')
    const outcome: DealOutcome = { kind, at: new Date().toISOString(), by: user.id, ...(fu ? { followUpAt: fu } : {}), ...(kind === 'lost' && reason ? { reason } : {}), ...(note.trim() ? { note: note.trim().slice(0, 100) } : {}) }
    await persist(outcome)
  }

  async function persist(outcome: DealOutcome | null) {
    setBusy(true)
    try {
      const next = await repo.updateCompany(user, { ...company, outcome })
      onSaved(next)
      onClose()
      toast.show(
        !outcome
          ? '결과를 지웠습니다. 다시 진행 중으로 봅니다.'
          : outcome.kind === 'hold' && outcome.followUpAt
            ? `보류로 기록했습니다. ${formatDate(outcome.followUpAt)}에 할 일로 올라옵니다.`
            : `${OUTCOME_LABEL[outcome.kind]}${josa(OUTCOME_LABEL[outcome.kind], '으로/로')} 기록했습니다.`,
        'ok',
      )
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '결과를 저장하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ChoiceGrid<DealOutcomeKind>
        ariaLabel="결과"
        columns={3}
        options={(['won', 'hold', 'lost'] as DealOutcomeKind[]).map((k) => ({ value: k, label: OUTCOME_LABEL[k], hint: OUTCOME_HINT[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k)
          setError('')
        }}
      />

      {kind === 'hold' && (
        <div className="mt-5" data-testid="outcome-followup">
          <p className="mb-2 text-[1rem] font-bold">언제 다시 연락할까요?</p>
          <div className="flex flex-wrap items-center gap-2">
            {FOLLOW_UP.map((f) => (
              <button key={f.value} type="button" aria-pressed={followUp === f.value} onClick={() => setFollowUp(f.value)} className={`tap btn inline-flex min-h-12 items-center rounded-(--radius-control) border-2 px-4 text-[1rem] font-bold ${followUp === f.value ? 'border-accent-600 bg-accent-50' : 'border-line bg-white hover:border-accent-200'}`} data-testid={`followup-${f.value}`}>
                {f.label}
              </button>
            ))}
            <input
              type="date"
              aria-label="다시 연락할 날짜"
              value={followUp === 'custom' ? customDate : ''}
              onChange={(e) => {
                setCustomDate(e.target.value)
                setFollowUp('custom')
              }}
              className="tap rounded-(--radius-control) border border-line-strong bg-white px-3 text-[1rem]"
              data-testid="followup-date"
            />
          </div>
          {followUpAt() && <p className="t-sub mt-2 text-ink-500">{formatDate(followUpAt())}에 홈 "지금 할 일" 에 올라옵니다.</p>}
        </div>
      )}

      {kind === 'lost' && (
        <div className="mt-5" data-testid="outcome-reason">
          <p className="mb-2 text-[1rem] font-bold">가장 큰 이유 하나</p>
          <ChoiceGrid<LostReason>
            ariaLabel="무산 사유"
            columns={3}
            options={LOST_REASON_ORDER.map((r) => ({ value: r, label: LOST_REASON_LABEL[r] }))}
            value={reason}
            onChange={(r) => {
              setReason(r)
              setError('')
            }}
          />
        </div>
      )}

      {kind && (
        <label className="mt-5 block">
          <span className="mb-1.5 flex items-baseline gap-2 text-[1rem] font-bold">
            메모 <span className="t-meta font-medium text-ink-500">선택</span>
          </span>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder={kind === 'won' ? '예: 정책자금 + 연구소 패키지' : kind === 'hold' ? '예: 내년 1월 예산 확정 후' : '예: 올해는 설비 투자 우선'} data-testid="outcome-note" />
        </label>
      )}

      {error && (
        <p className="t-sub mt-4 font-semibold text-danger-700" role="alert" data-testid="outcome-error">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[200px]" onClick={() => void save()} disabled={busy} data-testid="outcome-save">
          저장
        </Button>
        {cur && (
          <button type="button" onClick={() => void persist(null)} disabled={busy} className="tap t-sub px-2 font-semibold text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline" data-testid="outcome-clear">
            결과 지우기 (진행 중으로)
          </button>
        )}
      </div>
    </>
  )
}
