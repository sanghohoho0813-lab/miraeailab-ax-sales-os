/**
 * 회사 프로필 도우미 — 빈 facts, 인원 구간, 업종 매핑, 최신 프로필 선택, 근거 조회.
 * 순수 함수. 프로필은 "문서에 있는 것만" 담고, 추정은 status 로 구분한다.
 */
import type { Company, CompanyProfile, EvidenceField, Headcount, Industry, ProfileFacts } from '../types/domain'
import { HEADCOUNT_LABEL, INDUSTRY_LABEL } from '../content/labels'
import { formatWonShort } from './docParser/korean'

export function emptyFacts(): ProfileFacts {
  return {
    companyName: null,
    representativeName: null,
    phone: null,
    address: null,
    foundedAt: null,
    yearsInBusiness: null,
    industryText: null,
    industryCode: null,
    industry: null,
    subIndustry: null,
    headcount: null,
    headcountBand: null,
    tradeType: null,
    products: [],
    certifications: [],
    patents: null,
    creditNote: null,
    financials: [],
    growth: { revenueTrend: null, revenueGrowthPct: null, latestYear: null },
    notes: [],
  }
}

export function headcountBand(n: number | null): Headcount | null {
  if (n === null || !Number.isFinite(n) || n <= 0) return null
  if (n <= 5) return '1-5'
  if (n <= 10) return '6-10'
  if (n <= 20) return '11-20'
  if (n <= 30) return '21-30'
  return '30+'
}

/** 표준산업분류 대분류 → 업종 (코드가 있으면 이 매핑이 우선) */
const KSIC_SECTION: Record<string, Industry> = {
  C: 'manufacturing',
  F: 'construction',
  G: 'distribution',
  H: 'logistics',
  I: 'food',
  Q: 'medical',
  E: 'environment',
  J: 'service',
  M: 'service',
  N: 'service',
  P: 'service',
  R: 'service',
  S: 'service',
}

const INDUSTRY_KEYWORDS: [Industry, RegExp][] = [
  ['manufacturing', /제조|생산|가공|공업|정밀|금형|사출|부품|소재|기계|전자부품|화학|섬유|식품제조|제작/],
  ['distribution', /유통|도매|소매|도소매|무역|판매업|상사|납품|수입|수출입/],
  ['construction', /건설|시공|건축|토목|인테리어|설비공사|전기공사|리모델링/],
  ['logistics', /물류|운송|운수|배송|택배|창고|화물|포워딩/],
  ['food', /외식|음식점|식당|카페|프랜차이즈|요식|주점|베이커리|급식/],
  ['medical', /의료|병원|의원|치과|한의원|피부|헬스|웰니스|요양|약국|재활/],
  ['environment', /환경|폐기물|수거|재활용|정화|소독|방역/],
  ['service', /서비스|교육|학원|컨설팅|디자인|소프트웨어|정보통신|IT|플랫폼|광고|마케팅|미용|여행|보안|인력|용역/],
]

/** 업종 텍스트/코드 → Industry. 코드 대분류가 있으면 확정, 키워드면 추정 */
export function mapIndustry(text: string | null, code: string | null): { industry: Industry | null; byCode: boolean } {
  const section = code?.trim().charAt(0).toUpperCase() ?? ''
  if (section && KSIC_SECTION[section]) return { industry: KSIC_SECTION[section], byCode: true }
  if (!text) return { industry: null, byCode: false }
  for (const [ind, re] of INDUSTRY_KEYWORDS) if (re.test(text)) return { industry: ind, byCode: false }
  return { industry: null, byCode: false }
}

