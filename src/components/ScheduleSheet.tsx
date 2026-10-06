/**
 * 다음 미팅 일정 — 고객 정보 수정 화면(3단계 폼)까지 가지 않고 그 자리에서 잡는다.
 *
 * 쓰이는 곳: 2차 제안이 준비됐을 때(2차 미팅), 일정이 지났는데 기록이 없을 때(다시 잡기), 전달 후 다음 미팅을 미리 잡을 때.
 * 저장하면 업무 상태 엔진이 그 일정을 다음 할 일로 올린다(오늘이면 "오늘 미팅", 아니면 "다가오는 미팅").
 * [일정 미정으로] 는 보류·무산된 건이 "지난 미팅" 으로 할 일 큐를 계속 막지 않게 하는 출구다 — 고객 기록은 그대로 남는다.
 */
import { useEffect, useState } from 'react'
import { useSession } from '../lib/auth'
import type { Company } from '../types/domain'
import { Button, Sheet, useToast } from './ui'
import { MeetingTimePicker, meetingTimeFromIso, resolveMeetingTime, type MeetingTimeValue } from './MeetingTimePicker'
import { formatDate, relativeDay } from '../lib/util'

/** 아직 오지 않은 일정만 그대로 보여 준다 — 지난 일정을 기본값으로 두면 같은 날짜를 그대로 저장하기 쉽다 */
function initialValue(company: Company): MeetingTimeValue {
  if (company.meetingAt && new Date(company.meetingAt).getTime() > Date.now()) return meetingTimeFromIso(company.meetingAt)
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return { mode: 'custom', iso: d.toISOString() }
}

export function ScheduleSheet({
  company,
  open,
  onClose,
  onSaved,
  title = '다음 미팅 일정',
  allowClear = false,
}: {
  company: Company
  open: boolean
  onClose: () => void
  onSaved: (c: Company) => void
  title?: string
  /** 잡혀 있던 일정을 비울 수 있는가 — 지난 미팅·예정 미팅을 보류할 때. 2차 미팅을 처음 잡을 때는 비울 일정이 없다 */
  allowClear?: boolean
}) {
  const { user, repo } = useSession()
  const toast = useToast()
  const [value, setValue] = useState<MeetingTimeValue>(() => initialValue(company))
  const [busy, setBusy] = useState(false)

  // 열 때마다 지금 기준으로 다시 고른다 (어제 열어 둔 값이 남지 않게)
  useEffect(() => {
    if (open) setValue(initialValue(company))
  }, [open, company])

  async function save(meetingAt: string | null) {
    setBusy(true)
    try {
      const next = await repo.updateCompany(user, { ...company, meetingAt, fieldSources: { ...company.fieldSources, meetingAt: 'manual' } })
      onSaved(next)
      onClose()
      toast.show(meetingAt ? `${formatDate(meetingAt, true)} (${relativeDay(meetingAt)}) 미팅으로 잡았습니다.` : '일정 미정으로 바꿨습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '일정을 저장하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const past = company.meetingAt && new Date(company.meetingAt).getTime() <= Date.now() ? company.meetingAt : null

  return (
    <Sheet open={open} onClose={onClose} title={`${company.name} · ${title}`} testId="schedule-sheet">
      {past && <p className="t-sub mb-3 text-ink-500">지난 일정 {formatDate(past, true)} ({relativeDay(past)})</p>}
      <MeetingTimePicker value={value} onChange={setValue} allowNone={false} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[200px]" onClick={() => void save(resolveMeetingTime(value))} disabled={busy} data-testid="schedule-save">
          이 일정으로 저장
        </Button>
        {allowClear && company.meetingAt && (
          <button type="button" onClick={() => void save(null)} disabled={busy} className="tap t-sub px-2 font-semibold text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline" data-testid="schedule-clear">
            일정 미정으로 (보류)
          </button>
        )}
      </div>
    </Sheet>
  )
}
