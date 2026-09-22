/**
 * BEFORE — 오늘의 접근법. 첫 화면은 짧게(공략 포인트 · 목표 · 주의), [자세히 보기] 에서만 1문단.
 */
import type { Company, CompanyProfile, Industry, QuestionArea } from '../types/domain'
import { INTEREST_LABEL } from '../content/labels'
import { diagnosisHighlights } from './diagnosis'
import { formatWon } from './docParser/korean'

export interface Briefing {
  /** 오늘 공략 포인트 — "대표 의존도 → 견적/공정 분산 → 거래처 관리" */
  chain: string[]
  /** chain 과 같은 순서의 문제 영역 */
  chainAreas: QuestionArea[]
  goal: string
  cautions: string[]
  detail: string
  /** 사전진단이 있으면 그 요약 */
  diagnosisLines: string[]
  /** PDF·음성 프로필이 있으면 그 요약 (사실만) */
  profileLines: string[]
}

export interface BriefingOptions {
  profile?: CompanyProfile | null
}

const CHAIN: Record<Industry, { area: QuestionArea; title: string }[]> = {
  manufacturing: [
    { area: 'ceo_dependency', title: '대표 의존도' },
    { area: 'quote_order', title: '견적·공정 계산 분산' },
    { area: 'customer_mgmt', title: '거래처·재주문 관리' },
  ],
  distribution: [
    { area: 'quote_order', title: '주문 채널 분산(전화·카톡)' },
    { area: 'repetitive_work', title: '재고·발주 재확인' },
    { area: 'repurchase', title: '재구매 누수' },
  ],
  construction: [
    { area: 'info_scatter', title: '현장 기록 분산(사진·카톡)' },
    { area: 'repetitive_work', title: '추가작업 청구 누락' },
    { area: 'ceo_dependency', title: '발주처 보고 부담' },
  ],
  service: [
    { area: 'customer_mgmt', title: '예약·문의 기억 관리' },
    { area: 'repurchase', title: '재방문 누수' },
    { area: 'ceo_dependency', title: '대표 확인 부담' },
  ],
  food: [
    { area: 'data_potential', title: '준비량 감 의존' },
    { area: 'quote_order', title: '단체문의·주문 분산' },
    { area: 'repurchase', title: '재주문·회원 전환' },
  ],
  logistics: [
    { area: 'info_scatter', title: '주문·배차·재고 단절' },
    { area: 'repetitive_work', title: '확인 전화 반복' },
    { area: 'customer_mgmt', title: '정산·미수 누락' },
  ],
  medical: [
    { area: 'customer_mgmt', title: '예약·재방문 기억 관리' },
    { area: 'info_scatter', title: '상담 기록 분산' },
    { area: 'ceo_dependency', title: '대표(원장) 확인 부담' },
  ],
  environment: [
    { area: 'info_scatter', title: '현장 기록 → 정산 단절' },
    { area: 'repetitive_work', title: '미수금·청구 누락' },
    { area: 'customer_mgmt', title: '고객 문의 응대 부담' },
  ],
  other: [
    { area: 'ceo_dependency', title: '대표 의존도' },
    { area: 'repetitive_work', title: '반복 입력' },
    { area: 'info_scatter', title: '업무정보 분산' },
  ],
}

const DETAIL: Record<Industry, string> = {
  manufacturing:
    '제조는 견적·공정·납기가 대표 머릿속 계산에 의존하는 경우가 많습니다. 오늘은 "견적 낼 때마다 다시 계산하는지", "작업 진행을 현장에 물어봐야 아는지" 두 가지만 확인해도 2차 제안의 뼈대가 나옵니다. 재주문이 거래처 연락에 의존한다면 그것이 세 번째 포인트입니다.',
  distribution:
    '유통은 주문이 전화·카톡으로 들어와 재고와 따로 놀 때 손실이 생깁니다. "주문 받고 재고 없어서 다시 연락하는 일이 얼마나 자주 있는지" 를 물으면 입력·누락·재주문 손실이 한 번에 드러납니다. 주문포털 이야기는 그다음입니다.',
  construction:
    '건설·시공은 현장 자료가 사진·카톡에 흩어져 추가작업이 청구로 이어지지 않는 경우가 많습니다. "구두로 한 추가작업을 정산 때 인정받지 못한 적이 있는지" 와 "발주처가 진행상황을 물으면 어떻게 답하는지" 를 확인하세요.',
  service:
    '서비스업은 예약·문의·후속연락이 직원 기억에 있을 때 매출이 샙니다. "취소된 예약 자리를 어떻게 채우는지", "상담만 하고 등록 안 한 고객에게 다시 연락하는지" 로 시작하세요. 기능 얘기보다 놓친 고객 얘기가 먼저입니다.',
  food: '외식은 POS 가 "얼마 팔았는지" 는 알려주지만 "무엇이 남는지" 는 알려주지 않습니다. 준비량을 어떻게 정하는지, 단체문의가 어디로 들어오는지 두 가지를 확인하세요. 회원·재주문 전환은 그다음 포인트입니다.',
  logistics:
    '물류는 주문·배차·재고·정산이 끊긴 자리에서 확인 전화가 반복됩니다. "하루에 확인 전화가 몇 번쯤 오가는지" 강도만 확인해도 처리량과 대표시간 가치가 보입니다.',
  medical:
    '의료·웰니스는 재방문 관리가 매출의 본체입니다. "지난달 오신 분 중 재방문 안 한 분이 몇 분인지 바로 아시는지" 한 질문으로 데이터 축적과 매출누수를 동시에 확인할 수 있습니다.',
  environment:
    '환경·수거업은 현장 기록이 정산·청구·입금까지 이어지지 않아 미수와 누락이 생깁니다. 현장에서 한 작업이 청구서까지 가려면 몇 번 옮겨 적는지 확인하세요. 실제 의료폐기물 프로젝트와 같은 구조입니다.',
  other: '업종 정보가 적을 때는 대표 의존도 → 반복 입력 → 정보 분산 순서로 확인하세요. 세 가지 중 두 가지 이상이 "높음" 이면 2차 제안의 핵심문제가 이미 잡힌 것입니다.',
}