/** 전략에 쓰는 프로필 — 가장 최근 스냅샷 (재업로드 이력은 덮어쓰지 않고 쌓인다) */
export function latestProfile(list: CompanyProfile[]): CompanyProfile | null {
  if (!list.length) return null
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/** 사용 중인(제외되지 않은) 근거만 */
export function activeEvidence(p: CompanyProfile | null): EvidenceField[] {
  return (p?.evidence ?? []).filter((e) => !e.removed)
}

export function evidenceFor(p: CompanyProfile | null, key: string): EvidenceField | null {
  return activeEvidence(p).find((e) => e.key === key) ?? null
}

/** 근거 한 줄 표기 — "직원수 14명 — PDF 8p" */
export function evidenceLine(e: EvidenceField): string {
  const where = e.source === 'pdf' ? `PDF${e.sourcePage ? ` ${e.sourcePage}p` : ''}` : e.source === 'voice' ? '음성 입력' : e.source === 'website_diagnosis' ? '홈페이지 사전진단' : e.source === 'master_edit' ? '마스터 수정' : '직접 입력'
  const how = e.status === 'confirmed' ? '확인' : e.status === 'assumed' ? '추정' : '미확인'
  return `${e.label} ${e.display} — ${where} · ${how}`
}

/** 검토 화면에서 고친/제외한 근거를 facts 에 반영한다 — 제외된 항목은 null / [] 로, 고친 값은 그 값으로 */
export function applyEvidence(base: ProfileFacts, evidence: EvidenceField[]): ProfileFacts {
  const f: ProfileFacts = { ...base, products: [...base.products], certifications: [...base.certifications], financials: base.financials.map((x) => ({ ...x })), growth: { ...base.growth }, notes: [...base.notes] }
  const str = (v: EvidenceField['value']) => (v === null ? null : String(v))
  const num = (v: EvidenceField['value']) => {
    if (v === null) return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  for (const e of evidence) {
    const gone = e.removed === true
    switch (e.key) {
      case 'companyName': f.companyName = gone ? null : str(e.value); break
      case 'representativeName': f.representativeName = gone ? null : str(e.value); break
      case 'phone': f.phone = gone ? null : str(e.value); break
      case 'address': f.address = gone ? null : str(e.value); break
      case 'foundedAt': f.foundedAt = gone ? null : str(e.value); break
      case 'yearsInBusiness': f.yearsInBusiness = gone ? null : num(e.value); break
      case 'industryText': f.industryText = gone ? null : str(e.value); if (gone) f.subIndustry = null; break
      case 'industryCode': f.industryCode = gone ? null : str(e.value); break
      case 'industry': f.industry = gone ? null : (str(e.value) as Industry | null); break
      case 'headcount': {
        f.headcount = gone ? null : num(e.value)
        f.headcountBand = headcountBand(f.headcount)
        break
      }
      case 'tradeType': f.tradeType = gone ? null : (str(e.value) as ProfileFacts['tradeType']); break
      case 'creditNote': f.creditNote = gone ? null : str(e.value); break
      case 'patents': f.patents = gone ? null : num(e.value); break
      case 'products': f.products = gone ? [] : (str(e.value) ?? '').split(/[,、/]/).map((x) => x.trim()).filter(Boolean); break
      case 'certifications': f.certifications = gone ? [] : (str(e.value) ?? '').split(/[,、/]/).map((x) => x.trim()).filter(Boolean); break
      case 'revenueTrend': if (gone) f.growth = { revenueTrend: null, revenueGrowthPct: null, latestYear: f.growth.latestYear }; break
      default: {
        const m = e.key.match(/^fin_(revenue|operatingProfit|netIncome|assets|liabilities|equity)_(\d{4})$/)
        if (m) {
          const row = f.financials.find((x) => x.year === Number(m[2]))
          if (row) row[m[1] as 'revenue'] = gone ? null : num(e.value)
        }
      }
    }
  }
  return f
}

/** 근거 표시용 값 문자열 — 검토 화면에서 수정 입력의 초기값 */
export function evidenceEditValue(e: EvidenceField): string {
  return e.value === null ? '' : String(e.value)
}

/* ------------------------------------------------------------------ */
/* 1차 미팅용 핵심 4가지 — 업종 · 근로자 · 최근 매출 · 업력                */
/* ------------------------------------------------------------------ */

export interface CoreSummary {
  industry: string
  headcount: string
  revenue: string
  years: string
  representativeName: string
  /** 화면에 채울 값이 하나라도 있는가 */
  hasAny: boolean
}

/**
 * Partner 가 미팅 전에 봐야 할 것은 이 넷뿐이다.
 * 인증·특허·주소·신용등급·자산·부채 같은 값은 데이터에는 남기되 이 요약에 넣지 않는다(2차 제안·Master 분석용).
 */
export function coreSummary(company: Pick<Company, 'industry' | 'industryNote' | 'headcount' | 'representativeName'>, profile: CompanyProfile | null): CoreSummary {
  const f = profile?.facts
  const active = new Set(activeEvidence(profile).map((e) => e.key))
  // 업종은 읽기 쉬운 이름만 — 산업분류 코드는 근거(추출정보)에 남기고 요약에는 넣지 않는다
  const industryText = f?.subIndustry && active.has('industryText') ? f.subIndustry : company.industryNote || INDUSTRY_LABEL[company.industry]
  const industry = industryText.replace(/\s*\([A-Z]?\d{2,6}\)\s*$/, '').trim()
  const headcount = f?.headcount !== null && f?.headcount !== undefined && active.has('headcount') ? `${f.headcount.toLocaleString('ko-KR')}명` : company.headcount === 'unknown' ? '' : HEADCOUNT_LABEL[company.headcount]
  const latest = [...(f?.financials ?? [])].reverse().find((x) => x.revenue !== null && active.has(`fin_revenue_${x.year}`))
  const revenue = latest ? `${formatWonShort(latest.revenue)}원` : ''
  const years = f?.yearsInBusiness !== null && f?.yearsInBusiness !== undefined && (active.has('yearsInBusiness') || active.has('foundedAt')) ? `${f.yearsInBusiness}년` : ''
  return { industry, headcount, revenue, years, representativeName: f?.representativeName ?? company.representativeName ?? '', hasAny: Boolean(industry || headcount || revenue || years) }
}

/** 한 줄 배지용 — 업종 · 근로자 N · 매출 X · 업력 Y (기업인증은 넣지 않는다) */
export function coreSummaryLine(company: Parameters<typeof coreSummary>[0], profile: CompanyProfile | null): string {
  const c = coreSummary(company, profile)
  return [c.industry, c.headcount && `근로자 ${c.headcount}`, c.revenue && `매출 ${c.revenue}`, c.years && `업력 ${c.years}`].filter(Boolean).join(' · ')
}
