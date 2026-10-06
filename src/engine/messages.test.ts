import { describe, expect, it } from 'vitest'
import { clientDocs, draftMessage, messageKinds, smsHref, topicText, whenText, type MessageContext } from './messages'
import { workItem } from './workStatus'
import { guardText } from '../content/forbidden'
import { MESSAGE_LABEL, type MessageKind } from '../content/messages'
import type { Analysis, Company, Handoff, Meeting } from '../types/domain'
import type { DocKey } from '../content/documents'

const NOW = new Date(2026, 9, 6, 10, 0)
const iso = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()
const company = (over: Partial<Company> = {}): Company =>
  ({ id: 'c1', consultantId: 'u1', name: 'ABC산업', industry: 'manufacturing', industryNote: '', headcount: '11-20', tradeType: 'b2b', interests: [], representativeName: '김가상', phone: '010-1234-5678', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: iso(2026, 9, 1), updatedAt: iso(2026, 9, 1), ...over }) as Company
const analysis = { painPoints: [
  { rank: 2, clientSafeTitle: '대표 중심으로 주요 확인·의사결정이 이루어지는 구조' },
  { rank: 1, clientSafeTitle: '같은 정보를 여러 곳에 입력하는 과정이 반복되는 구조' },
] } as unknown as Analysis
const meeting = (over: Partial<Meeting> = {}) => ({ id: 'm1', companyId: 'c1', consultantId: 'u1', status: 'analyzed', analysis, endedAt: iso(2026, 10, 6, 9), updatedAt: iso(2026, 10, 6, 9), ...over }) as Meeting
const handoff = (status: Handoff['status']) => ({ id: 'h1', meetingId: 'm1', companyId: 'c1', status, updatedAt: iso(2026, 10, 5), submittedAt: iso(2026, 10, 2) }) as Handoff
const ALL: DocKey[] = ['company_report', 'business_license', 'insurance_roster', 'financial_statement', 'corporate_register']
const partner = { name: '곽주환', title: '팀장' }

function ctx(c: Company, m: Meeting | null, h: Handoff | null, missing: DocKey[] = []): MessageContext {
  return { company: c, partner, work: workItem(c, m, h, NOW), missing, now: NOW }
}

describe('대표님께 보낼 문자 — 무엇을 추천하나', () => {
  it('단계마다 맞는 문자가 먼저, 안 받은 서류가 있으면 서류 요청이 뒤에', () => {
    expect(messageKinds(ctx(company({ meetingAt: iso(2026, 10, 9, 10) }), null, null, ALL))).toEqual(['confirm', 'documents'])
    expect(messageKinds(ctx(company(), meeting(), null, ALL))).toEqual(['thanks', 'documents'])
    expect(messageKinds(ctx(company(), meeting({ status: 'submitted', endedAt: iso(2026, 10, 1), updatedAt: iso(2026, 10, 1) }), handoff('proposal_ready')))).toEqual(['proposal'])
    expect(messageKinds(ctx(company({ meetingAt: iso(2026, 10, 3, 10) }), null, null))).toEqual(['reschedule'])
    expect(messageKinds(ctx(company(), null, null))).toEqual(['schedule'])
    expect(messageKinds(ctx(company({ outcome: { kind: 'hold', at: iso(2026, 10, 7), followUpAt: iso(2026, 10, 20) } }), null, null))).toEqual(['followup'])
    // 무산 고객에게 서류를 요청하지 않는다
    expect(messageKinds(ctx(company({ outcome: { kind: 'lost', at: iso(2026, 10, 7), reason: 'budget' } }), null, null, ALL))).toEqual(['followup'])
  })

  it('기업정보 보고서(크레탑)는 고객에게 요청하지 않는다 — 순서는 고정', () => {
    expect(clientDocs(['corporate_register', 'company_report', 'insurance_roster'])).toEqual(['insurance_roster', 'corporate_register'])
    expect(messageKinds(ctx(company({ meetingAt: iso(2026, 10, 9, 10) }), null, null, ['company_report']))).toEqual(['confirm'])
  })
})

