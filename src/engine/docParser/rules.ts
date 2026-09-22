/**
 * 일반 기업정보 PDF 규칙 — "라벨 : 값" 한 줄 패턴과 재무 표(연도 열 + 항목 행).
 * 문서에 실제로 있는 값만 뽑고, 같은 항목에 서로 다른 값이 여러 번 나오면 첫 값을 🟡 추정으로 낮춘다.
 */
import type { EvidenceField, FinancialYear, Headcount, ProfileFacts, TradeType } from '../../types/domain'
import type { RuleKey, TextDoc } from './types'
import { detectUnitMultiplier, formatWon, normalizePhoneText, parseMoney } from './korean'
import { isPersonalLine, scrubPii } from './pii'
import { emptyFacts, headcountBand, mapIndustry } from '../profile'

export const LABELS: Record<RuleKey, RegExp[]> = {
  companyName: [/^(?:회사명|기업명|상호|상호명|법인명|업체명|기업체명)\s*[:：]?\s*(.+)$/],
  representativeName: [/^(?:대표자명|대표자|대표이사|대표)\s*[:：]?\s*([가-힣]{2,5})(?:\s|$|,|·)/],
  phone: [/^(?:전화번호|대표전화|대표 전화|전화|연락처|TEL|Tel|T\.)\s*[:：]?\s*((?:0\d{1,2}|1[5-8]\d{2})[-\s.)]*\d{3,4}[-\s.]*\d{4})/],
  address: [/^(?:주소|소재지|본사 주소|본사주소|사업장 주소|사업장주소|본점 소재지|본점)\s*[:：]?\s*(.+)$/],
  foundedAt: [/^(?:설립일자|설립일|설립년월일|설립연월일|법인설립일|창업일|개업일|설립)\s*[:：]?\s*(\d{4})[.\-년/\s]*(\d{1,2})?[.\-월/\s]*(\d{1,2})?/],
  yearsInBusiness: [/^(?:업력)\s*[:：]?\s*(\d{1,3})\s*년/],
  industryText: [/^(?:업종명|주업종|업종|산업분류|표준산업분류|업태)\s*[:：]?\s*(.+)$/],
  headcount: [/^(?:종업원수|종업원 수|직원수|직원 수|상시근로자수|상시근로자 수|상시 근로자수|상시 근로자|근로자수|근로자 수|임직원수|임직원 수|종업원|인원)\s*[:：]?\s*([\d,]+)\s*(?:명|인)?/],
  creditNote: [/^(?:기업신용등급|신용등급|신용평가등급|기업신용평가등급|현금흐름등급|Credit Grade)\s*[:：]?\s*([A-Za-z][A-Za-z0-9+-]{0,6})/],
  products: [/^(?:주요제품|주요 제품|주요생산품|주요 생산품|주요상품|주요서비스|주요 서비스|주요사업|주요 사업|사업내용|취급품목|취급 품목)\s*[:：]?\s*(.+)$/],
}

// 한글 뒤에는 \b 가 동작하지 않으므로 "라벨 다음은 공백·콜론·끝" 으로 경계를 잡는다
const FIN_ROWS: [keyof Omit<FinancialYear, 'year'>, RegExp][] = [
  ['revenue', /^(?:매출액\(수익\)|매출액|매출|영업수익)(?=[\s:：]|$)/],
  ['operatingProfit', /^(?:영업이익\(손실\)|영업이익|영업손익)(?=[\s:：]|$)/],
  ['netIncome', /^(?:당기순이익\(손실\)|당기순이익|당기순손익|순이익)(?=[\s:：]|$)/],
  ['assets', /^(?:자산총계|총자산|자산)(?=[\s:：]|$)/],
  ['liabilities', /^(?:부채총계|총부채|부채)(?=[\s:：]|$)/],
  ['equity', /^(?:자본총계|총자본|자본)(?=[\s:：]|$)/],
]

