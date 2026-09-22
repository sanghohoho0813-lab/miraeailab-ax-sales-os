/**
 * 질문 은행 — WHY / SAY / CLICK.
 *
 * LIVE 화면에서는 CLICK(선택지)이 주인공이다. WHY·SAY 는 [왜 묻나요?] [어떻게 말하나요?] 로 접어 둔다.
 * 정확한 숫자를 캐묻지 않는다. 방향과 강도를 먼저 파악한다.
 * 모든 질문에 '잘 모르겠음' 이 있다 — 컨설턴트가 억지로 추측하게 만들지 않는다.
 */
import type { Question, QuestionOption } from '../types/domain'
import { DEGREE_OPTIONS } from './labels'

const DEGREE: QuestionOption[] = DEGREE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

const UNKNOWN: QuestionOption = { value: 'unknown', label: '잘 모르겠음' }

export const QUESTIONS: Question[] = [
  /* ── 공통 핵심 ─────────────────────────────────────────────── */
  {
    id: 'ceo_dependency',
    area: 'ceo_dependency',
    title: '대표님이 직접 확인해야 진행되는 업무가 많은 편인가요?',
    say: '대표님이 자리를 비우시면 멈추는 일이 있나요? 직원들이 대표님께 확인 전화를 자주 하는 편인가요?',
    why: '대표 의존도는 AX 필요도의 첫 번째 신호다. 대표가 시스템 역할을 하고 있으면 성장할수록 대표가 더 바빠진다. 2차 제안의 "대표시간 회수" 가치와 직결된다.',
    options: DEGREE,
    diagnosisKeys: ['askProgress', 'ceoLoadGrows'],
    priority: 1,
  },
  {
    id: 'repetitive_work',
    area: 'repetitive_work',
    title: '같은 정보를 여러 번 옮겨 적는 일이 자주 있나요?',
    say: '주문이나 요청이 들어오면, 카톡에서 엑셀로, 엑셀에서 다시 다른 곳으로 옮겨 적는 일이 있나요?',
    why: '반복 입력의 규모는 프로젝트 범위(간단 자동화 vs 부분 AX)를 가르는 기준이다. 반복이 한 군데면 자동화, 여러 업무가 연결돼 있으면 AX로 간다.',
    options: DEGREE,
    diagnosisKeys: ['repeatInput'],
    priority: 2,
  },
  {
    id: 'info_scatter',
    area: 'info_scatter',
    title: '업무 정보가 엑셀·카톡·전화·수첩 등 여러 곳에 흩어져 있나요?',
    say: '지금 어떤 건이 어디까지 됐는지 보려면 어디를 봐야 하나요? 한 군데서 보이나요, 여러 군데를 봐야 하나요?',
    why: '정보가 흩어진 정도는 "업무 연결 필요성" 판단 기준이다. 흩어져 있을수록 Full AX 가치가 커지고, 한 곳에 모여 있으면 그 시스템 밖의 빈틈만 찾으면 된다.',
    options: DEGREE,
    diagnosisKeys: ['toolGaps', 'priorityByMemory'],
    priority: 3,
  },
  {
    id: 'current_system',
    area: 'current_system',
    title: '지금 쓰는 시스템이 있나요?',
    say: 'ERP나 POS, 회계 프로그램 같은 걸 쓰고 계세요? 쓰신다면 그 프로그램 밖에서 엑셀이나 카톡으로 다시 관리하는 업무가 있나요?',
    why: 'ERP가 있어도 ERP 밖에서 사람이 반복하는 일을 찾는 것이 AX 다. 기존 시스템을 바꾸자는 제안이 아님을 분명히 하고, 빈틈이 어디인지 파악한다.',
    options: [
      { value: 'none', label: '없음 (엑셀·수기)' },
      { value: 'partial', label: '있지만 밖에서 다시 관리', hint: 'ERP/POS는 있지만 엑셀·카톡 병행' },
      { value: 'covered', label: '있고 대부분 커버' },
      { value: 'custom', label: '자체 프로그램 사용 중' },
      UNKNOWN,
    ],
    diagnosisKeys: ['uniqueWork'],
    priority: 4,
  },
  {
    id: 'customer_mgmt',
    area: 'customer_mgmt',
    title: '고객·거래처 관리는 어떻게 하고 계세요?',
    say: '거래처가 몇 군데인지, 마지막에 언제 주문했는지 바로 보이나요? 아니면 담당자 머릿속이나 카톡에 있나요?',
    why: '고객/거래처 화면이 필요한지 판단한다. 거래처 관리가 사람 기억에 있으면 고객포털·재구매 알림 같은 접점 구조가 2차 제안의 핵심이 된다.',
    options: [
      { value: 'memory', label: '담당자 기억·카톡' },
      { value: 'excel', label: '엑셀·수기 장부' },
      { value: 'system', label: '프로그램으로 관리' },
      UNKNOWN,
    ],
    diagnosisKeys: ['manualHandoff', 'dataUnused'],
    priority: 5,
  },
  {
    id: 'quote_order',
    area: 'quote_order',
    title: '견적·주문·발주는 어떤 경로로 들어오나요?',
    say: '주문이나 견적 요청은 주로 전화로 오나요, 카톡으로 오나요? 받은 다음에는 누가 어디에 정리하나요?',
    why: '주문이 전화·카톡에 분산돼 있으면 입력 시간·누락·재주문 관리 문제가 생긴다. B2B 주문포털 + 주문 DB + 알림 구조가 바로 붙는 지점이다.',
    options: [
      { value: 'phone_chat', label: '전화·카톡 위주' },
      { value: 'mixed', label: '전화·카톡 + 일부 시스템' },
      { value: 'system', label: '시스템으로 접수' },
      { value: 'n/a', label: '해당 없음' },
      UNKNOWN,
    ],
    tradeTypes: ['b2b', 'both'],
    industries: ['manufacturing', 'distribution', 'logistics', 'construction', 'environment'],
    priority: 6,
  },
  {
    id: 'repurchase',
    area: 'repurchase',
    title: '한 번 거래한 고객이 다시 주문하는 시점을 알 수 있나요?',
    say: '거래처가 먼저 연락해야 다음 주문이 시작되나요? 아니면 이쪽에서 먼저 제안하는 편인가요?',
    why: '재구매 시점을 모른다는 것은 매출누수의 신호다. 거래 데이터가 쌓이면 재주문 알림·제안 구조로 매출 가치가 계산된다.',
    options: [
      { value: 'no', label: '거래처가 먼저 연락' },
      { value: 'partly', label: '일부는 먼저 제안' },
      { value: 'yes', label: '시점을 알고 먼저 제안' },
      { value: 'n/a', label: '해당 없음' },
      UNKNOWN,
    ],
    priority: 7,
  },
  {
    id: 'hiring_burden',
    area: 'hiring_burden',
    title: '일이 늘면 사람을 더 뽑아야 하는 구조인가요?',
    say: '주문이 30% 늘면 지금 인원으로 되나요, 아니면 사람을 더 뽑아야 하나요?',
    why: '"추가채용 억제" 가치의 근거다. 성장할 때 인건비가 같이 늘어야 하는 구조라면 AX의 경제가치가 분명해진다. 채용 계획이 있으면 3년 Value Map 의 핵심 입력이 된다.',
    options: [
      { value: 'yes', label: '바로 더 뽑아야 함' },
      { value: 'maybe', label: '조금은 버틸 수 있음' },
      { value: 'no', label: '지금 인원으로 가능' },
      UNKNOWN,
    ],
    priority: 8,
  },
  {
    id: 'growth_plan',
    area: 'growth_plan',
    title: '앞으로 1~2년 사이에 회사를 키울 계획이 있으신가요?',
    say: '내년쯤에는 어떤 모습이면 좋겠다고 생각하세요? 거래처를 늘리거나, 새 사업을 붙이거나, 인원을 늘리는 계획이 있으신가요?',
    why: '성장계획이 있어야 AX가 "비용" 이 아니라 "성장 준비" 로 설명된다. 실증 가능성·자금 설명력(정책금융/R&D/투자)과 연결된다.',
    options: [
      { value: 'aggressive', label: '적극적으로 키울 계획' },
      { value: 'steady', label: '지금 규모 유지·안정' },
      { value: 'unsure', label: '아직 정하지 않음' },
      UNKNOWN,
    ],
    priority: 9,
  },
  {
    id: 'funding_interest',
    area: 'funding_interest',
    title: '정책자금이나 정부지원사업에 관심이 있으신가요?',
    say: '정책자금이나 지원사업을 알아보신 적 있으세요? (먼저 꺼내지 말고, 대표님이 관심을 보이면 물어보세요)',
    why: '자금은 결과이지 목적이 아니다. 관심 여부만 확인하고, "AX 하면 자금 나온다" 식으로 연결하지 않는다. 성장자금 활용 준비도는 AX 필요도와 별도로 평가한다.',
    options: [
      { value: 'high', label: '관심 많음·알아보는 중' },
      { value: 'some', label: '있으면 좋겠다 정도' },
      { value: 'none', label: '관심 없음' },
      { value: 'past', label: '받아본 경험 있음' },
      UNKNOWN,
    ],
    priority: 10,
  },
  {
    id: 'data_potential',
    area: 'data_potential',
    title: '일하면서 생기는 기록(주문·작업·고객)이 어딘가에 남고 있나요?',
    say: '지난달에 어떤 거래처가 뭘 얼마나 주문했는지 지금 바로 꺼내 볼 수 있으세요?',
    why: '데이터 축적 가능성은 AI 판단 필요성과 실증(Before/After) 가능성을 가른다. 기록이 남지 않으면 먼저 기록이 쌓이는 구조부터 만들어야 한다.',
    options: [
      { value: 'none', label: '거의 남지 않음' },
      { value: 'scattered', label: '남지만 흩어져 있음' },
      { value: 'usable', label: '모여 있고 꺼내 볼 수 있음' },
      UNKNOWN,
    ],
    diagnosisKeys: ['dataUnused'],
    priority: 11,
  },
  {
    id: 'internal_owner',
    area: 'internal_owner',
    title: '새 시스템을 함께 쓸 내부 담당자가 있나요?',
    say: '만약 프로그램을 만든다면, 대표님 말고 실제로 매일 쓸 분이 계세요?',
    why: '구축보다 정착이 어렵다. 담당자 유무는 실증 가능성과 프로젝트 범위 판정(D: 지금은 비추천)의 핵심 기준이다.',
    options: [
      { value: 'dedicated', label: '전담 담당자 있음' },
      { value: 'partTime', label: '겸임으로 맡을 사람 있음' },
      { value: 'ceo', label: '대표가 직접 써야 함' },
      { value: 'none', label: '아직 없음' },
      UNKNOWN,
    ],
    diagnosisKeys: ['internalOwner'],
    priority: 12,
  },

  /* ── 업종 특화 ─────────────────────────────────────────────── */
  {
    id: 'mfg_process',
    area: 'repetitive_work',
    title: '견적·공정·납기 관리에서 사람이 매번 다시 계산하는 부분이 있나요?',
    say: '견적 낼 때마다 원가를 다시 계산하시나요? 작업 진행 상황은 현장에 물어봐야 아나요?',
    why: '제조는 견적·공정·납기가 대표 의존의 핵심 지점이다. 이 세 가지가 사람 계산에 의존하면 부분 AX(견적 자동화 + 공정 현황판)부터 시작할 수 있다.',
    options: DEGREE,
    industries: ['manufacturing'],
    priority: 2.5,
  },
  {
    id: 'dist_inventory',
    area: 'info_scatter',
    title: '재고와 주문이 따로 놀아서 확인 전화를 하는 일이 있나요?',
    say: '거래처가 주문했는데 재고가 없어서 다시 연락하는 일이 얼마나 자주 있나요?',
    why: '유통·물류는 주문-재고-배송이 연결되지 않아 생기는 누락·재확인이 손실의 본체다. 주문 DB + 재고 연동이 2차 제안의 핵심 구조가 된다.',
    options: DEGREE,
    industries: ['distribution', 'logistics'],
    priority: 2.5,
  },
  {
    id: 'const_site',
    area: 'info_scatter',
    title: '현장 진행 상황과 추가 작업이 사진·카톡으로만 남아 있나요?',
    say: '현장에서 추가로 한 작업이 나중에 정산 때 인정 못 받는 경우가 있으세요? 발주처가 진행상황을 물어보면 어떻게 답하세요?',
    why: '건설·시공은 현장 자료(사진·일보)가 흩어져 추가작업 청구와 보고서 작성이 사람 손에 의존한다. 현장 체크 → 본사 보고서 자동 생성 구조가 붙는다.',
    options: DEGREE,
    industries: ['construction', 'environment'],
    priority: 2.5,
  },
  {
    id: 'svc_booking',
    area: 'customer_mgmt',
    title: '예약·문의·후속 연락을 직원이 기억으로 관리하고 있나요?',
    say: '예약이 취소되면 대기 고객에게 어떻게 연락하세요? 상담만 하고 등록 안 한 고객은 나중에 다시 연락하시나요?',
    why: '서비스·외식·의료는 예약·이탈·재방문이 매출의 본체다. 고객 접점(예약·알림·재방문 제안)이 AX의 첫 화면이 된다.',
    options: DEGREE,
    industries: ['service', 'food', 'medical'],
    priority: 2.5,
  },
  {
    id: 'food_prep',
    area: 'data_potential',
    title: '준비량·폐기·잘 팔리는 메뉴를 감으로 정하고 계세요?',
    say: '내일 얼마나 준비할지 어떻게 정하세요? 포스에서 뭐가 얼마나 남는지까지 보이나요?',
    why: '외식은 POS가 "얼마 팔았는지" 는 알려주지만 "무엇이 남는지" 는 알려주지 않는다. 데이터 축적과 판단 구조가 AX의 가치다.',
    options: DEGREE,
    industries: ['food'],
    priority: 3.5,
  },
  {
    id: 'med_followup',
    area: 'repurchase',
    title: '한 번 온 고객이 다시 오는 시점을 관리하고 계세요?',
    say: '지난달 오신 분 중 재방문 안 한 분이 몇 분인지 바로 아시나요?',
    why: '의료·웰니스는 재방문 관리가 매출의 핵심이다. 방문 기록 → 재방문 알림 구조로 매출누수 가치를 계산할 수 있다.',
    options: DEGREE,
    industries: ['medical', 'service'],
    priority: 3.5,
  },
  {
    id: 'env_settlement',
    area: 'quote_order',
    title: '수거·작업 기록과 정산·청구가 따로 정리되고 있나요?',
    say: '현장에서 한 작업이 청구서까지 가려면 누가 몇 번 옮겨 적나요? 미수금은 어떻게 확인하세요?',
    why: '환경·물류는 현장 기록 → 정산 → 청구 → 입금 대사가 끊겨 있어 누락과 미수가 생긴다. 실제 의료폐기물 프로젝트와 같은 구조다.',
    options: DEGREE,
    industries: ['environment', 'logistics'],
    priority: 3.5,
  },
]

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]))

