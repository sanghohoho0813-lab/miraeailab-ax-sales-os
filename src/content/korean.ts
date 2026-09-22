/**
 * 한국어 조사 — 화면에 "이(가)" 같은 표기가 나오지 않게 한다.
 * 문장 구조를 단순하게 쓰는 것이 우선이고, 조사가 꼭 필요한 한두 군데에서만 이 함수를 쓴다.
 */

/** 마지막 글자에 받침이 있는가 (한글만 판정, 숫자·영문은 통용 표기를 따른다) */
export function hasFinalConsonant(word: string): boolean {
  const w = (word ?? '').trim().replace(/[)\]}"'’”]+$/, '')
  const ch = w.charCodeAt(w.length - 1)
  if (Number.isNaN(ch)) return false
  // 한글 음절
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 !== 0
  // 숫자 — 읽는 소리 기준 (0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 은 받침 있음)
  const last = w[w.length - 1]
  if (/\d/.test(last)) return ['0', '1', '3', '6', '7', '8'].includes(last)
  // 영문 — 한국어로 읽었을 때 받침이 남는 자음만 true (s·x·z·c·f·h 등은 '스/즈/크' 로 읽혀 받침이 없다)
  if (/[a-zA-Z]/.test(last)) return /[lmngkbpt]/i.test(last)
  return false
}

type Pair = '이/가' | '은/는' | '을/를' | '와/과' | '으로/로'

/** 단어에 맞는 조사 한 글자 (앞 단어는 붙이지 않는다) */
export function josa(word: string, pair: Pair): string {
  const has = hasFinalConsonant(word)
  switch (pair) {
    case '이/가':
      return has ? '이' : '가'
    case '은/는':
      return has ? '은' : '는'
    case '을/를':
      return has ? '을' : '를'
    case '와/과':
      return has ? '과' : '와'
    case '으로/로': {
      const w = (word ?? '').trim()
      const ch = w.charCodeAt(w.length - 1)
      // 'ㄹ' 받침은 '로'
      if (ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 === 8) return '로'
      return has ? '으로' : '로'
    }
  }
}

/** 단어 + 조사 */
export function withJosa(word: string, pair: Pair): string {
  return `${word}${josa(word, pair)}`
}

/** 두 개 이상을 "A와 B" 로 잇는다 (3개 이상이면 마지막만 와/과) */
export function joinWithWa(words: string[]): string {
  const list = words.filter(Boolean)
  if (list.length <= 1) return list[0] ?? ''
  const head = list.slice(0, -1)
  const tail = list[list.length - 1]
  return `${head.join(', ')}${josa(head[head.length - 1], '와/과')} ${tail}`
}
