import { expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

export const SHOTS = 'e2e/screenshots'
mkdirSync(SHOTS, { recursive: true })

/** 미팅 준비 시작 → 가져오기 방법(30초 빠른 등록) → 3단계 → 전략 화면. 회사명 + 연락처가 사전진단 픽스처(ABC산업)와 일치한다. */
export async function prepareCompany(page: Page, name = 'ABC산업', opts: { phone?: string; withDate?: boolean; shots?: string } = {}) {
  await page.getByTestId('cta-new-company').click()
  await expect(page.getByTestId('intake-pdf')).toBeVisible()
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02-intake.png`, fullPage: true })
  await page.getByTestId('intake-quick').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/1 \/ 3/)
  await page.getByTestId('company-name').fill(name)
  if (opts.phone) await page.getByTestId('company-phone').fill(opts.phone)
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02a-prep-1.png`, fullPage: true })
  await page.getByTestId('prep-next').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/2 \/ 3/)
  await page.getByRole('radio', { name: '제조' }).click()
  await page.getByRole('radio', { name: '11~20명' }).click()
  await page.getByRole('radio', { name: 'B2B', exact: true }).click()
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02b-prep-2.png`, fullPage: true })
  await page.getByTestId('prep-next').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/3 \/ 3/)
  await page.getByRole('checkbox', { name: '업무효율' }).click()
  await page.getByRole('checkbox', { name: '정책자금' }).click()
  // 미팅 일시 — 기본 "오늘 · 지금"(실시간). withDate 면 +1시간 (오늘 예정으로 홈에 올라온다)
  await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'now')
  if (opts.withDate) {
    await page.getByTestId('time-plus-60').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'custom')
  }
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02c-prep-3.png`, fullPage: true })
  await page.getByTestId('company-save').click()
  await expect(page.getByTestId('strategy-title')).toContainText(name)
}

/** 브라우저 SpeechRecognition 을 흉내 낸다 — start() 하면 window.__voiceText 를 결과로 돌려준다 */
export const SPEECH_MOCK = `
  class FakeRecognition {
    constructor() { this.lang = 'ko-KR'; this.interimResults = false; this.continuous = false; this.onresult = null; this.onend = null; this.onerror = null }
    start() {
      const text = window.__voiceText || ''
      setTimeout(() => {
        if (this.onresult) this.onresult({ results: [[{ transcript: text }]] })
        if (this.onend) this.onend()
      }, 150)
    }
    stop() { if (this.onend) this.onend() }
  }
  window.SpeechRecognition = FakeRecognition
  window.webkitSpeechRecognition = FakeRecognition
`

/** LIVE — 적응형 질문에 큰 버튼으로 답하고(2번째는 건너뜀) 마무리 화면까지 */
export async function answerAll(page: Page) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('end-meeting').isVisible().catch(() => false)) break
    const radios = page.getByRole('radio')
    const n = await radios.count()
    if (n === 0) break
    if (i === 1) await page.getByTestId('skip').click()
    else await radios.nth(Math.min(2, n - 1)).click()
  }
  await expect(page.getByTestId('end-meeting')).toBeVisible()
}

