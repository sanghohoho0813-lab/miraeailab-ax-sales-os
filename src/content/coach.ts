/**
 * Contextual Sales Coach — 지금 답변 흐름에 맞는 상황만 위로 올린다.
 * 각 항목은 핵심 답변 1문장 + 다음 질문 1개만. 긴 설명은 플레이북에 있다.
 */
import type { Answer } from '../types/domain'
import { OBJECTIONS, type Objection } from './objections'

export interface CoachTip {
  id: string
  /** 상황 (예: "ERP 가 있다고 할 때") */
  situation: string
  answer: string
  next: string
  /** 지금 흐름에서 뜬 이유 */
  because?: string
}

const BY_ID = Object.fromEntries(OBJECTIONS.map((o) => [o.id, o])) as Record<string, Objection>
const fromObjection = (id: string, situation: string, because?: string): CoachTip | null => {
  const o = BY_ID[id]
  return o ? { id, situation, answer: o.answer, next: o.nextQuestion, because } : null
}

const CONTEXT_TIPS: CoachTip[] = [
  {
    id: 'ceo_high',
    situation: '"내가 다 확인해야 돌아간다"고 할 때',
    answer: '대표님이 지금 시스템 역할을 하고 계신 겁니다. 성장할수록 대표님이 더 바빠지는 구조라, 확인 없이도 돌아가는 흐름 하나부터 찾겠습니다.',
    next: '대표님 확인 없이는 절대 못 나가는 일이 하루에 몇 건쯤 되나요?',
  },
  {
    id: 'repeat_high',
    situation: '"같은 걸 여러 번 옮겨 적는다"고 할 때',
    answer: '옮겨 적는 일이 한 군데면 간단 자동화로 끝나고, 여러 업무가 이어져 있으면 그때 AX 범위가 됩니다.',
    next: '옮겨 적고 나면 그 정보를 또 보는 사람이 누구인가요?',
  },
  {
    id: 'scatter_high',
    situation: '"여기저기 흩어져 있다"고 할 때',
    answer: '먼저 한 곳에 모이는 구조가 필요하고, AI 는 그다음에 붙는 판단 기능입니다.',
    next: '지금 어떤 건이 어디까지 됐는지 보려면 몇 군데를 봐야 하나요?',
  },
  {
    id: 'hiring_high',
    situation: '"사람 구하기가 어렵다"고 할 때',
    answer: '채용 대신, 사람이 붙어 있던 반복 업무를 시스템이 대신하면 지금 인원으로 더 처리할 수 있습니다.',
    next: '새로 뽑으면 그 사람이 제일 먼저 하게 될 일이 뭔가요?',
  },
  {
    id: 'quote_manual',
    situation: '견적·주문이 사람 손을 탄다고 할 때',
    answer: '견적과 주문이 사람 기억에 있으면 누락과 재확인 전화가 생깁니다. 그 흐름 하나만 시스템에 올려도 체감이 큽니다.',
    next: '견적 낸 뒤 주문으로 이어지는지 확인은 누가, 어떻게 하나요?',
  },
]

const ALWAYS: [string, string][] = [
  ['how_much', '"얼마예요?" 라고 물을 때'],
  ['deferred', '"후불 되나요?" 라고 물을 때'],
  ['think_more', '"생각 좀 해볼게요" 라고 할 때'],
  ['too_small', '"우리는 직원이 몇 명 안 돼요" 라고 할 때'],
  ['no_time', '"지금 바빠서 시간이 없어요" 라고 할 때'],
  ['tried_before', '"예전에 만들었다가 안 썼어요" 라고 할 때'],
  ['need_ai', '"AI 가 꼭 필요한가요?" 라고 할 때'],
]

function degreeHigh(a?: Answer): boolean {
  return a?.value === 'high' || a?.value === 'very_high'
}

/** 지금 상황에 맞는 코치(위) + 자주 나오는 상황(아래) */
export function coachFor(answers: Record<string, Answer>, currentQuestionId: string | null): { now: CoachTip[]; common: CoachTip[] } {
  const now: CoachTip[] = []
  const push = (t: CoachTip | null) => {
    if (t && !now.some((x) => x.id === t.id)) now.push(t)
  }
  const sys = answers.current_system?.value
  if (currentQuestionId === 'current_system' || sys === 'partial' || sys === 'covered' || sys === 'custom') {
    push(fromObjection('has_erp', 'ERP 가 있다고 할 때', sys ? '현재 시스템 답변' : '지금 질문'))
  }
  if (currentQuestionId === 'ceo_dependency' || degreeHigh(answers.ceo_dependency)) push({ ...CONTEXT_TIPS[0], because: degreeHigh(answers.ceo_dependency) ? '대표 의존도 높음' : '지금 질문' })
  if (currentQuestionId === 'repetitive_work' || degreeHigh(answers.repetitive_work)) push({ ...CONTEXT_TIPS[1], because: degreeHigh(answers.repetitive_work) ? '반복 입력 많음' : '지금 질문' })
  if (currentQuestionId === 'info_scatter' || degreeHigh(answers.info_scatter)) push({ ...CONTEXT_TIPS[2], because: degreeHigh(answers.info_scatter) ? '정보 흩어짐 높음' : '지금 질문' })
  if (currentQuestionId === 'hiring_burden' || degreeHigh(answers.hiring_burden)) push({ ...CONTEXT_TIPS[3], because: degreeHigh(answers.hiring_burden) ? '채용 부담 높음' : '지금 질문' })
  if (currentQuestionId === 'quote_order' || degreeHigh(answers.quote_order)) push({ ...CONTEXT_TIPS[4], because: degreeHigh(answers.quote_order) ? '견적·주문 수작업' : '지금 질문' })
  const fund = answers.funding_interest?.value
  if (currentQuestionId === 'funding_interest' || (fund && fund !== 'none' && fund !== 'unknown')) {
    push(fromObjection('fund_broker', '"정책자금 받아주는 건가요?" 라고 물을 때', '자금 관심'))
    push(fromObjection('same_case', '"그 회사는 얼마 받았어요?" 라고 물을 때', '자금 관심'))
  }
  const common = ALWAYS.map(([id, situation]) => fromObjection(id, situation)).filter((t): t is CoachTip => Boolean(t) && !now.some((x) => x.id === t!.id))
  return { now, common }
}
