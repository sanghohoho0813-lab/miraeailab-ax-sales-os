/**
 * 개인정보 최소화 — 기업자료에 섞인 개인 식별정보는 구조화 저장 대상에서 제외한다.
 * 주민등록번호·외국인등록번호·운전면허·여권·계좌번호로 보이는 값은 원문 스니펫에서도 지운다.
 * DB(0006) 트리거가 같은 주민번호 패턴을 한 번 더 거부한다.
 */
export const RESIDENT_RE = /\d{6}\s*-\s*[1-8]\d{6}/g
const DRIVER_RE = /\d{2}-\d{2}-\d{6}-\d{2}/g
const PASSPORT_RE = /\b[A-Z]{1,2}\d{7,8}\b/g
/** 계좌번호 — "계좌" 라는 말 근처의 10~14자리 숫자(하이픈 포함) */
const ACCOUNT_RE = /(계좌\S*\s*[:：]?\s*)([\d-]{10,20})/g

export function containsResidentNumber(text: string): boolean {
  RESIDENT_RE.lastIndex = 0
  return RESIDENT_RE.test(text)
}

/** 저장 직전 최종 방어 — 주민번호가 남아 있으면 저장하지 않는다 */
export function assertNoResidentNumber(json: string): void {
  if (containsResidentNumber(json)) throw new Error('주민등록번호로 보이는 값은 저장할 수 없습니다. 해당 항목을 제외하고 다시 저장하세요.')
}

/** 원문 한 줄에서 개인 식별정보를 마스킹한다 */
export function scrubPii(text: string): string {
  return text
    .replace(RESIDENT_RE, '******-*******')
    .replace(DRIVER_RE, '**-**-******-**')
    .replace(ACCOUNT_RE, '$1**********')
    .replace(PASSPORT_RE, '********')
}

/** 이 줄은 통째로 버린다 (개인 주소·주민번호 줄) */
export function isPersonalLine(line: string): boolean {
  if (containsResidentNumber(line)) return true
  if (/(자택|집\s*주소|거주지|개인\s*주소)/.test(line)) return true
  if (/(계좌번호|예금주)/.test(line)) return true
  return false
}
