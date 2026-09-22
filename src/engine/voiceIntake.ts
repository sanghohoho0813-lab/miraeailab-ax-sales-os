/**
 * 음성 한 번에 입력 — "ABC산업 김철수 대표, 오늘 오후 세시 미팅이고 직원은 열다섯 명 정도, 제조업입니다."
 * → 초안(Draft). 확신이 없는 값은 자동 선택하지 않고 🟡 추정 또는 ⚪ 미확인으로 둔다. DB 저장은 사용자가 [확인] 을 누른 뒤에만.
 * 순수 함수 — now 를 주입해 테스트한다.
 */
import type { EvidenceStatus, Headcount, Industry, Interest, TradeType } from '../types/domain'
import { headcountBand } from './profile'
import { normalizePhoneText, parseCount } from './docParser/korean'

export interface VoiceField<T> {
  value: T | null
  status: EvidenceStatus
  /** 어느 말에서 읽었나 */
  text: string
}

export interface VoiceDraft {
  transcript: string
  companyName: VoiceField<string>
  representativeName: VoiceField<string>
  phone: VoiceField<string>
  headcount: VoiceField<Headcount>
  headcountNumber: number | null
  industry: VoiceField<Industry>
  tradeType: VoiceField<TradeType>
  meetingAt: VoiceField<string>
  interests: VoiceField<Interest[]>
}

const unknown = <T,>(): VoiceField<T> => ({ value: null, status: 'unknown', text: '' })
const f = <T,>(value: T, status: EvidenceStatus, text: string): VoiceField<T> => ({ value, status, text })

const COMPANY_SUFFIX = /([가-힣A-Za-z0-9&]+(?:산업|상사|테크|텍|물류|건설|식품|유통|제조|공업|시스템|솔루션|전자|기공|정밀|제약|바이오|랩|컴퍼니|스토어|병원|의원|치과|한의원|학원|카페|정비|엔지니어링|디자인|미디어|플랫폼|기업|무역|기계|금속|화학|섬유|인터내셔널|코리아|네트웍스|네트워크|소프트|파트너스|홀딩스|그룹|F&B|푸드|베이커리|헬스케어|클리닉|약국|공방|스튜디오))/

const INDUSTRY_WORDS: [Industry, RegExp][] = [
  ['manufacturing', /제조|공장|생산|가공|금형|사출|부품/],
  ['distribution', /유통|도매|도소매|납품업|무역/],
  ['construction', /건설|시공|인테리어|건축|토목/],
  ['food', /외식|식당|음식점|카페|프랜차이즈|요식|베이커리|급식/],
  ['logistics', /물류|운송|배송|택배|창고/],
  ['medical', /병원|의원|치과|한의원|의료|피부과|헬스|웰니스|요양/],
  ['environment', /환경|폐기물|수거|재활용|방역/],
  ['service', /서비스|학원|교육|미용|컨설팅|디자인|소프트웨어|IT|아이티|광고|마케팅/],
]

const INTEREST_WORDS: [Interest, RegExp][] = [
  ['policy_fund', /정책자금|정책 자금|자금\s*(?:조달|필요|관심)|대출/],
  ['gov_support', /정부지원|정부 지원|지원사업|지원 사업|바우처/],
  ['efficiency', /업무\s*효율|효율|자동화|반복\s*(?:업무|입력)|일손/],
  ['customer', /고객\s*관리|거래처\s*관리|CRM|씨알엠/],
  ['sales', /매출|영업\s*(?:확대|늘)/],
  ['rnd', /연구소|R&D|알앤디|연구개발|연구 개발/],
  ['venture', /벤처/],
]

const HOUR_WORDS: [RegExp, number][] = [
  [/열두/, 12],
  [/열한/, 11],
  [/열/, 10],
  [/아홉/, 9],
  [/여덟/, 8],
  [/일곱/, 7],
  [/여섯/, 6],
  [/다섯/, 5],
  [/네/, 4],
  [/세/, 3],
  [/두/, 2],
  [/한/, 1],
]

