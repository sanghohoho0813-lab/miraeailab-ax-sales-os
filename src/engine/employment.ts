/**
 * 고용지원금 검토 — 명부에서 센 **사실**과, 그 사실이 가리키는 **확인할 제도** 까지만 한다.
 *
 * 금액을 계산하지 않는 이유를 분명히 해 둔다.
 *   고용지원금의 지원 요건·단가·한도는 해마다(때로는 분기마다) 바뀌고, 이 저장소에는 그 근거가 없다.
 *   근거 없이 "청년 1명당 얼마" 를 화면에 띄우면 컨설턴트가 대표 앞에서 틀린 숫자를 말하게 된다.
 *   그래서 이 엔진은 "무엇을 확인해야 하는지" 까지만 좁혀 주고, 금액은 비워 둔다.
 *   (판정 규칙표를 주시면 같은 구조에 그대로 얹을 수 있다 — checks[].rule 자리가 비어 있는 이유다.)
 *
 * 개인정보: 이 엔진은 사람 단위 데이터를 받지 않는다. 집계된 EmploymentFacts 만 본다.
 */
import type { Company, CompanyProfile, EmploymentFacts } from '../types/domain'

export interface SubsidyCheck {
  id: string
  label: string
  /** 왜 이 회사에서 확인 대상인가 — 명부에서 센 사실로만 쓴다 */
  because: string
  /** 무엇을 더 확인해야 하는가 */
  verify: string[]
  /** 판정 규칙이 아직 없다는 표시 (규칙표가 들어오면 채운다) */
  rule: null
}

export interface EmploymentReview {
  facts: EmploymentFacts | null
  /** 명부 없이도 말할 수 있는 것 */
  headline: string
  checks: SubsidyCheck[]
  /** 명부에서 읽지 못해 직접 확인해야 하는 것 */
  missing: string[]
  /** 화면에 반드시 같이 띄울 한계 */
  caution: string
}

const NO_ROSTER: EmploymentReview = {
  facts: null,
  headline: '4대보험 가입자 명부를 올리면 가입자 수와 최근 1년 입·퇴사를 집계해 어떤 제도를 확인할지 좁혀 드립니다.',
  checks: [],
  missing: ['4대보험 가입자 명부'],
  caution: '',
}

const CAUTION = '지원 요건과 단가는 해마다 바뀝니다. 이 화면은 "무엇을 확인할지" 까지만 좁혀 주고 금액은 계산하지 않습니다 — 해당 연도 공고로 확인하세요.'

export function reviewEmployment(company: Company, profile: CompanyProfile | null): EmploymentReview {
  const f = profile?.facts.employment ?? null
  if (!f || f.datedRows === 0) return NO_ROSTER

  const insured = f.insured ?? 0
  const joined = f.joined12m ?? 0
  const left = f.left12m ?? 0
  const net = joined - left
  const headline = `가입자 ${insured}명 · 최근 1년 입사 ${joined}명 · 퇴사 ${left}명 (순증 ${net >= 0 ? '+' : ''}${net}명)`

  const checks: SubsidyCheck[] = []
  if (net > 0) {
    checks.push({
      id: 'headcount_increase',
      label: '인원이 늘었을 때 보는 제도',
      because: `최근 1년 순증 ${net}명 (입사 ${joined} · 퇴사 ${left})`,
      verify: ['증가 인원의 고용보험 취득일이 해당 연도 기준에 드는지', '같은 기간 감원이 있었는지', '대표자 가족·임원이 포함됐는지'],
      rule: null,
    })
  }
  if (joined > 0) {
    checks.push({
      id: 'new_hire',
      label: '신규 채용에 붙는 제도',
      because: `최근 1년 입사 ${joined}명`,
      verify: ['채용 경로(워크넷·청년 등) 요건을 맞췄는지', '채용 전 고용센터 신청이 선행돼야 하는 제도인지', '입사자 연령·이전 고용보험 이력'],
      rule: null,
    })
  }
  if (insured > 0 && insured <= 10) {
    checks.push({
      id: 'small_workplace',
      label: '소규모 사업장 보험료 지원',
      because: `가입자 ${insured}명 (10명 이하 사업장)`,
      verify: ['월 보수 기준을 넘는 근로자가 있는지', '이미 지원받고 있는지'],
      rule: null,
    })
  }
  if (left > joined) {
    checks.push({
      id: 'turnover',
      label: '감원 이력 확인 — 먼저 볼 것',
      because: `최근 1년 퇴사 ${left}명 > 입사 ${joined}명`,
      verify: ['감원 방지 의무가 걸린 제도에 이미 참여 중인지', '권고사직·경영상 해고가 있었는지'],
      rule: null,
    })
  }

  const missing: string[] = []
  if (f.asOf === null) missing.push('명부 기준일 — 집계 시점이 명확해야 합니다')
  if (f.datedRows < insured) missing.push('일부 행의 날짜를 읽지 못했습니다 — 숫자를 확인하세요')
  if (company.headcount === 'unknown') missing.push('회사 기본정보의 근로자 수')

  return { facts: f, headline, checks, missing, caution: CAUTION }
}
