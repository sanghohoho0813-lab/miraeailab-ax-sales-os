/**
 * 정책자금 유력 기관 — "승인 가능성 판정" 이 아니라 "실제로 어느 기관이 자금을 댔나" 다.
 *
 * 이 엔진이 쓰는 근거는 리서치 사례 371건에 적힌 조달 형태(fundingForm)와 프로그램(policyPrograms) 뿐이다.
 * 각 기관의 신청 자격·한도·심사 기준은 해마다 바뀌고 이 저장소에 없다. 그래서 **요건을 판정하지 않는다.**
 * 화면에는 "같은 업종에서 이 기관이 실제로 나왔다 (N건)" 와 그 사례들을 보여 주고, 판단은 컨설턴트가 한다.
 *
 * 이 사례 DB 의 한계 (그대로 화면에 말한다)
 *   - 371건 중 203건이 민간투자다. 기관이 적힌 사례는 100건 남짓이고 대부분 창업 초기 트랙
 *     (신보 퍼스트펭귄·리틀펭귄, TIPS, 청년창업사관학교) 이다.
 *   - 업력이 긴 일반 중소기업의 기보·신보 일반보증, 중진공 융자, 소진공 자금 사례는 거의 없다.
 *     그럴 때는 "해당 사례 없음" 이 정답이다 — 창업기업 프로그램을 억지로 붙이지 않는다.
 */
import type { CaseStudy, Company } from '../types/domain'

export type InstitutionCode = 'sinbo' | 'kibo' | 'kosme' | 'gov_rnd' | 'kdb' | 'other_public'

interface InstitutionDef {
  code: InstitutionCode
  label: string
  /** 사례 텍스트에서 이 기관을 알아보는 표시 */
  match: RegExp
  /** 어떤 성격의 자금인가 — 사실 서술만. 자격 요건은 적지 않는다 */
  note: string
}

const INSTITUTIONS: InstitutionDef[] = [
  { code: 'sinbo', label: '신용보증기금 (신보)', match: /신보|신용보증기금|퍼스트펭귄|리틀펭귄/, note: '보증서를 발급해 은행 대출을 받게 하는 방식' },
  { code: 'kibo', label: '기술보증기금 (기보)', match: /기보|기술보증기금|아기유니콘|예비유니콘|BIRD/, note: '기술평가를 근거로 보증하는 방식' },
  { code: 'kosme', label: '중소벤처기업진흥공단 (중진공)', match: /중진공|중소벤처기업진흥|청년창업사관학교|투융자복합/, note: '직접 융자·투융자 복합' },
  { code: 'gov_rnd', label: '정부 R&D · TIPS', match: /TIPS|팁스|정부\s*R&D|정부R&D|중기부\s*딥테크/, note: '과제 선정 방식 — 기술개발 과제가 먼저 있어야 한다' },
  { code: 'kdb', label: '산업은행 (산은)', match: /산은|산업은행/, note: '정책금융 직접 대출·투자' },
]

export interface InstitutionHit {
  code: InstitutionCode
  label: string
  note: string
  /** 근거 사례 (같은 업종 우선, 최대 3건) */
  cases: CaseStudy[]
  /** 이 Pool 에서 이 기관이 나온 사례 수 */
  count: number
}

export interface PolicyFundResult {
  institutions: InstitutionHit[]
  /** 어떤 범위에서 셌는가 */
  pool: 'industry' | 'all' | 'none'
  poolSize: number
  /** 이 회사에 그대로 적용하기 어려운 이유 (있으면 화면에 그대로 띄운다) */
  cautions: string[]
  /** 기관 접촉 전에 채워야 할 것 */
  missing: string[]
}

/** 사례 한 건에서 기관 표시를 찾을 텍스트 */
function fundingText(c: CaseStudy): string {
  return [c.fundingForm, ...(c.policyPrograms ?? []), c.fundingNote].filter(Boolean).join(' ')
}

/** 이 사례가 정책·공공 자금인가 (민간투자만 있는 건은 제외) */
export function hasPublicFunding(c: CaseStudy): boolean {
  const t = fundingText(c)
  return INSTITUTIONS.some((i) => i.match.test(t))
}

/** 창업 초기 전용 프로그램이 섞여 있는가 — 업력이 긴 회사에는 그대로 권할 수 없다 */
const EARLY_ONLY = /퍼스트펭귄|리틀펭귄|TIPS|팁스|청년창업사관학교|아기유니콘|예비유니콘/

export function recommendInstitutions(cases: CaseStudy[], company: Company, opts: { yearsInBusiness?: number | null } = {}): PolicyFundResult {
  const usable = cases.filter((c) => c.verificationStatus !== 'draft' && hasPublicFunding(c))
  const sameIndustry = usable.filter((c) => c.industry === company.industry)
  const pool = company.industry !== 'other' && sameIndustry.length ? sameIndustry : usable
  const poolKind: PolicyFundResult['pool'] = !usable.length ? 'none' : sameIndustry.length && company.industry !== 'other' ? 'industry' : 'all'

  const institutions: InstitutionHit[] = []
  for (const def of INSTITUTIONS) {
    const hits = pool.filter((c) => def.match.test(fundingText(c)))
    if (!hits.length) continue
    // 같은 업종을 앞으로, 그다음 최신
    const sorted = [...hits].sort((a, b) => Number(b.industry === company.industry) - Number(a.industry === company.industry) || String(b.year ?? '').localeCompare(String(a.year ?? '')))
    institutions.push({ code: def.code, label: def.label, note: def.note, cases: sorted.slice(0, 3), count: hits.length })
  }
  institutions.sort((a, b) => b.count - a.count)

  const cautions: string[] = []
  const years = opts.yearsInBusiness ?? null
  const earlyOnly = institutions.filter((i) => i.cases.some((c) => EARLY_ONLY.test(fundingText(c))))
  if (years !== null && years > 7 && earlyOnly.length) {
    cautions.push(`아래 사례에는 창업 초기 기업 전용 프로그램(퍼스트펭귄·TIPS·청년창업사관학교 등)이 섞여 있습니다. 업력 ${years}년인 이 회사에는 그대로 적용되지 않습니다 — 기관은 같아도 창구가 다릅니다.`)
  }
  if (poolKind === 'all' && company.industry !== 'other') {
    cautions.push('같은 업종에서 기관이 확인된 사례가 없어 업종을 가리지 않고 셌습니다. 업종별 창구가 다를 수 있습니다.')
  }
  if (poolKind === 'none') {
    cautions.push('사례 DB 에서 공공·정책 자금 기관이 확인된 건을 찾지 못했습니다.')
  }
  cautions.push('이 목록은 "실제 사례에 나온 기관" 이고 신청 자격·한도·심사 기준이 아닙니다. 연도마다 바뀌므로 해당 기관 공고로 확인하세요.')

  const missing: string[] = []
  if (company.industry === 'other' && !company.industryNote.trim()) missing.push('업종 — 기관별 창구가 업종으로 갈립니다')
  if (years === null) missing.push('업력 — 창업기업 프로그램 해당 여부가 갈립니다')
  if (company.headcount === 'unknown') missing.push('근로자 수 — 규모별 한도가 갈립니다')

  return { institutions, pool: poolKind, poolSize: pool.length, cautions, missing }
}
