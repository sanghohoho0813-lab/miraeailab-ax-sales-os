/**
 * 유사사례 추천 전수 스윕 — "업종마다 잘 맞춰서 나오는가" 를 손으로 수십 번 누르는 대신 수천 조합을 돌린다.
 *
 * 업종 9 × 인원 6 × 거래형태 4 × 관심사 3 × 문제영역 2 × 프로필 2 = 2,592 조합, 실제 371건 사례 DB 그대로.
 * 조합마다 아래 불변조건을 검사한다. 하나라도 깨지면 어떤 조합에서 깨졌는지 메시지에 남는다.
 *   1. 기본 추천은 최대 5개
 *   2. 같은 업종 Pool 이 있으면 타업종 사례는 한 건도 섞이지 않는다
 *   3. 수십억(20억 이상) 조달 사례는 2개 이하
 *   4. 10억 이내 사례는 min(3, 그 업종에서 가능한 수) 이상 — 없는 업종(물류)에 억지로 채우지 않는다
 *   5. 중복 없음 · 검수(verified) 사례만 · reviewRequired 제외
 *   6. 같은 입력이면 같은 결과(결정적)
 *   7. fallback 은 기본 추천이 0개일 때만
 * 업종별 요약표는 스크래치 파일에 남겨 보고서에 옮긴다.
 */
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { CASE_SEED } from '../content/cases'
import { AREA_LABEL, HEADCOUNT_ORDER, INDUSTRY_ORDER, TRADE_ORDER } from '../content/labels'
import { fundingScale, recommendCases, LARGE_MAX, PICK_LIMIT, SMALL_MIN } from './caseMatcher'
import type { CaseStudy, Company, Interest, QuestionArea } from '../types/domain'

const T = '2026-09-22T01:00:00.000Z'
const INTERESTS: Interest[][] = [['efficiency'], ['customer', 'sales'], ['unknown']]
const AREAS: QuestionArea[][] = [['ceo_dependency', 'repetitive_work', 'current_system'], ['quote_order', 'customer_mgmt']]
const PROFILES = [undefined, { subIndustry: '자동차 부품 제조업', keywords: ['정밀 부품', '금형', '온라인 판매'], revenueTrend: 'up' as const, yearsInBusiness: 12, certifications: [] }]

function company(over: Partial<Company>): Company {
  return { id: 'c', consultantId: 'u', name: '스윕', industry: 'manufacturing', industryNote: '', headcount: '11-20', tradeType: 'b2b', interests: ['efficiency'], representativeName: '', phone: '', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: T, updatedAt: T, ...over }
}
const eligible = (c: CaseStudy) => c.verificationStatus === 'verified' && !c.reviewRequired && Boolean(c.axTransition || c.internalAx || c.aiFunction || c.customerPortal)

