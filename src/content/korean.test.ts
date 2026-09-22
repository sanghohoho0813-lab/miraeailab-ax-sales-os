import { describe, expect, it } from 'vitest'
import { hasFinalConsonant, joinWithWa, josa, withJosa } from './korean'

describe('한국어 조사', () => {
  it('받침 판정', () => {
    expect(hasFinalConsonant('테스트정밀')).toBe(true)
    expect(hasFinalConsonant('미래')).toBe(false)
    expect(hasFinalConsonant('ABC산업')).toBe(true)
    expect(hasFinalConsonant('커피사피엔스')).toBe(false) // '스' 는 받침이 없다
    expect(hasFinalConsonant('갤로핑')).toBe(true)
    expect(hasFinalConsonant('디어니언')).toBe(true)
    expect(hasFinalConsonant('제트에이아이(blux)')).toBe(false)
  })
  it('조사 선택', () => {
    expect(josa('테스트정밀', '을/를')).toBe('을')
    expect(josa('미래', '을/를')).toBe('를')
    expect(josa('대표 의존도', '이/가')).toBe('가')
    expect(josa('견적', '이/가')).toBe('이')
    expect(josa('고객관리', '와/과')).toBe('와')
    expect(josa('반복입력', '와/과')).toBe('과')
    expect(josa('시스템', '으로/로')).toBe('으로')
    expect(josa('데이터', '으로/로')).toBe('로')
    expect(josa('엑셀', '으로/로')).toBe('로')
    expect(withJosa('업무', '은/는')).toBe('업무는')
  })
  it('여러 개를 와/과로 잇는다', () => {
    expect(joinWithWa(['대표 의존도', '고객관리 방식'])).toBe('대표 의존도와 고객관리 방식')
    expect(joinWithWa(['반복입력', '정보 분산'])).toBe('반복입력과 정보 분산')
    expect(joinWithWa(['대표 의존도'])).toBe('대표 의존도')
    expect(joinWithWa([])).toBe('')
  })
  it('화면 문구에 조사 placeholder 가 없다', () => {
    const sentence = `오늘은 AI 자체를 설명하기보다 ${joinWithWa(['대표 의존도', '견적·주문 흐름'])}부터 확인하세요.`
    expect(sentence).not.toMatch(/이\(가\)|을\(를\)|은\(는\)/)
    expect(sentence).toBe('오늘은 AI 자체를 설명하기보다 대표 의존도와 견적·주문 흐름부터 확인하세요.')
  })
})
