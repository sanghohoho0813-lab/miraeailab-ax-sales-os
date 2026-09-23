/**
 * 문서 어댑터 — 종류 감지 + 라벨 별칭.
 *   generic : 한국 기업정보 보고서·회사소개서 공통 규칙
 *   cretop  : 크레탑(NICE평가정보 기업정보) — 실제 샘플이 아직 제공되지 않아 감지 + 별칭만 분리해 두었다.
 *             샘플이 들어오면 이 어댑터의 aliases 만 보강한다 (문서에 없는 항목을 상상해서 만들지 않는다).
 */
import type { DocAdapter, TextDoc } from './types'

function joined(doc: TextDoc): string {
  return doc.pages.map((p) => p.lines.join('\n')).join('\n')
}

export const genericAdapter: DocAdapter = {
  id: 'generic',
  version: '1.0',
  docKind: '기업정보 보고서',
  detect: (doc) => (/(회사소개|Company\s*Profile|회사 소개서)/i.test(joined(doc)) ? 0.6 : 0.3),
}

export const cretopAdapter: DocAdapter = {
  id: 'cretop',
  version: '0.1-unverified',
  docKind: '크레탑 기업정보',
  detect: (doc) => (/(CRETOP|크레탑|NICE\s*평가정보|나이스평가정보|NICE\s*D&B|KED|한국기업데이터)/i.test(joined(doc)) ? 0.9 : 0),
  aliases: {
    companyName: [/^(?:기업체명|기업명\(상호\))\s*[:：]?\s*(.+)$/],
    headcount: [/^(?:종업원수\(명\)|종업원\s*\(명\))\s*[:：]?\s*([\d,]+)/],
    foundedAt: [/^(?:설립일자|법인등록일|개업연월일)\s*[:：]?\s*(\d{4})[.\-년/\s]*(\d{1,2})?[.\-월/\s]*(\d{1,2})?/],
  },
}

/**
 * 사업자등록증 — 업종(업태·종목)과 개업연월일이 확실하게 적혀 있는 문서.
 * 사업자등록번호는 법인 식별정보라 개인정보가 아니지만, 대표자 주민번호가 찍힌 판본이 있어 pii 규칙이 한 번 더 거른다.
 */
export const businessLicenseAdapter: DocAdapter = {
  id: 'business_license',
  version: '1.0',
  docKind: '사업자등록증',
  detect: (doc) => (/(사업자등록증|개업연월일)/.test(joined(doc)) ? 0.95 : 0),
  aliases: {
    companyName: [/^(?:상호|법인명\(단체명\)|상호\(법인명\))\s*[:：]?\s*(.+)$/],
    representativeName: [/^(?:성명|대표자|성명\(대표자\))\s*[:：]?\s*([가-힣]{2,5})(?:\s|$|,|·)/],
    foundedAt: [/^(?:개업연월일|개업일)\s*[:：]?\s*(\d{4})[.\-년/\s]*(\d{1,2})?[.\-월/\s]*(\d{1,2})?/],
    industryText: [/^(?:종목|업종|업태)\s*[:：]?\s*(.+)$/],
    address: [/^(?:사업장\s*소재지|사업장주소)\s*[:：]?\s*(.+)$/],
  },
}

/** 법인등기부등본 — 설립일과 자본금이 원본으로 확인되는 문서 */
export const corporateRegisterAdapter: DocAdapter = {
  id: 'corporate_register',
  version: '1.0',
  docKind: '법인등기부등본',
  detect: (doc) => (/(등기사항전부증명서|법인등기부|자본금의\s*액)/.test(joined(doc)) ? 0.95 : 0),
  aliases: {
    companyName: [/^(?:상\s*호|법인명)\s*[:：]?\s*(.+)$/],
    foundedAt: [/^(?:회사성립연월일|설립연월일|회사\s*성립)\s*[:：]?\s*(\d{4})[.\-년/\s]*(\d{1,2})?[.\-월/\s]*(\d{1,2})?/],
    address: [/^(?:본\s*점|본점\s*소재지)\s*[:：]?\s*(.+)$/],
  },
}

/**
 * 4대보험 가입자 명부 — 이 어댑터가 읽는 것은 "몇 명" 과 "언제 들어오고 나갔나" 뿐이다.
 * 이름·주민번호·생년월일은 규칙에도, 저장에도 넣지 않는다(rules.ts 의 집계 참조).
 */
export const insuranceRosterAdapter: DocAdapter = {
  id: 'insurance_roster',
  version: '1.0',
  docKind: '4대보험 가입자 명부',
  detect: (doc) => {
    const t = joined(doc)
    const roster = /(사업장\s*가입자\s*명부|가입자\s*명부|가입자\s*목록|피보험자\s*명부)/.test(t)
    const cols = /(자격취득일|취득일)/.test(t) && /(국민연금|건강보험|고용보험|산재보험)/.test(t)
    return roster || cols ? 0.95 : 0
  },
}

export const ADAPTERS: DocAdapter[] = [insuranceRosterAdapter, businessLicenseAdapter, corporateRegisterAdapter, cretopAdapter, genericAdapter]

export function pickAdapter(doc: TextDoc): DocAdapter {
  let best = genericAdapter
  let score = -1
  for (const a of ADAPTERS) {
    const s = a.detect(doc)
    if (s > score) {
      score = s
      best = a
    }
  }
  return best
}

export function docKindOf(doc: TextDoc, adapter: DocAdapter): string {
  if (adapter.id !== 'generic') return adapter.docKind
  const t = joined(doc)
  if (/(회사소개|Company\s*Profile|회사 소개서)/i.test(t)) return '회사소개서'
  if (/(신용정보|신용평가|기업신용)/.test(t)) return '기업 신용정보'
  return adapter.docKind
}