describe('대표님께 보낼 문자 — 본문', () => {
  it('일시는 "10월 9일(목) 오전 10시" 처럼', () => {
    expect(whenText(iso(2026, 10, 9, 10))).toBe('10월 9일(금) 오전 10시')
    expect(whenText(iso(2026, 10, 9, 14, 30))).toBe('10월 9일(금) 오후 2시 30분')
    expect(whenText(iso(2026, 10, 9, 12))).toBe('10월 9일(금) 오후 12시')
    expect(whenText(iso(2026, 10, 9, 0))).toBe('10월 9일(금) 오전 12시')
  })

  it('미팅 확인 — 대표 이름, 일시, 준비할 것 없음. 대표 이름이 없으면 회사명으로', () => {
    const t = draftMessage('confirm', ctx(company({ meetingAt: iso(2026, 10, 9, 10) }), null, null))
    expect(t).toContain('김가상 대표님, 안녕하세요. 미래AI랩 곽주환 팀장입니다.')
    expect(t).toContain('10월 9일(금) 오전 10시 미팅 일정 확인차')
    expect(t).toContain('따로 준비하실 것은 없습니다')
    expect(draftMessage('confirm', ctx(company({ representativeName: '', meetingAt: iso(2026, 10, 9, 10) }), null, null))).toMatch(/^ABC산업 대표님,/)
  })

  it('감사 인사 — 미팅에서 나온 가장 큰 문제를 고객용 표현으로, 오늘/지난번을 가린다', () => {
    expect(topicText(workItem(company(), meeting(), null, NOW))).toBe('같은 정보를 여러 곳에 입력하는 과정이 반복되는 부분 등')
    const today = draftMessage('thanks', ctx(company(), meeting(), null))
    expect(today).toContain('오늘 귀한 시간')
    expect(today).toContain('반복되는 부분 등을 중심으로')
    const earlier = draftMessage('thanks', ctx(company(), meeting({ endedAt: iso(2026, 10, 2), updatedAt: iso(2026, 10, 2) }), null))
    expect(earlier).toContain('지난번 귀한 시간')
    // 분석이 없으면 "내용"
    expect(draftMessage('thanks', ctx(company(), meeting({ analysis: null }), null))).toContain('말씀해 주신 내용을 중심으로')
  })

  it('서류 요청 — 안 받은 고객 서류만 번호를 매겨, 개인정보는 가리라고 먼저 말한다', () => {
    const t = draftMessage('documents', ctx(company(), null, null, ['insurance_roster', 'company_report', 'business_license']))
    expect(t).toContain('1. 사업자등록증')
    expect(t).toContain('2. 4대보험 가입자 명부')
    expect(t).toContain('주민등록번호 뒷자리는 가리고')
    expect(t).not.toContain('크레탑')
    expect(t).not.toContain('3.')
  })

  it('2차 미팅 확인은 1차와 다르다 — 정리한 방향을 설명드리는 자리', () => {
    const c = company({ meetingAt: iso(2026, 10, 9, 15) })
    const t = draftMessage('confirm', ctx(c, meeting({ status: 'submitted', endedAt: iso(2026, 10, 1), updatedAt: iso(2026, 10, 1) }), handoff('proposal_ready')))
    expect(t).toContain('정리한 방향을 30분 정도 설명드리겠습니다')
  })

  it('어떤 문자도 주의 표현·금액·괄호 조사·빈 값이 없다 (모든 단계 × 모든 문자)', () => {
    const kinds = Object.keys(MESSAGE_LABEL) as MessageKind[]
    const contexts = [
      ctx(company({ meetingAt: iso(2026, 10, 9, 10) }), null, null, ALL),
      ctx(company({ representativeName: '', phone: '' }), meeting(), null, ALL),
      ctx(company({ meetingAt: iso(2026, 10, 3) }), null, null, ALL),
      ctx(company({ meetingAt: iso(2026, 10, 9, 15) }), meeting({ status: 'submitted', endedAt: iso(2026, 10, 1), updatedAt: iso(2026, 10, 1) }), handoff('proposal_ready'), ALL),
      ctx(company({ outcome: { kind: 'hold', at: iso(2026, 10, 7), followUpAt: iso(2026, 10, 6) } }), null, null, ALL),
    ]
    for (const c of contexts)
      for (const k of kinds) {
        const t = draftMessage(k, c)
        expect(guardText(t), `${k}: ${t}`).toEqual([])
        expect(t, k).not.toMatch(/\((이|가|을|를|은|는|과|와|으로|로)\)/)
        expect(t, k).not.toMatch(/\d[\d,]*\s*(만\s*)?원/)
        expect(t, k).not.toMatch(/undefined|null|NaN/)
        expect(t.length, k).toBeLessThan(400)
      }
  })

  it('문자 앱 링크 — 번호는 숫자만, 본문은 인코딩. 번호가 없으면 링크 없음', () => {
    const href = smsHref('010-1234-5678', '안녕하세요\n감사합니다')
    expect(href).toBe(`sms:01012345678?&body=${encodeURIComponent('안녕하세요\n감사합니다')}`)
    expect(smsHref('', '본문')).toBeNull()
    expect(smsHref('123', '본문')).toBeNull()
  })
})
