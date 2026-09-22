import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCompanyDocument, factsToCompanyDraft, hasUsableText } from './index'
import { detectUnitMultiplier, formatWon, formatWonShort, normalizePhoneText, parseCount, parseMoney, parseNativeNumber, parseSinoNumber } from './korean'
import { containsResidentNumber, scrubPii } from './pii'
import type { TextDoc } from './types'
import { extractPdfTextWith, itemsToLines, type PdfJsLike } from '../../lib/pdfText'

function doc(pages: string[][], fileName = 'x.pdf'): TextDoc {
  return { fileName, pageCount: pages.length, pages: pages.map((lines, i) => ({ page: i + 1, lines })), textChars: pages.flat().join('').length }
}

describe('korean numbers / money', () => {
  it('순우리말·한자어 수', () => {
    expect(parseNativeNumber('열다섯')).toBe(15)
    expect(parseNativeNumber('스무')).toBe(20)
    expect(parseNativeNumber('서른둘')).toBe(32)
    expect(parseNativeNumber('세')).toBe(3)
    expect(parseSinoNumber('십오')).toBe(15)
    expect(parseSinoNumber('이십')).toBe(20)
    expect(parseSinoNumber('백이십')).toBe(120)
    expect(parseCount('14')).toBe(14)
    expect(parseCount('열다섯')).toBe(15)
    expect(parseCount('삼십')).toBe(30)
    expect(parseCount('엉뚱')).toBeNull()
  })
  it('전화번호 — 한글 숫자 읽기 포함', () => {
    expect(normalizePhoneText('010 1234 5678')).toBe('010-1234-5678')
    expect(normalizePhoneText('공일공 일이삼사 오육칠팔')).toBe('010-1234-5678')
    expect(normalizePhoneText('031-000-0000')).toBe('031-000-0000')
    expect(normalizePhoneText('02 123 4567')).toBe('02-123-4567')
    expect(normalizePhoneText('1588-1234')).toBe('1588-1234')
    expect(normalizePhoneText('아무거나')).toBeNull()
  })
  it('금액 단위', () => {
    expect(parseMoney('12억 3,000만원')).toBe(1_230_000_000)
    expect(parseMoney('1,234백만원')).toBe(1_234_000_000)
    expect(parseMoney('5천만원')).toBe(50_000_000)
    expect(parseMoney('1,234', 1_000_000)).toBe(1_234_000_000)
    expect(parseMoney('△1,200', 1_000)).toBe(-1_200_000)
    expect(parseMoney('(300)', 1)).toBe(-300)
    expect(parseMoney('-')).toBeNull()
    expect(detectUnitMultiplier('요약 재무 (단위: 백만원)')).toBe(1_000_000)
    expect(detectUnitMultiplier('단위 : 천원')).toBe(1_000)
    expect(formatWon(1_230_000_000)).toBe('12억 3,000만 원')
    expect(formatWon(50_000_000)).toBe('5,000만 원')
    expect(formatWonShort(11_230_000_000)).toBe('112.3억')
    expect(formatWonShort(300_000_000)).toBe('3억')
    expect(formatWonShort(47_000_000)).toBe('4,700만')
  })
})

describe('PII', () => {
  it('주민번호·계좌는 지운다', () => {
    expect(containsResidentNumber('대표자 901231-1234567')).toBe(true)
    expect(containsResidentNumber('사업자 123-45-67890')).toBe(false)
    expect(scrubPii('대표자 901231-1234567 계좌번호 110-123-456789')).toBe('대표자 ******-******* 계좌번호 **********')
  })
})

