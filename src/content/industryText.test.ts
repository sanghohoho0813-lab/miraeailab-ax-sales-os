import { describe, expect, it } from 'vitest'
import { displayIndustry } from './industryText'

describe('업종 표기 정리', () => {
  it('분류 차수와 표준산업분류 코드를 화면에서 감춘다', () => {
    expect(displayIndustry('(10차) (G46593) 정밀기기및과학기기도매업')).toBe('정밀기기 및 과학기기 도매업')
    expect(displayIndustry('자동차 부품 제조업 (C30320)')).toBe('자동차 부품 제조업')
    expect(displayIndustry('(제11차) 소프트웨어 개발')).toBe('소프트웨어 개발')
  })

  it('붙어 있는 "및" 과 어절 끝 업종 접미어만 띄운다 — 나머지는 원문 그대로', () => {
    expect(displayIndustry('전자부품제조업')).toBe('전자부품 제조업')
    expect(displayIndustry('도매업')).toBe('도매업')
    expect(displayIndustry('자동차부품도소매업')).toBe('자동차부품 도소매업')
    // 억지로 띄우지 않는다
    expect(displayIndustry('한식 음식점업')).toBe('한식 음식점업')
    expect(displayIndustry('경영컨설팅')).toBe('경영컨설팅')
  })

  it('값이 없으면 빈 문자열 — 화면에서 "미확인" 으로 보여 주기 위해서다', () => {
    expect(displayIndustry(null)).toBe('')
    expect(displayIndustry('')).toBe('')
    expect(displayIndustry('(10차)')).toBe('')
  })
})