export function optionLabel(question: Question, value: string): string {
  return question.options.find((o) => o.value === value)?.label ?? value
}

/** 선택값의 '강도' (0~3). 정도형이 아니면 의미 매핑. null = 잘 모르겠음/해당 없음 */
export function answerIntensity(questionId: string, value: string): number | null {
  switch (value) {
    case 'unknown':
    case 'n/a':
      return null
    case 'low':
      return 0
    case 'mid':
      return 1
    case 'high':
      return 2
    case 'very_high':
      return 3
  }
  switch (questionId) {
    case 'current_system':
      return value === 'none' ? 2 : value === 'partial' ? 3 : value === 'custom' ? 1 : 0
    case 'customer_mgmt':
      return value === 'memory' ? 3 : value === 'excel' ? 2 : 0
    case 'quote_order':
      return value === 'phone_chat' ? 3 : value === 'mixed' ? 2 : 0
    case 'repurchase':
      return value === 'no' ? 3 : value === 'partly' ? 1 : 0
    case 'hiring_burden':
      return value === 'yes' ? 3 : value === 'maybe' ? 1 : 0
    case 'growth_plan':
      return value === 'aggressive' ? 3 : value === 'steady' ? 1 : 0
    case 'funding_interest':
      return value === 'high' ? 3 : value === 'past' ? 2 : value === 'some' ? 1 : 0
    case 'data_potential':
      return value === 'none' ? 0 : value === 'scattered' ? 2 : 3
    case 'internal_owner':
      return value === 'dedicated' ? 3 : value === 'partTime' ? 2 : value === 'ceo' ? 1 : 0
  }
  return null
}
