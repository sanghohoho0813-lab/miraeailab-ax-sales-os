/**
 * 대표님께 보낼 문자 — 지금 단계에 맞는 문자를 앱이 가진 정보로 미리 써 둔다.
 *
 * 왜: 컨설턴트는 고객마다 미팅 확인 → 감사 인사 → 서류 요청 → 2차 미팅 제안 → 재연락 문자를 매번 손으로 쓴다.
 * 필요한 정보(대표 이름 · 일정 · 미팅에서 나온 문제 · 아직 안 받은 서류)는 이미 앱에 있다.
 * AI 생성이 아니라 정해진 문구 + 이 고객의 사실이다 — 같은 상황이면 같은 문자, 과장이 끼어들 틈이 없다.
 */
import type { Company } from '../types/domain'
import type { DocKey } from '../content/documents'
import { CLIENT_DOC_ORDER, CLIENT_DOC_REQUEST, type MessageKind } from '../content/messages'
import type { WorkItem } from './workStatus'

export interface MessageContext {
  company: Company
  /** 보내는 사람 — 파트너 이름 · 호칭 */
  partner: { name: string; title?: string }
  work: WorkItem
  /** 아직 받지 못한 서류 (고객에게 요청할 수 있는 것만 문자에 들어간다) */
  missing: DocKey[]
  now?: Date
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** "10월 9일(목) 오전 10시" · "오후 2시 30분" */
export function whenText(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const min = d.getMinutes()
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEK[d.getDay()]}) ${ampm} ${h12}시${min ? ` ${min}분` : ''}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 고객에게 요청할 서류 — 순서 고정, 고객이 줄 수 있는 것만 */
export function clientDocs(missing: DocKey[]): DocKey[] {
  return CLIENT_DOC_ORDER.filter((k) => missing.includes(k) && CLIENT_DOC_REQUEST[k])
}

/**
 * 1차 미팅에서 나온 가장 큰 문제 — 고객에게 보여도 되는 표현에서 "구조/상태/시점" 을 떼어 "부분" 으로.
 * "같은 정보를 여러 곳에 입력하는 과정이 반복되는 구조" → "같은 정보를 여러 곳에 입력하는 과정이 반복되는 부분"
 */
export function topicText(work: WorkItem): string | null {
  const pains = [...(work.meeting?.analysis?.painPoints ?? [])].sort((a, b) => a.rank - b.rank)
  const first = pains[0]?.clientSafeTitle?.trim()
  if (!first) return null
  return `${first.replace(/\s*(구조|상태|시점)$/, '')} 부분${pains.length > 1 ? ' 등' : ''}`
}

/** 지금 단계에서 보낼 만한 문자 — 추천 순서. 비어 있지 않다 */
export function messageKinds(ctx: MessageContext): MessageKind[] {
  const w = ctx.work
  const docs = clientDocs(ctx.missing).length > 0
  const out: MessageKind[] = []
  switch (w.stage) {
    case 'today':
    case 'upcoming':
      out.push('confirm')
      break
    case 'overdue':
      if (w.round2) out.push('thanks')
      out.push('reschedule')
      break
    case 'live':
    case 'analyzed':
    case 'submitted':
      out.push('thanks')
      break
    case 'prep':
      out.push('schedule')
      break
    case 'proposal_ready':
      out.push('proposal')
      break
    case 'followup':
    case 'hold':
    case 'lost':
      out.push('followup')
      break
    default:
      break
  }
  if (docs && w.stage !== 'lost') out.push('documents')
  if (out.length === 0) out.push('followup')
  return out
}

