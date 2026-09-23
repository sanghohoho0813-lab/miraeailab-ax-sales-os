/**
 * 기업분석에 쓰는 서류와 도구 — 무엇이 있어야 무엇을 할 수 있는가.
 *
 * 원칙
 *   - 서류가 없으면 도구를 막지 않는다. "무엇이 없어서 무엇을 못 하는지" 를 말하고 그 자리에서 올리게 한다.
 *   - 원본 파일은 저장하지 않는다(브라우저에서만 읽는다). 구조화된 값과 근거 한 줄만 남긴다.
 *   - 4대보험 명부처럼 개인정보가 들어 있는 서류는 사람 단위 정보를 저장하지 않는다. 집계만 남긴다.
 */

export type DocKey = 'company_report' | 'business_license' | 'corporate_register' | 'insurance_roster' | 'financial_statement'

export interface DocSpec {
  key: DocKey
  label: string
  /** 이 서류에서 무엇을 읽는가 */
  reads: string
  /** 어디에 쓰는가 */
  usedBy: string
  /** 문서 본문에서 이 서류를 알아보는 표시 */
  detect: RegExp
  /** 개인정보가 섞여 있는 서류인가 (사람 단위 정보는 저장하지 않는다) */
  sensitive?: boolean
}

export const DOC_SPECS: DocSpec[] = [
  {
    key: 'company_report',
    label: '기업정보 보고서 (크레탑 · 신용정보)',
    reads: '업종 · 설립일 · 직원수 · 재무 · 인증',
    usedBy: '미팅 전략 · 사례 추천 · 정책자금 기관',
    detect: /(CRETOP|크레탑|NICE\s*평가정보|나이스평가정보|한국기업데이터|기업신용|신용평가|기업정보\s*보고서)/i,
  },
  {
    key: 'business_license',
    label: '사업자등록증',
    reads: '상호 · 개업연월일 · 업태 · 종목 · 사업자등록번호',
    usedBy: '업종 확정 · 업력 · 정책자금 기관',
    detect: /(사업자등록증|사업자\s*등록\s*번호|개업연월일|업태\s*[:：]?)/,
  },
  {
    key: 'corporate_register',
    label: '법인등기부등본',
    reads: '법인 설립일 · 자본금 · 본점 · 목적사업',
    usedBy: '업력 · 자본금 · 정책자금 기관',
    detect: /(등기사항전부증명서|법인등기부|등기부\s*등본|본점\s*이전|자본금의\s*액)/,
  },
  {
    key: 'insurance_roster',
    label: '4대보험 가입자 명부',
    reads: '가입자 수 · 취득일 · 상실일 (집계만 저장)',
    usedBy: '고용지원금 검토',
    detect: /(사업장가입자\s*명부|가입자\s*명부|취득일|자격취득일|국민연금|건강보험|고용보험|산재보험)/,
    sensitive: true,
  },
  {
    key: 'financial_statement',
    label: '재무제표 (선택)',
    reads: '매출 · 영업이익 · 자산 · 부채',
    usedBy: '정책자금 기관 · 규모 판단',
    detect: /(재무상태표|손익계산서|대차대조표|표준재무제표)/,
  },
]

export const DOC_BY_KEY: Record<DocKey, DocSpec> = Object.fromEntries(DOC_SPECS.map((d) => [d.key, d])) as Record<DocKey, DocSpec>

export type ToolId = 'company_report' | 'employment_subsidy' | 'policy_fund'

export interface ToolSpec {
  id: ToolId
  label: string
  /** 이 도구가 하는 일 — 한 줄 */
  does: string
  /** 없으면 결과를 낼 수 없는 서류 */
  needs: DocKey[]
  /** 있으면 정확해지는 서류 */
  helps: DocKey[]
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    id: 'company_report',
    label: '기업정보 분석',
    does: '크레탑·신용정보 PDF에서 업종·재무·인증을 읽어 고객 정보를 채웁니다',
    needs: ['company_report'],
    helps: ['business_license', 'corporate_register'],
  },
  {
    id: 'employment_subsidy',
    label: '고용지원금 검토',
    does: '4대보험 명부에서 가입자 수와 최근 입·퇴사를 집계해 어떤 제도를 확인할지 골라 줍니다',
    needs: ['insurance_roster'],
    helps: ['business_license'],
  },
  {
    id: 'policy_fund',
    label: '정책자금 유력 기관',
    does: '같은 업종·비슷한 규모에서 실제로 자금을 댄 기관을 371건 사례에서 찾아 줍니다',
    needs: [],
    helps: ['company_report', 'business_license', 'corporate_register', 'financial_statement'],
  },
]
