/**
 * 음성 입력 — (1) 항목별 마이크 버튼 (2) [음성으로 한 번에 입력] 시트: 듣기 → "이렇게 들었습니다" 초안 → [확인]/[수정].
 * 브라우저 SpeechRecognition 을 lib/speech 로 재사용한다. 미지원이면 버튼을 숨기고 텍스트 입력만 남긴다. DB 저장은 확인 뒤에만.
 */
import { useState } from 'react'
import { Mic, MicOff, Check, Pencil } from 'lucide-react'
import { Button, Sheet, TextArea, EvidenceBadge } from './ui'
import { useSpeechCapture, speechSupported } from '../lib/speech'
import { parseVoiceIntake, countFilled, type VoiceDraft } from '../engine/voiceIntake'
import { HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, TRADE_LABEL } from '../content/labels'
import { formatDate } from '../lib/util'

/** 항목 옆 마이크 — 결과를 onText 로 넘긴다 (전화번호 등은 호출 측이 정규화) */
export function VoiceButton({ onText, label = '음성으로 말하기', size = 'md', testId }: { onText: (t: string) => void; label?: string; size?: 'sm' | 'md' | 'lg'; testId?: string }) {
  const { listening, supported, start, stop } = useSpeechCapture({ onResult: onText })
  if (!supported) return null
  return (
    <Button size={size} variant={listening ? 'danger' : 'secondary'} onClick={listening ? stop : start} aria-pressed={listening} aria-label={label} data-testid={testId} className="shrink-0">
      {listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
      <span className="hidden sm:inline">{listening ? '듣는 중…' : label}</span>
    </Button>
  )
}

export interface VoiceApply {
  companyName?: string
  representativeName?: string
  phone?: string
  headcount?: VoiceDraft['headcount']['value']
  industry?: VoiceDraft['industry']['value']
  tradeType?: VoiceDraft['tradeType']['value']
  meetingAt?: string
  interests?: NonNullable<VoiceDraft['interests']['value']>
}

/** [음성으로 한 번에 입력] — 시트 안에서 듣고, 초안을 보여 주고, 확인한 값만 돌려준다 */
export function VoiceIntakeSheet({ open, onClose, onApply, onUsed }: { open: boolean; onClose: () => void; onApply: (v: VoiceApply) => void; onUsed?: () => void }) {
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [editing, setEditing] = useState(false)
  const { listening, supported, start, stop } = useSpeechCapture({
    onResult: (t) => {
      setTranscript(t)
      setDraft(parseVoiceIntake(t))
      onUsed?.()
    },
  })
  const close = () => {
    stop()
    setTranscript('')
    setDraft(null)
    setEditing(false)
    onClose()
  }
  const reparse = (t: string) => {
    setTranscript(t)
    setDraft(t.trim() ? parseVoiceIntake(t) : null)
  }
  const apply = () => {
    if (!draft) return
    const v: VoiceApply = {}
    if (draft.companyName.value) v.companyName = draft.companyName.value
    if (draft.representativeName.value) v.representativeName = draft.representativeName.value
    if (draft.phone.value) v.phone = draft.phone.value
    // 확신 없는 값은 자동 선택하지 않는다 — 확인(confirmed)만 넘긴다. 추정(assumed)은 사용자가 화면에서 고른다
    if (draft.headcount.value && draft.headcount.status === 'confirmed') v.headcount = draft.headcount.value
    if (draft.industry.value && draft.industry.status === 'confirmed') v.industry = draft.industry.value
    if (draft.tradeType.value && draft.tradeType.status === 'confirmed') v.tradeType = draft.tradeType.value
    if (draft.meetingAt.value && draft.meetingAt.status === 'confirmed') v.meetingAt = draft.meetingAt.value
    if (draft.interests.value) v.interests = draft.interests.value
    onApply(v)
    close()
  }

  const row = (label: string, f: { value: unknown; status: 'confirmed' | 'assumed' | 'unknown'; text: string }, display: string) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5" data-testid="voice-row" data-key={label}>
      <span className="t-sub w-24 shrink-0 font-bold text-ink-500">{label}</span>
      <span className="min-w-0 flex-1 text-[1.05rem] font-bold">{f.value === null ? <span className="font-medium text-ink-300">못 들었습니다</span> : display}</span>
      <EvidenceBadge status={f.status} />
    </li>
  )

  return (
    <Sheet open={open} onClose={close} title="음성으로 한 번에 입력" testId="voice-sheet">
      {!supported ? (
        <p className="t-body text-ink-700">이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력해 주세요.</p>
      ) : (
        <div className="space-y-4">
          <p className="t-body text-ink-700">
            예: <i>"ABC산업 김철수 대표, 오늘 오후 세시 미팅이고 직원은 열다섯 명 정도, 제조업입니다."</i>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={listening ? 'danger' : 'primary'} size="lg" onClick={listening ? stop : start} aria-pressed={listening} data-testid="voice-start" className="w-full sm:w-auto">
              {listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
              {listening ? '듣는 중… (누르면 중지)' : draft ? '다시 말하기' : '말하기 시작'}
            </Button>
            {draft && (
              <Button onClick={() => setEditing((e) => !e)} aria-pressed={editing} data-testid="voice-edit">
                <Pencil aria-hidden="true" className="size-4" /> 들은 내용 수정
              </Button>
            )}
          </div>
          {editing && <TextArea value={transcript} onChange={(e) => reparse(e.target.value)} aria-label="들은 내용" data-testid="voice-transcript" />}
          {draft && (
            <div>
              <p className="t-section">이렇게 들었습니다</p>
              <p className="t-meta mt-1 text-ink-500">"{draft.transcript}"</p>
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {row('회사', draft.companyName, draft.companyName.value ?? '')}
                {row('대표', draft.representativeName, draft.representativeName.value ?? '')}
                {row('연락처', draft.phone, draft.phone.value ?? '')}
                {row('미팅', draft.meetingAt, draft.meetingAt.value ? formatDate(draft.meetingAt.value, true) : '')}
                {row('인원', draft.headcount, draft.headcount.value ? `${HEADCOUNT_LABEL[draft.headcount.value]}${draft.headcountNumber ? ` (${draft.headcountNumber}명)` : ''}` : '')}
                {row('업종', draft.industry, draft.industry.value ? INDUSTRY_LABEL[draft.industry.value] : '')}
                {row('거래형태', draft.tradeType, draft.tradeType.value ? TRADE_LABEL[draft.tradeType.value] : '')}
                {row('관심사', draft.interests, (draft.interests.value ?? []).map((i) => INTEREST_LABEL[i]).join(' · '))}
              </ul>
              <p className="t-meta mt-2 text-ink-500">🟡 추정 값은 자동으로 고르지 않습니다 — 화면에서 직접 확인해 주세요. 못 들은 항목은 비워 둡니다.</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button onClick={close}>취소</Button>
                <Button variant="primary" onClick={apply} disabled={countFilled(draft) === 0} data-testid="voice-apply">
                  <Check aria-hidden="true" className="size-4" /> 확인 — 폼에 채우기
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

export { speechSupported }