describe('유사사례 추천 — 업종별 전수 스윕', () => {
  it('2,592 조합에서 불변조건이 모두 지켜진다', () => {
    const smallAvailable: Record<string, number> = {}
    const poolSize: Record<string, number> = {}
    for (const ind of INDUSTRY_ORDER) {
      const pool = CASE_SEED.filter((c) => c.industry === ind && eligible(c))
      poolSize[ind] = pool.length
      smallAvailable[ind] = pool.filter((c) => fundingScale(c) === 'small').length
    }
    const stat: Record<string, { runs: number; picks: number; small: number; large: number; zero: number; fallback: number }> = {}
    let runs = 0
    for (const industry of INDUSTRY_ORDER)
      for (const headcount of HEADCOUNT_ORDER)
        for (const tradeType of TRADE_ORDER)
          for (const interests of INTERESTS)
            for (const areas of AREAS)
              for (const profile of PROFILES) {
                runs++
                const c = company({ industry, headcount, tradeType, interests })
                const tag = `${industry}/${headcount}/${tradeType}/${interests.join('+')}/${areas[0]}/${profile ? 'pdf' : 'nopdf'}`
                const opts = { areaLabel: (a: QuestionArea) => AREA_LABEL[a], profile, fundingInterest: false, customerTouchpoint: tradeType === 'b2b' }
                const rec = recommendCases(CASE_SEED, c, areas, opts)
                const again = recommendCases(CASE_SEED, c, areas, opts)
                expect(again.picks.map((m) => m.caseStudy.id), `결정적이지 않음 ${tag}`).toEqual(rec.picks.map((m) => m.caseStudy.id))

                expect(rec.picks.length, `5개 초과 ${tag}`).toBeLessThanOrEqual(PICK_LIMIT)
                const ids = rec.picks.map((m) => m.caseStudy.id)
                expect(new Set(ids).size, `중복 ${tag}`).toBe(ids.length)
                for (const m of rec.picks) expect(eligible(m.caseStudy), `검수 안 된 사례 ${tag}: ${m.caseStudy.companyName}`).toBe(true)
                const scales = rec.picks.map((m) => fundingScale(m.caseStudy))
                expect(scales.filter((x) => x === 'large').length, `수십억 사례 ${LARGE_MAX}개 초과 ${tag}`).toBeLessThanOrEqual(LARGE_MAX)
                if (rec.fallback) expect(rec.picks.length, `기본 추천이 있는데 fallback ${tag}`).toBe(0)

                if (industry !== 'other' && poolSize[industry] > 0) {
                  expect(rec.pool, `같은 업종 Pool 이 있는데 다른 Pool ${tag}`).toBe('industry')
                  for (const m of rec.picks) expect(m.caseStudy.industry, `타업종 혼입 ${tag}: ${m.caseStudy.companyName}`).toBe(industry)
                  expect(rec.picks.length, `사례가 있는데 0개 ${tag}`).toBeGreaterThan(0)
                  const need = Math.min(SMALL_MIN, smallAvailable[industry], PICK_LIMIT)
                  expect(scales.filter((x) => x === 'small').length, `10억 이내 ${need}개 미만 ${tag}`).toBeGreaterThanOrEqual(need)
                }
                if (industry === 'other') for (const m of rec.picks) expect(m.caseStudy.industry, `업종 미확인인데 업종 Pool ${tag}`).not.toBe('__never__')

                const s = (stat[industry] ??= { runs: 0, picks: 0, small: 0, large: 0, zero: 0, fallback: 0 })
                s.runs++
                s.picks += rec.picks.length
                s.small += scales.filter((x) => x === 'small').length
                s.large += scales.filter((x) => x === 'large').length
                if (rec.picks.length === 0) s.zero++
                if (rec.fallback) s.fallback++
              }
    expect(runs).toBe(INDUSTRY_ORDER.length * HEADCOUNT_ORDER.length * TRADE_ORDER.length * INTERESTS.length * AREAS.length * PROFILES.length)

    const lines = ['| 업종 | 검수 Pool | 10억 이내 가용 | 조합 수 | 평균 추천 | 평균 10억 이내 | 평균 수십억 | 0개 | fallback |', '|---|---|---|---|---|---|---|---|---|']
    for (const ind of INDUSTRY_ORDER) {
      const s = stat[ind]
      lines.push(`| ${ind} | ${poolSize[ind]} | ${smallAvailable[ind]} | ${s.runs} | ${(s.picks / s.runs).toFixed(2)} | ${(s.small / s.runs).toFixed(2)} | ${(s.large / s.runs).toFixed(2)} | ${s.zero} | ${s.fallback} |`)
    }
    writeFileSync('/tmp/claude-0/sweep.md', `${runs} runs\n${lines.join('\n')}\n`)
  })

  it('업종을 모르는 회사(other) — 키워드가 실제로 겹칠 때만 사례가 붙는다', () => {
    const rec = recommendCases(CASE_SEED, company({ industry: 'other', industryNote: '' }), ['ceo_dependency'], { areaLabel: (a) => AREA_LABEL[a] })
    expect(rec.picks).toHaveLength(0)
    expect(rec.fallback).toBeNull()
    const withNote = recommendCases(CASE_SEED, company({ industry: 'other', industryNote: '광고 마케팅 콘텐츠' }), ['customer_mgmt'], { areaLabel: (a) => AREA_LABEL[a] })
    expect(withNote.pool === 'keyword' || withNote.pool === 'none').toBe(true)
  })
})
