/**
 * 한국어 숫자·금액·전화 정규화 — 음성 입력과 문서 파싱이 함께 쓴다. 순수 함수.
 */

const SINO: Record<string, number> = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 }
const NATIVE_ONES: [RegExp, number][] = [
  [/^(아홉)/, 9],
  [/^(여덟)/, 8],
  [/^(일곱)/, 7],
  [/^(여섯)/, 6],
  [/^(다섯)/, 5],
  [/^(넷|네)/, 4],
  [/^(셋|세)/, 3],
  [/^(둘|두)/, 2],
  [/^(하나|한)/, 1],
]
const NATIVE_TENS: [RegExp, number][] = [
  [/^(아흔)/, 90],
  [/^(여든)/, 80],
  [/^(일흔)/, 70],
  [/^(예순)/, 60],
  [/^(쉰)/, 50],
  [/^(마흔)/, 40],
  [/^(서른)/, 30],
  [/^(스물|스무)/, 20],
  [/^(열)/, 10],
]

/** 순우리말 수 (열다섯 → 15, 스무 → 20, 세 → 3). 못 읽으면 null */
export function parseNativeNumber(word: string): number | null {
  let rest = word.replace(/\s/g, '')
  let total = 0
  let matched = false
  for (const [re, v] of NATIVE_TENS) {
    if (re.test(rest)) {
      total += v
      rest = rest.replace(re, '')
      matched = true
      break
    }
  }
  for (const [re, v] of NATIVE_ONES) {
    if (re.test(rest)) {
      total += v
      rest = rest.replace(re, '')
      matched = true
      break
    }
  }
  if (!matched || rest.length > 0) return null
  return total
}

/** 한자어 수 (십오 → 15, 이십 → 20, 삼십명 의 삼십 → 30, 백이십 → 120). 못 읽으면 null */
export function parseSinoNumber(word: string): number | null {
  const w = word.replace(/\s/g, '')
  if (!w) return null
  let total = 0
  let cur = 0
  let any = false
  for (const ch of w) {
    if (ch in SINO) {
      cur = SINO[ch]
      any = true
    } else if (ch === '십') {
      total += (cur || 1) * 10
      cur = 0
      any = true
    } else if (ch === '백') {
      total += (cur || 1) * 100
      cur = 0
      any = true
    } else if (ch === '천') {
      total += (cur || 1) * 1000
      cur = 0
      any = true
    } else return null
  }
  return any ? total + cur : null
}

/** 숫자(아라비아·순우리말·한자어) → number */
export function parseCount(word: string): number | null {
  const s = word.replace(/[,\s]/g, '')
  if (/^\d+$/.test(s)) return Number(s)
  return parseNativeNumber(s) ?? parseSinoNumber(s)
}

/** "공일공 일이삼사 오육칠팔" 처럼 읽은 숫자를 아라비아 숫자로 */
export function koreanDigitsToArabic(text: string): string {
  return text.replace(/[영공일이삼사오육륙칠팔구]/g, (ch) => String(SINO[ch]))
}

/** 전화번호 정규화 — 010-1234-5678 / 02-123-4567. 못 읽으면 null */
export function normalizePhoneText(text: string): string | null {
  const digits = koreanDigitsToArabic(text).replace(/\D/g, '')
  const m = digits.match(/(01[016789]\d{7,8}|0[2-9]\d{7,9}|1[5678]\d{2}\d{4})/)
  if (!m) return null
  const d = m[1]
  if (d.startsWith('02')) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  return null
}

const UNIT_MULT: Record<string, number> = { 원: 1, 천원: 1_000, 만원: 10_000, 백만원: 1_000_000, 천만원: 10_000_000, 억원: 100_000_000, 억: 100_000_000, 만: 10_000, 백만: 1_000_000, 천: 1_000 }

/** 문서 단위 표기 "(단위: 백만원)" → 배수. 없으면 null */
export function detectUnitMultiplier(text: string): number | null {
  const m = text.match(/단위\s*[:：]?\s*(천원|백만원|천만원|억원|만원|원)/)
  return m ? UNIT_MULT[m[1]] ?? null : null
}

/** 금액 문자열 → 원. "12억 3,000만원" / "1,234백만원" / "△1,200" (음수) / "(1,200)" (음수) / "1,234" (단위 배수 적용) */
export function parseMoney(raw: string, unitMultiplier = 1): number | null {
  let s = raw.replace(/\s/g, '').replace(/원$/, '')
  if (!s || s === '-' || s === '－') return null
  let sign = 1
  if (/^[△▲(\-−]/.test(s)) {
    sign = -1
    s = s.replace(/^[△▲(\-−]+/, '').replace(/\)$/, '')
  }
  // 12억3,000만 / 3억 / 5천만
  const mixed = s.match(/^(?:(\d[\d,]*)억)?(?:(\d[\d,]*)천만)?(?:(\d[\d,]*)백만)?(?:(\d[\d,]*)만)?(?:(\d[\d,]*)천)?(?:(\d[\d,]*))?$/)
  if (mixed && (mixed[1] || mixed[2] || mixed[3] || mixed[4] || mixed[5])) {
    const n = (v: string | undefined) => (v ? Number(v.replace(/,/g, '')) : 0)
    const total = n(mixed[1]) * 100_000_000 + n(mixed[2]) * 10_000_000 + n(mixed[3]) * 1_000_000 + n(mixed[4]) * 10_000 + n(mixed[5]) * 1_000 + n(mixed[6])
    return sign * total
  }
  // 1,234백만원 / 1,234천원 (단위가 숫자 뒤에 붙은 경우)
  const withUnit = s.match(/^(\d[\d,]*(?:\.\d+)?)(천원|백만원|천만원|억원|만원|백만|천|만|억)$/)
  if (withUnit) return sign * Math.round(Number(withUnit[1].replace(/,/g, '')) * (UNIT_MULT[withUnit[2]] ?? 1))
  const plain = s.match(/^(\d[\d,]*(?:\.\d+)?)$/)
  if (plain) return sign * Math.round(Number(plain[1].replace(/,/g, '')) * unitMultiplier)
  return null
}

/** 원 → "12억 3,000만 원" 표시 */
export function formatWon(v: number | null): string {
  if (v === null) return '-'
  const neg = v < 0
  const a = Math.abs(v)
  let out: string
  if (a >= 100_000_000) {
    const eok = Math.floor(a / 100_000_000)
    const man = Math.round((a % 100_000_000) / 10_000)
    out = man > 0 ? `${eok.toLocaleString('ko-KR')}억 ${man.toLocaleString('ko-KR')}만 원` : `${eok.toLocaleString('ko-KR')}억 원`
  } else if (a >= 10_000) out = `${Math.round(a / 10_000).toLocaleString('ko-KR')}만 원`
  else out = `${a.toLocaleString('ko-KR')}원`
  return neg ? `-${out}` : out
}

/** 표 셀용 짧은 표기 — 112.3억 · 4,700만 · 300원 (폰 폭에서 줄바꿈되지 않게) */
export function formatWonShort(v: number | null): string {
  if (v === null) return '-'
  const neg = v < 0
  const a = Math.abs(v)
  let out: string
  if (a >= 100_000_000) out = `${(a / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`
  else if (a >= 10_000) out = `${Math.round(a / 10_000).toLocaleString('ko-KR')}만`
  else out = `${a.toLocaleString('ko-KR')}원`
  return neg ? `-${out}` : out
}