function hourOf(word: string): number | null {
  if (/^\d{1,2}$/.test(word)) return Number(word)
  for (const [re, h] of HOUR_WORDS) if (re.test(word)) return h
  return null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 미팅 일시 — 오늘/내일/모레 + 오전/오후 + N시 (반/분). 오전·오후가 없고 1~6시면 오후로 추정 */
export function parseMeetingTime(text: string, now: Date): VoiceField<string> {
  if (/지금\s*(바로)?\s*(미팅|만나|시작)/.test(text) || /^지금\b/.test(text.trim())) return f(now.toISOString(), 'confirmed', '지금')
  const m = text.match(/(오늘|내일|모레|글피)?\s*(오전|오후|아침|저녁|낮|밤)?\s*(\d{1,2}|열두|열한|열|아홉|여덟|일곱|여섯|다섯|네|세|두|한)\s*시\s*(반|(\d{1,2})\s*분)?/)
  if (!m) return unknown()
  const [, dayWord, meridiem, hourWord, halfOrMin, minutes] = m
  let hour = hourOf(hourWord)
  if (hour === null || hour > 24) return unknown()
  let status: EvidenceStatus = 'confirmed'
  if (meridiem === '오후' || meridiem === '저녁' || meridiem === '밤' || meridiem === '낮') {
    if (hour < 12) hour += 12
  } else if (!meridiem) {
    if (hour >= 1 && hour <= 6) {
      hour += 12
      status = 'assumed'
    }
  }
  const min = halfOrMin === '반' ? 30 : minutes ? Number(minutes) : 0
  const base = startOfDay(now)
  const addDays = dayWord === '내일' ? 1 : dayWord === '모레' ? 2 : dayWord === '글피' ? 3 : 0
  if (!dayWord) status = 'assumed'
  base.setDate(base.getDate() + addDays)
  base.setHours(hour, min, 0, 0)
  return f(base.toISOString(), status, m[0].trim())
}

export function parseVoiceIntake(transcript: string, now: Date = new Date()): VoiceDraft {
  const t = transcript.replace(/\s+/g, ' ').trim()
  const draft: VoiceDraft = {
    transcript: t,
    companyName: unknown(),
    representativeName: unknown(),
    phone: unknown(),
    headcount: unknown(),
    headcountNumber: null,
    industry: unknown(),
    tradeType: unknown(),
    meetingAt: unknown(),
    interests: unknown(),
  }

  // 대표자 — "김철수 대표(님)" / "박영희 사장님" / "이 원장"
  const rep = t.match(/([가-힣]{2,4})\s*(대표님|대표이사|대표|사장님|사장|원장님|원장|이사님|이사)(?!\s*번호)/)
  if (rep && !/^(주식회사|우리|저희|그|이|저|미팅)$/.test(rep[1])) draft.representativeName = f(rep[1], 'confirmed', rep[0])

  // 회사명 — 접미사가 분명하면 확정, 아니면 "대표" 앞 어절을 추정
  const suffix = t.match(COMPANY_SUFFIX)
  if (suffix) draft.companyName = f(suffix[1].replace(/^(?:주식회사|㈜)/, ''), 'confirmed', suffix[0])
  else if (rep) {
    const before = t.slice(0, t.indexOf(rep[0])).trim().split(' ').filter(Boolean)
    const cand = before[before.length - 1]?.replace(/[,.]/g, '')
    if (cand && cand.length >= 2 && !/(오늘|내일|미팅|저희|우리|그리고)/.test(cand)) draft.companyName = f(cand, 'assumed', cand)
  }

  // 연락처 — 숫자·한글 숫자 읽기
  const phoneCtx = t.match(/(?:연락처|전화|번호|폰|핸드폰|휴대폰)?\s*((?:[0-9영공일이삼사오육륙칠팔구][\s\-.]*){9,13})/)
  if (phoneCtx) {
    const p = normalizePhoneText(phoneCtx[1])
    if (p) draft.phone = f(p, 'confirmed', phoneCtx[1].trim())
  }

  // 인원 — "직원은 열다섯 명 정도" / "직원 15명" / "인원은 스무 명"
  const hc = t.match(/(?:직원|인원|종업원|사람|식구)(?:은|는|이|가|수는|수가|\s)?\s*(?:한|약|대략|한\s*)?\s*([\d,]+|[가-힣]{1,4})\s*(?:명|분|사람)/)
  if (hc) {
    const n = parseCount(hc[1])
    if (n !== null && n > 0) {
      draft.headcountNumber = n
      const band = headcountBand(n)
      if (band) draft.headcount = f(band, /정도|쯤|약|대략/.test(hc[0] + t.slice(t.indexOf(hc[0]) + hc[0].length, t.indexOf(hc[0]) + hc[0].length + 4)) ? 'assumed' : 'confirmed', hc[0].trim())
    }
  }

  // 업종
  for (const [ind, re] of INDUSTRY_WORDS) {
    const m = t.match(re)
    if (m) {
      draft.industry = f(ind, 'confirmed', m[0])
      break
    }
  }

  // 거래형태
  const b2b = /B2B|비투비|기업\s*(?:대상|상대|고객)|거래처|납품|도매/i.test(t)
  const b2c = /B2C|비투씨|소비자|일반\s*고객|손님|매장|소매/i.test(t)
  if (b2b && b2c) draft.tradeType = f('both', 'confirmed', 'B2B + B2C')
  else if (b2b) draft.tradeType = f('b2b', 'confirmed', 'B2B')
  else if (b2c) draft.tradeType = f('b2c', 'confirmed', 'B2C')

  // 미팅 일시
  draft.meetingAt = parseMeetingTime(t, now)

  // 관심사
  const ints: Interest[] = []
  for (const [k, re] of INTEREST_WORDS) if (re.test(t) && !ints.includes(k)) ints.push(k)
  if (ints.length) draft.interests = f(ints, 'confirmed', ints.join(','))

  return draft
}

/** 초안에서 값이 잡힌 항목 수 (확인 화면 안내용) */
export function countFilled(d: VoiceDraft): number {
  return [d.companyName, d.representativeName, d.phone, d.headcount, d.industry, d.tradeType, d.meetingAt, d.interests].filter((x) => x.value !== null).length
}
