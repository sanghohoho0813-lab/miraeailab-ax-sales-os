import { describe, expect, it } from 'vitest'
import { countFilled, parseMeetingTime, parseVoiceIntake } from './voiceIntake'

const NOW = new Date(2026, 8, 22, 9, 15) // 2026-09-22 09:15 local

describe('voice intake parser', () => {
  it('한 번에 입력 — 회사·대표·시각·인원·업종', () => {
    const d = parseVoiceIntake('ABC산업 김철수 대표, 오늘 오후 세시 미팅이고 직원은 열다섯 명 정도, 제조업입니다.', NOW)
    expect(d.companyName).toMatchObject({ value: 'ABC산업', status: 'confirmed' })
    expect(d.representativeName).toMatchObject({ value: '김철수', status: 'confirmed' })
    expect(d.headcountNumber).toBe(15)
    expect(d.headcount.value).toBe('11-20')
    expect(d.headcount.status).toBe('assumed') // "정도"
    expect(d.industry).toMatchObject({ value: 'manufacturing', status: 'confirmed' })
    const at = new Date(d.meetingAt.value!)
    expect([at.getHours(), at.getMinutes(), at.getDate()]).toEqual([15, 0, 22])
    expect(d.meetingAt.status).toBe('confirmed')
    expect(countFilled(d)).toBe(5)
  })
  it('전화번호 — 숫자·한글 읽기 모두', () => {
    expect(parseVoiceIntake('연락처는 010 1234 5678 입니다', NOW).phone.value).toBe('010-1234-5678')
    expect(parseVoiceIntake('번호 공일공 구팔칠육 오사삼이', NOW).phone.value).toBe('010-9876-5432')
    expect(parseVoiceIntake('직원 다섯 명', NOW).phone.value).toBeNull()
  })
  it('시각 — 내일 오전 열시 반 / 오전·오후 없는 3시는 오후로 추정 / 지금', () => {
    const a = parseMeetingTime('내일 오전 열시 반에 미팅', NOW)
    const ad = new Date(a.value!)
    expect([ad.getDate(), ad.getHours(), ad.getMinutes()]).toEqual([23, 10, 30])
    expect(a.status).toBe('confirmed')
    const b = parseMeetingTime('오늘 3시에 봅니다', NOW)
    expect(new Date(b.value!).getHours()).toBe(15)
    expect(b.status).toBe('assumed')
    const c = parseMeetingTime('지금 미팅 시작', NOW)
    expect(c.value).toBe(NOW.toISOString())
    expect(parseMeetingTime('시간은 나중에', NOW).value).toBeNull()
  })
  it('확신이 없으면 비워 둔다 — 회사 접미사가 없으면 추정, 아무 정보 없으면 미확인', () => {
    const d = parseVoiceIntake('한빛 박영희 사장님, 유통이고 B2B 거래처 위주', NOW)
    expect(d.companyName).toMatchObject({ value: '한빛', status: 'assumed' })
    expect(d.representativeName.value).toBe('박영희')
    expect(d.industry.value).toBe('distribution')
    expect(d.tradeType.value).toBe('b2b')
    const e = parseVoiceIntake('음 그러니까 내일 봐요', NOW)
    expect(e.companyName.status).toBe('unknown')
    expect(e.headcount.status).toBe('unknown')
    expect(countFilled(e)).toBe(0)
  })
  it('관심사 — 연구소 얘기가 나와도 R&D 관심으로 켜지 않는다', () => {
    const d = parseVoiceIntake('정책자금이랑 연구소 관심 있으시고 자동화 원하세요', NOW)
    expect(d.interests.value).toEqual(expect.arrayContaining(['policy_fund', 'efficiency']))
    expect(d.interests.value).not.toContain('rnd')
  })
})