/** 문자 본문 */
export function draftMessage(kind: MessageKind, ctx: MessageContext): string {
  const { company, partner, work } = ctx
  const now = ctx.now ?? new Date()
  const rep = company.representativeName.trim()
  const who = rep ? `${rep} 대표님` : `${company.name} 대표님`
  const me = `미래AI랩 ${partner.name}${partner.title ? ` ${partner.title}` : ''}`
  const hello = `${who}, 안녕하세요. ${me}입니다.`
  const topic = topicText(work)
  const lines: string[] = []

  if (kind === 'schedule') {
    lines.push(hello)
    lines.push('회사에서 반복되는 업무와 요즘 고민을 듣고, 도움이 될 만한 방향을 함께 찾아보고 싶어 연락드립니다.')
    lines.push('30분 정도 괜찮으신 날짜와 시간을 알려 주시면 맞춰서 찾아뵙겠습니다. 감사합니다.')
  } else if (kind === 'confirm') {
    lines.push(hello)
    lines.push(company.meetingAt ? `${whenText(company.meetingAt)} 미팅 일정 확인차 연락드립니다.` : '미팅 일정 확인차 연락드립니다.')
    lines.push(
      work.round2
        ? `지난번 말씀해 주신 ${topic ?? '내용'}을 바탕으로 정리한 방향을 30분 정도 설명드리겠습니다.`
        : '30분 정도 회사에서 반복되는 업무와 요즘 고민을 편하게 여쭤보려고 합니다. 따로 준비하실 것은 없습니다.',
    )
    lines.push('일정 변경이 필요하시면 편하게 말씀해 주세요. 감사합니다.')
  } else if (kind === 'reschedule') {
    lines.push(hello)
    lines.push(company.meetingAt ? `${whenText(company.meetingAt).replace(/\s(오전|오후).*$/, '')} 미팅 일정이 맞지 않았던 것 같아 다시 연락드립니다.` : '미팅 일정을 다시 잡고자 연락드립니다.')
    lines.push('편하신 날짜와 시간을 알려 주시면 맞춰서 찾아뵙겠습니다. 감사합니다.')
  } else if (kind === 'thanks') {
    const ended = work.meeting?.endedAt ? new Date(work.meeting.endedAt) : null
    const when = work.round2 || !ended || !sameDay(ended, now) ? '지난번' : '오늘'
    if (work.round2) {
      lines.push(`${who}, 설명 들어 주셔서 감사합니다. ${me}입니다.`)
      lines.push('검토하시다가 궁금하신 점이나 더 확인하고 싶은 부분이 있으면 언제든 말씀해 주세요.')
    } else {
      lines.push(`${who}, ${when} 귀한 시간 내주셔서 감사합니다. ${me}입니다.`)
      lines.push(`말씀해 주신 ${topic ?? '내용'}을 중심으로 회사에 맞는 방향을 정리해서 다시 안내드리겠습니다.`)
      lines.push('궁금하신 점은 언제든 편하게 연락 주세요.')
    }
  } else if (kind === 'documents') {
    const docs = clientDocs(ctx.missing)
    lines.push(hello)
    lines.push('회사 상황을 정확히 보려면 아래 자료가 필요합니다. 준비되는 것부터 보내 주셔도 됩니다.')
    docs.forEach((k, i) => lines.push(`${i + 1}. ${CLIENT_DOC_REQUEST[k]}`))
    lines.push('받은 자료는 검토 목적으로만 사용합니다. 감사합니다.')
  } else if (kind === 'proposal') {
    lines.push(hello)
    lines.push(`지난번 말씀해 주신 ${topic ?? '내용'}을 바탕으로 회사에 맞는 방향을 정리했습니다.`)
    lines.push('30분 정도 직접 설명드리고 싶습니다. 편하신 날짜와 시간을 알려 주시면 맞추겠습니다.')
  } else {
    lines.push(hello)
    lines.push('지난번 이야기 나눈 뒤로 시간이 조금 지나 안부 겸 연락드립니다. 요즘 회사 상황은 어떠신지요?')
    lines.push('필요하시면 지금 상황에 맞춰 다시 정리해 드리겠습니다. 편하실 때 회신 주세요.')
  }
  return lines.join('\n')
}

/**
 * 휴대폰 문자 앱을 본문이 채워진 채로 연다.
 * iOS 는 `&body=`, Android 는 `?body=` 를 읽는다 — `?&body=` 는 둘 다 읽는다.
 */
export function smsHref(phone: string, body: string): string | null {
  const to = phone.replace(/[^\d+]/g, '')
  if (to.replace(/\D/g, '').length < 8) return null
  return `sms:${to}?&body=${encodeURIComponent(body)}`
}