describe('generic company document parser', () => {
  const d = doc([
    ['기업정보 보고서 — 테스트정밀 주식회사'],
    ['1. 기업 개요', '회사명 : 테스트정밀 주식회사', '대표자 : 김가상', '설립일 : 2012.03.15', '업종 : 자동차 부품 제조업 (C30320)', '종업원수 : 14명', '주소 : 경기도 화성시 테스트로 12 (사업장)', '전화번호 : 031-000-0000', '주요제품 : 정밀 절삭 부품, 브래킷, 금형', '기업 인증 : 벤처기업확인, 기업부설연구소, ISO 9001', '특허 등록 3건', '자택 주소 : 서울시 어딘가', '대표자 주민등록번호 000000-1000000'],
    ['2. 요약 재무', '(단위: 백만원)', '구분 2023년 2024년 2025년', '매출액 8,120 9,540 11,230', '영업이익 410 520 690', '당기순이익 300 380 520', '자산총계 6,200 7,100 8,300', '부채총계 3,100 3,300 3,600', '자본총계 3,100 3,800 4,700'],
    ['3. 신용 · 거래 정보', '기업신용등급 : BBB', '주요 거래처 : 완성차 협력사 3곳 (B2B 납품)', '비고 : 견적은 대표가 직접 산출, 발주는 전화·팩스 접수'],
  ])
  const parsed = parseCompanyDocument(d)
  const f = parsed.facts
  it('문서에 있는 항목만 — 페이지·원문과 함께', () => {
    expect(parsed.adapter).toBe('generic')
    expect(f.companyName).toBe('테스트정밀')
    expect(f.representativeName).toBe('김가상')
    expect(f.foundedAt).toBe('2012-03-15')
    expect(f.industryCode).toBe('C30320')
    expect(f.industry).toBe('manufacturing')
    expect(f.headcount).toBe(14)
    expect(f.headcountBand).toBe('11-20')
    expect(f.phone).toBe('031-000-0000')
    expect(f.products).toEqual(['정밀 절삭 부품', '브래킷', '금형'])
    expect(f.certifications).toEqual(expect.arrayContaining(['벤처기업', '기업부설연구소', 'ISO 9001']))
    expect(f.patents).toBe(3)
    expect(f.creditNote).toBe('BBB')
    const hc = parsed.evidence.find((e) => e.key === 'headcount')!
    expect(hc.status).toBe('confirmed')
    expect(hc.sourcePage).toBe(2)
    expect(hc.sourceText).toContain('종업원수')
    const ind = parsed.evidence.find((e) => e.key === 'industry')!
    expect(ind.status).toBe('confirmed') // 산업분류 코드로 확정
  })
  it('재무 표 — 단위 적용, 성장 추이', () => {
    expect(f.financials.map((x) => x.year)).toEqual([2023, 2024, 2025])
    expect(f.financials[2].revenue).toBe(11_230_000_000)
    expect(f.financials[0].operatingProfit).toBe(410_000_000)
    expect(f.financials[2].equity).toBe(4_700_000_000)
    expect(f.growth).toEqual({ revenueTrend: 'up', revenueGrowthPct: 18, latestYear: 2025 })
  })
  it('추정은 assumed — 거래형태는 문구로만 추정하고 확정하지 않는다', () => {
    expect(f.tradeType).toBe('b2b')
    expect(parsed.evidence.find((e) => e.key === 'tradeType')!.status).toBe('assumed')
    const draft = factsToCompanyDraft(f)
    expect(draft).toMatchObject({ name: '테스트정밀', industry: 'manufacturing', headcount: '11-20', tradeType: 'b2b', representativeName: '김가상', phone: '031-000-0000' })
    expect(draft.interests).toEqual(expect.arrayContaining(['rnd', 'venture']))
  })
  it('개인정보 줄은 통째로 버린다 — 주민번호·자택 주소가 어디에도 없다', () => {
    const json = JSON.stringify(parsed)
    expect(json).not.toContain('000000-1000000')
    expect(json).not.toContain('자택')
    expect(f.address).toContain('화성시')
  })
  it('같은 항목에 다른 값이 여럿이면 첫 값을 추정으로 낮춘다', () => {
    const p2 = parseCompanyDocument(doc([['종업원수 : 14명'], ['직원수 : 22명']]))
    expect(p2.facts.headcount).toBe(14)
    expect(p2.evidence.find((e) => e.key === 'headcount')!.status).toBe('assumed')
    expect(p2.warnings.some((w) => w.includes('직원수'))).toBe(true)
  })
  it('없는 항목은 null / [] — 상상해서 채우지 않는다', () => {
    const p3 = parseCompanyDocument(doc([['회사소개서', '회사명 : 빈칸상사']]))
    expect(p3.facts.companyName).toBe('빈칸상사')
    expect(p3.facts.headcount).toBeNull()
    expect(p3.facts.financials).toEqual([])
    expect(p3.facts.industry).toBeNull()
    expect(p3.docKind).toBe('회사소개서')
    expect(hasUsableText(p3)).toBe(false)
  })
  it('한 줄 금액 표기 — 매출액 12억 3,000만원', () => {
    const p4 = parseCompanyDocument(doc([['2025년 실적', '매출액 12억 3,000만원', '영업이익 1억 5,000만원']]))
    expect(p4.facts.financials[0]).toMatchObject({ year: 2025, revenue: 1_230_000_000, operatingProfit: 150_000_000 })
  })
  it('회사명에 뒤따르는 라벨을 잘라낸다 — "매시브크리에이티브 영문기업명 MassiveCreative" 같은 한 줄', () => {
    const cases: [string, string][] = [
      ['회사명 : 매시브크리에이티브 영문기업명 MassiveCreative', '매시브크리에이티브'],
      ['기업명 : 테스트정밀 주식회사 대표자 김가상', '테스트정밀'],
      ['상호 : 한빛물류 영문명 Hanbit Logistics', '한빛물류'],
      ['회사명 : 가온에프앤비 English Name GAON F&B', '가온에프앤비'],
      ['회사명 : 미래에이아이랩 대표이사 김상호', '미래에이아이랩'],
      ['회사명 : 새봄케어 (주)', '새봄케어'],
    ]
    for (const [line, want] of cases) {
      const parsed = parseCompanyDocument(doc([[line]]))
      expect(parsed.facts.companyName, line).toBe(want)
    }
  })
  it('크레탑 문구가 있으면 cretop 어댑터(미검증 표시)', () => {
    const p5 = parseCompanyDocument(doc([['CRETOP 기업정보', '기업체명 : 나이스테스트', '종업원수(명) : 9']]))
    expect(p5.adapter).toBe('cretop')
    expect(p5.facts.companyName).toBe('나이스테스트')
    expect(p5.facts.headcount).toBe(9)
    expect(p5.warnings.some((w) => w.includes('크레탑'))).toBe(true)
  })
})

