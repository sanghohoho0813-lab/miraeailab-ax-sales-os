/** 상황별 응대 — 핵심 답변 1문장 + 다음 질문 1개 */
export interface Objection {
  id: string
  customerSays: string
  answer: string
  nextQuestion: string
  /** 함께 볼 플레이북 섹션 */
  playbookId?: string
}

export const OBJECTIONS: Objection[] = [
  {
    id: 'has_erp',
    customerSays: 'ERP 있는데요.',
    answer: 'ERP를 바꾸려는 게 아니라, ERP 밖에서 아직 사람이 반복하고 있는 일을 찾는 겁니다.',
    nextQuestion: 'ERP에 입력하고 나서 다시 엑셀이나 카톡으로 관리하는 업무가 있나요?',
    playbookId: 'explain_ax',
  },
  {
    id: 'need_ai',
    customerSays: 'AI가 꼭 필요한가요?',
    answer: 'AI는 마지막에 붙는 판단 기능이고, 먼저 필요한 건 흩어진 업무가 한 곳에 모이는 구조입니다.',
    nextQuestion: '지금 어떤 건이 어디까지 됐는지 보려면 몇 군데를 봐야 하나요?',
    playbookId: 'explain_ax',
  },
  {
    id: 'how_much',
    customerSays: '얼마예요?',
    answer: '회사마다 필요한 범위가 많이 달라서, 단순 반복업무 하나면 수백만 원 단위, 업무·데이터·고객접점까지 연결하면 수천만 원 단위까지 갑니다. 그래서 범위를 먼저 확인하고 정확한 견적을 다시 제안드립니다.',
    nextQuestion: '지금 가장 자주 반복되는 일 하나만 꼽으면 어떤 건가요?',
    playbookId: 'explain_price',
  },
  {
    id: 'fund_broker',
    customerSays: '정책자금 받아주는 건가요?',
    answer: '자금을 받아드리는 게 아니라, 회사 문제를 시스템으로 바꾸고 실제로 쓰면서 쌓이는 변화가 나중에 정책금융이나 R&D를 설명하는 근거가 되게 하는 겁니다.',
    nextQuestion: '지금 대표님이 직접 확인해야 진행되는 업무가 많은 편인가요?',
    playbookId: 'connect_funding',
  },
  {
    id: 'deferred',
    customerSays: '후불 가능한가요?',
    answer: '초기 부담을 낮출 수 있는 정산방식도 있어서, 구축범위가 정해진 뒤 함께 안내드릴 수 있습니다.',
    nextQuestion: '그 전에, 주문이나 요청이 들어오면 지금은 누가 어디에 정리하나요?',
    playbookId: 'explain_deferred',
  },
  {
    id: 'too_small',
    customerSays: '우리는 직원이 몇 명 안 되는데요.',
    answer: '인원이 적을수록 대표님이 직접 확인하는 일이 많아서, 오히려 작게 시작하는 자동화 효과가 빨리 나타납니다.',
    nextQuestion: '대표님이 하루만 자리를 비우면 어떤 일이 멈추나요?',
    playbookId: 'first_meeting',
  },
  {
    id: 'no_time',
    customerSays: '지금 바빠서 그런 거 할 시간이 없어요.',
    answer: '바쁜 이유가 반복 확인·옮겨 적기라면, 그 시간을 줄이는 것부터 작게 시작할 수 있습니다.',
    nextQuestion: '하루 중 가장 많이 반복되는 확인 업무가 뭔가요?',
    playbookId: 'find_value',
  },
  {
    id: 'tried_before',
    customerSays: '예전에 프로그램 만들었다가 안 썼어요.',
    answer: '안 쓴 프로그램은 대개 현장 업무 순서와 달랐거나 함께 쓸 담당자가 없었던 경우라, 저희는 구축보다 정착을 먼저 봅니다.',
    nextQuestion: '그때 프로그램이 안 쓰인 가장 큰 이유가 뭐였나요?',
    playbookId: 'first_meeting',
  },
  {
    id: 'same_case',
    customerSays: '그 회사는 얼마 받았어요? 우리도 그 정도 되나요?',
    answer: '그 업체는 이런 문제를 이렇게 바꿨고 그 결과 자금 설명력이 생긴 거라, 금액은 회사 상황과 기관 심사에 따라 달라집니다.',
    nextQuestion: '대표님 회사에서는 어떤 일이 가장 자주 끊기나요?',
    playbookId: 'connect_funding',
  },
  {
    id: 'think_more',
    customerSays: '생각 좀 해볼게요.',
    answer: '네, 오늘 확인한 내용으로 미래AI랩에서 회사에 맞는 범위와 3년 가치를 정리해 2차 미팅 때 제안드리겠습니다.',
    nextQuestion: '2차 제안 전에 직원수·거래처수·채용계획 세 가지만 확인해 주실 수 있을까요?',
    playbookId: 'to_second_meeting',
  },
]