const CERT_PATTERNS: [string, RegExp][] = [
  ['벤처기업', /벤처기업\s*(?:확인|인증|등록)?/],
  ['이노비즈', /이노비즈|INNO-?BIZ/i],
  ['메인비즈', /메인비즈|MAIN-?BIZ/i],
  ['기업부설연구소', /기업부설연구소/],
  ['연구개발전담부서', /연구개발전담부서|연구전담부서/],
  ['ISO 9001', /ISO\s*9001/i],
  ['ISO 14001', /ISO\s*14001/i],
  ['ISO 45001', /ISO\s*45001/i],
  ['소재부품장비 전문기업', /소재·?부품·?장비\s*전문기업|소부장\s*전문기업/],
  ['강소기업', /강소기업/],
  ['여성기업', /여성기업/],
  ['수출유망중소기업', /수출유망/],
  ['뿌리기업', /뿌리기업/],
  ['우수기술연구센터', /ATC|우수기술연구센터/],
  ['가족친화인증', /가족친화/],
  ['HACCP', /HACCP/i],
  ['GMP', /\bGMP\b/],
]

const B2B_HINT = /B2B|기업\s*대상|납품|OEM|ODM|산업용|도매|기업고객|거래처|공급계약|발주처|협력사/i
const B2C_HINT = /B2C|소비자|일반\s*고객|온라인몰|매장|소매|프랜차이즈|고객님|회원/i

interface Hit {
  value: string
  page: number
  line: string
}

function findAll(doc: TextDoc, patterns: RegExp[]): Hit[] {
  const hits: Hit[] = []
  for (const p of doc.pages) {
    for (const raw of p.lines) {
      const line = raw.trim()
      if (!line || isPersonalLine(line)) continue
      for (const re of patterns) {
        const m = line.match(re)
        if (m) {
          hits.push({ value: m.slice(1).filter(Boolean).join('|'), page: p.page, line })
          break
        }
      }
    }
  }
  return hits
}

function cleanCompanyName(v: string): string {
  return v
    .replace(/\s*(대표자|대표이사|대표)\s*[:：]?.*$/, '')
    .replace(/\s*\|.*$/, '')
    .replace(/^(?:주식회사|㈜|\(주\))\s*/, '')
    .replace(/\s*(?:주식회사|㈜|\(주\))$/, '')
    .trim()
}

export function buildEvidence(key: string, label: string, value: string | number | null, display: string, status: EvidenceField['status'], page: number | null, line: string): EvidenceField {
  return { key, label, value, display, status, source: 'pdf', sourcePage: page, sourceText: scrubPii(line).slice(0, 160) }
}