describe('pdf.js text layer → lines', () => {
  it('같은 y 의 조각을 x 순으로 잇고, 간격이 크면 띄운다', () => {
    const items = [
      { str: '종업원수', transform: [10, 0, 0, 10, 50, 700], width: 40, height: 10 },
      { str: ':', transform: [10, 0, 0, 10, 92, 700], width: 3, height: 10 },
      { str: '14명', transform: [10, 0, 0, 10, 100, 700], width: 20, height: 10 },
      { str: '회사명', transform: [10, 0, 0, 10, 50, 720], width: 30, height: 10 },
    ]
    expect(itemsToLines(items)).toEqual(['회사명', '종업원수: 14명'])
  })
  it('픽스처 PDF를 pdf.js(legacy) 로 읽어 같은 파서 결과가 나온다', async () => {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike
    const buf = readFileSync('e2e/fixtures/sample-company-report.pdf')
    const text = await extractPdfTextWith(pdfjs, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'sample-company-report.pdf', { cMapUrl: 'node_modules/pdfjs-dist/cmaps/', standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' })
    expect(text.pageCount).toBe(4)
    expect(text.hasTextLayer).toBe(true)
    expect(text.sha256).toMatch(/^[0-9a-f]{64}$/)
    const parsed = parseCompanyDocument(text)
    expect(parsed.facts.companyName).toBe('테스트정밀')
    expect(parsed.facts.headcount).toBe(14)
    expect(parsed.facts.financials[2]?.revenue).toBe(11_230_000_000)
    expect(parsed.facts.growth.revenueTrend).toBe('up')
    expect(JSON.stringify(parsed)).not.toContain('000000-1000000')
  }, 30_000)
})