/** 프로필에서 확인된 사실만 한 줄씩 — 추정은 넣지 않는다 */
export function profileFactLines(profile: CompanyProfile | null | undefined): string[] {
  if (!profile) return []
  const f = profile.facts
  const active = new Set(profile.evidence.filter((e) => !e.removed).map((e) => e.key))
  const lines: string[] = []
  if (f.headcount !== null && active.has('headcount')) lines.push(`직원 ${f.headcount}명`)
  if (f.yearsInBusiness !== null && (active.has('yearsInBusiness') || active.has('foundedAt'))) lines.push(`업력 ${f.yearsInBusiness}년`)
  const latest = [...f.financials].reverse().find((x) => x.revenue !== null)
  if (latest && active.has(`fin_revenue_${latest.year}`)) lines.push(`${latest.year}년 매출 ${formatWon(latest.revenue)}${f.growth.revenueTrend === 'up' ? ` (+${f.growth.revenueGrowthPct}%)` : f.growth.revenueTrend === 'down' ? ` (${f.growth.revenueGrowthPct}%)` : ''}`)
  if (f.certifications.length && active.has('certifications')) lines.push(f.certifications.slice(0, 3).join(' · '))
  if (f.products.length && active.has('products')) lines.push(`주요 제품 ${f.products.slice(0, 3).join(', ')}`)
  return lines
}

export function buildBriefing(company: Company, opts: BriefingOptions = {}): Briefing {
  const chain = CHAIN[company.industry].map((c) => c.title)
  const chainAreas = CHAIN[company.industry].map((c) => c.area)
  const highlights = diagnosisHighlights(company.diagnosis, 3)
  const diagnosisLines = highlights.map((h) => `${h.label} · ${h.degree}`)
  const profileLines = profileFactLines(opts.profile)

  const cautions = ['가격·후불·정책자금부터 먼저 꺼내지 마세요.', '정확한 숫자를 캐묻지 말고 방향과 강도만 확인하세요.']
  if (company.interests.some((i) => i === 'policy_fund' || i === 'gov_support')) {
    cautions.push(`대표 관심사가 ${company.interests.filter((i) => i === 'policy_fund' || i === 'gov_support').map((i) => INTEREST_LABEL[i]).join('·')} 입니다. 자금은 결과라는 순서를 지키고, 물으면 "범위가 정해지면 정확히" 로 답하세요.`)
  }
  if (company.headcount === '1-5') cautions.push('소규모 업체입니다. 작게 시작하는 자동화(LEVEL A) 가능성을 열어 두세요.')
  if (company.diagnosis?.grade === 'NO_GO') cautions.push('사전진단 결과가 "지금은 정비 먼저" 입니다. AX 를 권하기보다 현재 도구 정리부터 이야기하세요.')
  const pf = opts.profile?.facts
  if (pf?.creditNote || (pf?.financials.length ?? 0) > 0) cautions.push('기업자료의 매출·신용 숫자를 먼저 꺼내지 마세요. 대표가 말하기 전에는 "자료에서 봤다" 고 하지 않습니다.')
  if (pf?.growth.revenueTrend === 'up') cautions.push('매출이 늘고 있다고 "업무가 엉망일 것" 이라고 단정하지 마세요. 관리 부담이 늘었는지 질문으로 확인합니다.')

  let detail = DETAIL[company.industry]
  if (highlights.length) {
    detail = `대표님이 사전진단에서 ${highlights.map((h) => `"${h.label}"`).join(', ')} 을(를) 강하게 체크했습니다. 같은 질문을 다시 하지 말고 "사전진단에서 이렇게 체크하셨는데, 실제로 어떤 장면에서 그런가요?" 로 여세요. ` + detail
  }
  if (profileLines.length) detail = `기업자료로 확인된 사실: ${profileLines.join(' · ')}. ` + detail

  return {
    chain,
    chainAreas,
    goal: 'AX 를 판매하려 하지 말고, 2차 제안에 필요한 핵심문제 1~2개만 찾으세요.',
    cautions,
    detail,
    diagnosisLines,
    profileLines,
  }
}
