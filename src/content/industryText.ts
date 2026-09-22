/**
 * 업종 표기 정리 — 화면(Display Layer)에서만 쓴다.
 *
 * 크레탑·기업정보 PDF의 업종은 "(10차) (G46593) 정밀기기및과학기기도매업" 처럼 온다.
 * 분류 차수와 표준산업분류 코드는 컨설턴트가 미팅 직전에 볼 정보가 아니다 — 근거(추출정보 전체보기)에는 그대로 남기고
 * 요약 화면에서만 감춘다. 원본 값(facts.subIndustry, company.industryNote)은 절대 고치지 않는다.
 *
 * 띄어쓰기는 "무리한 자동 교정" 을 하지 않는다. 규칙은 둘뿐이다.
 *   1) 붙어 있는 "및" 을 띄운다
 *   2) 어절 끝에 붙은 업종 접미어(도매업·제조업 …)만 떼어 읽기 쉽게 한다
 * 나머지는 원문 그대로 둔다. 잘못 띄우는 것보다 붙어 있는 편이 낫다.
 */

/** "(10차)" "(제10차)" "(G46593)" "(C28)" 같은 분류 표기 */
const CLASSIFICATION = /\(\s*(?:제?\s*\d{1,2}\s*차|[A-U]?\d{2,6})\s*\)/g

/** 긴 것부터 — "도소매업" 이 "소매업" 보다 먼저 걸려야 한다 */
const SUFFIX = ['도소매업', '도매업', '소매업', '서비스업', '제조업', '판매업', '건설업', '운송업', '임대업', '중개업', '수리업', '가공업', '유통업', '공사업', '대리업', '도급업']

/** 어절 끝 업종 접미어를 한 칸 띄운다. 앞부분이 너무 짧으면(예: "도매업") 그대로 둔다 */
function spaceSuffix(word: string): string {
  for (const suf of SUFFIX) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) return `${word.slice(0, -suf.length)} ${suf}`
  }
  return word
}

/** 화면에 보여 줄 업종 문자열. 값이 없으면 빈 문자열(호출부에서 "미확인" 으로 표시) */
export function displayIndustry(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw.replace(CLASSIFICATION, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned
    .replace(/([가-힣])및([가-힣])/g, '$1 및 $2')
    .split(' ')
    .map(spaceSuffix)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