/** 문서 → facts + evidence. aliases 로 어댑터가 라벨을 보탤 수 있다 */
export function extractFacts(doc: TextDoc, aliases: Partial<Record<RuleKey, RegExp[]>> = {}): { facts: ProfileFacts; evidence: EvidenceField[]; warnings: string[] } {
  const facts = emptyFacts()
  const evidence: EvidenceField[] = []
  const warnings: string[] = []
  const rules = (k: RuleKey) => [...(aliases[k] ?? []), ...LABELS[k]]

  const single = (k: RuleKey, label: string, normalize: (raw: string, line: string) => { value: string | number | null; display: string } | null): Hit | null => {
    const hits = findAll(doc, rules(k))
    if (!hits.length) return null
    const first = hits[0]
    const norm = normalize(first.value, first.line)
    if (!norm || norm.value === null || norm.value === '') return null
    const distinct = new Set(hits.map((h) => normalize(h.value, h.line)?.value).filter((v) => v !== null && v !== undefined && v !== ''))
    const status: EvidenceField['status'] = distinct.size > 1 ? 'assumed' : 'confirmed'
    if (distinct.size > 1) warnings.push(`${label}: 문서에 서로 다른 값이 ${distinct.size}개 있어 첫 값을 추정으로 표시했습니다.`)
    evidence.push(buildEvidence(k, label, norm.value, norm.display, status, first.page, first.line))
    return first
  }

  // 회사명
  single('companyName', '회사명', (raw) => {
    const v = cleanCompanyName(raw)
    return v.length >= 2 && v.length <= 40 ? { value: v, display: v } : null
  })
  facts.companyName = (evidence.find((e) => e.key === 'companyName')?.value as string | undefined) ?? null

  // 대표자
  single('representativeName', '대표자', (raw) => {
    const v = raw.split('|')[0].trim()
    return /^[가-힣]{2,5}$/.test(v) ? { value: v, display: v } : null
  })
  facts.representativeName = (evidence.find((e) => e.key === 'representativeName')?.value as string | undefined) ?? null

  // 연락처 (회사 대표번호)
  single('phone', '대표 연락처', (raw) => {
    const v = normalizePhoneText(raw)
    return v ? { value: v, display: v } : null
  })
  facts.phone = (evidence.find((e) => e.key === 'phone')?.value as string | undefined) ?? null

  // 주소 (사업장)
  single('address', '사업장 주소', (raw) => {
    const v = raw.replace(/\s+/g, ' ').trim()
    return v.length >= 6 ? { value: v, display: v } : null
  })
  facts.address = (evidence.find((e) => e.key === 'address')?.value as string | undefined) ?? null

  // 설립일
  single('foundedAt', '설립일', (raw) => {
    const [y, m, d] = raw.split('|')
    if (!y) return null
    const year = Number(y)
    if (year < 1900 || year > 2100) return null
    const v = d ? `${y}-${m!.padStart(2, '0')}-${d.padStart(2, '0')}` : m ? `${y}-${m.padStart(2, '0')}` : y
    return { value: v, display: v.replace(/-/g, '.') }
  })
  facts.foundedAt = (evidence.find((e) => e.key === 'foundedAt')?.value as string | undefined) ?? null

  // 업력 (문서 표기 우선, 없으면 설립일에서 계산해 추정)
  single('yearsInBusiness', '업력', (raw) => {
    const n = Number(raw)
    return n > 0 && n < 150 ? { value: n, display: `${n}년` } : null
  })
  facts.yearsInBusiness = (evidence.find((e) => e.key === 'yearsInBusiness')?.value as number | undefined) ?? null
  if (facts.yearsInBusiness === null && facts.foundedAt) {
    const years = new Date().getFullYear() - Number(facts.foundedAt.slice(0, 4))
    if (years >= 0 && years < 150) {
      facts.yearsInBusiness = years
      evidence.push(buildEvidence('yearsInBusiness', '업력', years, `약 ${years}년`, 'assumed', evidence.find((e) => e.key === 'foundedAt')?.sourcePage ?? null, '설립일에서 계산'))
    }
  }

  // 업종
  const indHit = single('industryText', '업종', (raw) => {
    const v = raw.replace(/\s+/g, ' ').trim()
    return v.length >= 2 ? { value: v, display: v } : null
  })
  facts.industryText = (evidence.find((e) => e.key === 'industryText')?.value as string | undefined) ?? null
  if (indHit) {
    const code = indHit.line.match(/\b([A-U]\d{2,5})\b/)
    facts.industryCode = code ? code[1] : null
    if (facts.industryCode) evidence.push(buildEvidence('industryCode', '산업분류 코드', facts.industryCode, facts.industryCode, 'confirmed', indHit.page, indHit.line))
  }
  if (facts.industryText || facts.industryCode) {
    const mapped = mapIndustry(facts.industryText, facts.industryCode)
    facts.industry = mapped.industry
    if (mapped.industry) evidence.push(buildEvidence('industry', '업종 분류', mapped.industry, mapped.industry, mapped.byCode ? 'confirmed' : 'assumed', indHit?.page ?? null, mapped.byCode ? `산업분류 코드 ${facts.industryCode}` : `업종명 "${facts.industryText}" 에서 추정`))
    facts.subIndustry = facts.industryText
  }

  // 직원수
  single('headcount', '직원수', (raw) => {
    const n = Number(raw.replace(/,/g, ''))
    return n > 0 && n < 100_000 ? { value: n, display: `${n.toLocaleString('ko-KR')}명` } : null
  })
  facts.headcount = (evidence.find((e) => e.key === 'headcount')?.value as number | undefined) ?? null
  facts.headcountBand = headcountBand(facts.headcount)

  // 신용 (공개 등급 문구만)
  single('creditNote', '신용등급', (raw) => ({ value: raw.trim(), display: raw.trim() }))
  facts.creditNote = (evidence.find((e) => e.key === 'creditNote')?.value as string | undefined) ?? null

  // 주요 제품/서비스
  const prodHits = findAll(doc, rules('products'))
  if (prodHits.length) {
    const items = prodHits[0].value
      .split(/[,、·/|]|\s{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 40)
      .slice(0, 8)
    if (items.length) {
      facts.products = items
      evidence.push(buildEvidence('products', '주요 제품·서비스', items.join(', '), items.join(', '), 'confirmed', prodHits[0].page, prodHits[0].line))
    }
  }

  // 인증 · 특허 (문서 전체에서 키워드)
  const allText = doc.pages.map((p) => ({ page: p.page, text: p.lines.join('\n') }))
  const certs = new Map<string, number>()
  for (const [name, re] of CERT_PATTERNS) {
    for (const p of allText) {
      if (re.test(p.text)) {
        if (!certs.has(name)) certs.set(name, p.page)
        break
      }
    }
  }
  if (certs.size) {
    facts.certifications = [...certs.keys()]
    evidence.push(buildEvidence('certifications', '인증·확인', facts.certifications.join(', '), facts.certifications.join(', '), 'confirmed', [...certs.values()][0], `문서에서 확인: ${facts.certifications.join(', ')}`))
  }
  for (const p of allText) {
    const m = p.text.match(/특허\s*(?:등록|보유)?\s*[:：]?\s*(\d{1,3})\s*건/)
    if (m) {
      facts.patents = Number(m[1])
      evidence.push(buildEvidence('patents', '특허', facts.patents, `${facts.patents}건`, 'confirmed', p.page, m[0]))
      break
    }
  }

  // 재무 표
  const fin = extractFinancials(doc)
  facts.financials = fin.years
  evidence.push(...fin.evidence)
  warnings.push(...fin.warnings)
  facts.growth = growthOf(facts.financials)
  if (facts.growth.revenueTrend) {
    const g = facts.growth
    const txt = g.revenueTrend === 'up' ? `매출 증가 (${g.revenueGrowthPct}%)` : g.revenueTrend === 'down' ? `매출 감소 (${g.revenueGrowthPct}%)` : '매출 보합'
    evidence.push(buildEvidence('revenueTrend', '최근 매출 추이', g.revenueTrend, txt, 'confirmed', fin.page, `재무 표 ${g.latestYear}년 대비`))
  }

  // 거래형태 — 문서 문구에서 추정만 (확정하지 않는다)
  const joined = allText.map((p) => p.text).join('\n')
  const b2b = B2B_HINT.test(joined)
  const b2c = B2C_HINT.test(joined)
  const trade: TradeType | null = b2b && b2c ? 'both' : b2b ? 'b2b' : b2c ? 'b2c' : null
  if (trade) {
    facts.tradeType = trade
    const hintPage = allText.find((p) => (b2b ? B2B_HINT : B2C_HINT).test(p.text))?.page ?? null
    evidence.push(buildEvidence('tradeType', '거래형태', trade, trade === 'both' ? 'B2B + B2C 추정' : trade === 'b2b' ? 'B2B 추정' : 'B2C 추정', 'assumed', hintPage, '사업내용·제품 문구를 기반으로 추정'))
  }

  // 기타 메모 — 거래처·수출 등 AX 전략에 유용한 한 줄
  for (const p of doc.pages) {
    for (const raw of p.lines) {
      const line = raw.trim()
      if (/(주요\s*거래처|거래처\s*수|수출\s*(?:국가|실적|액)|매출\s*구성|주요\s*고객)/.test(line) && !isPersonalLine(line) && facts.notes.length < 5) facts.notes.push(scrubPii(line).slice(0, 120))
    }
  }

  return { facts, evidence, warnings }
}

/** 연도 열 헤더 + 항목 행 → 연도별 재무. "매출액 12억 3,000만원" 같은 한 줄 표기도 읽는다 */
export function extractFinancials(doc: TextDoc): { years: FinancialYear[]; evidence: EvidenceField[]; warnings: string[]; page: number | null } {
  const byYear = new Map<number, FinancialYear>()
  const evidence: EvidenceField[] = []
  const warnings: string[] = []
  let page: number | null = null
  const get = (y: number) => {
    if (!byYear.has(y)) byYear.set(y, { year: y, revenue: null, operatingProfit: null, netIncome: null, assets: null, liabilities: null, equity: null })
    return byYear.get(y)!
  }
  for (const p of doc.pages) {
    const text = p.lines.join('\n')
    const unit = detectUnitMultiplier(text) ?? 1
    let years: number[] = []
    for (const raw of p.lines) {
      const line = raw.trim()
      const yearCols = [...line.matchAll(/(20\d{2}|19\d{2})\s*(?:년|년도|기)?/g)].map((m) => Number(m[1]))
      if (yearCols.length >= 2 && !/[가-힣]{3,}/.test(line.replace(/년도?|기/g, ''))) {
        years = yearCols
        continue
      }
      for (const [key, re] of FIN_ROWS) {
        if (!re.test(line)) continue
        const rest = line.replace(re, '').replace(/^[\s:：]+/, '')
        // 한 줄 표기: 매출액 12억 3,000만원
        const oneLine = rest.match(/^([△▲(\-−]?\d[\d,]*(?:억|천만|백만|만|천)?(?:\s*\d[\d,]*(?:천만|백만|만|천))*\s*원?)\s*$/)
        if (oneLine && !years.length) {
          const v = parseMoney(oneLine[1].replace(/\s/g, ''), unit)
          if (v !== null) {
            const y = Number(text.match(/(20\d{2})\s*년/)?.[1] ?? new Date().getFullYear() - 1)
            get(y)[key] = v
            page = page ?? p.page
            evidence.push(buildEvidence(`fin_${key}_${y}`, finLabel(key, y), v, formatWon(v), 'confirmed', p.page, line))
          }
          break
        }
        const cells = rest.split(/\s{1,}|\t/).filter((c) => /^[△▲(\-−]?\d[\d,]*(?:\.\d+)?\)?$|^-$|^－$/.test(c))
        if (years.length && cells.length) {
          const n = Math.min(cells.length, years.length)
          for (let i = 0; i < n; i++) {
            const v = parseMoney(cells[i], unit)
            if (v === null) continue
            const y = years[i]
            get(y)[key] = v
            page = page ?? p.page
            evidence.push(buildEvidence(`fin_${key}_${y}`, finLabel(key, y), v, formatWon(v), 'confirmed', p.page, line))
          }
        }
        break
      }
    }
  }
  const list = [...byYear.values()].sort((a, b) => a.year - b.year)
  if (list.length && !doc.pages.some((p) => detectUnitMultiplier(p.lines.join('\n')))) {
    const looksSmall = list.every((f) => (f.revenue ?? 0) < 10_000_000 && f.revenue !== null)
    if (looksSmall) warnings.push('재무 표의 단위 표기(천원/백만원)를 찾지 못해 금액이 실제보다 작게 읽혔을 수 있습니다. 확인 후 수정하세요.')
  }
  return { years: list, evidence, warnings, page }
}

function finLabel(key: keyof Omit<FinancialYear, 'year'>, year: number): string {
  const name = { revenue: '매출액', operatingProfit: '영업이익', netIncome: '당기순이익', assets: '자산총계', liabilities: '부채총계', equity: '자본총계' }[key]
  return `${year}년 ${name}`
}

export function growthOf(fin: FinancialYear[]): ProfileFacts['growth'] {
  const withRev = fin.filter((f) => f.revenue !== null && f.revenue > 0)
  if (withRev.length < 2) return { revenueTrend: null, revenueGrowthPct: null, latestYear: withRev[0]?.year ?? null }
  const last = withRev[withRev.length - 1]
  const prev = withRev[withRev.length - 2]
  const pct = Math.round(((last.revenue! - prev.revenue!) / prev.revenue!) * 100)
  return { revenueTrend: pct >= 5 ? 'up' : pct <= -5 ? 'down' : 'flat', revenueGrowthPct: pct, latestYear: last.year }
}

export type { Headcount }
