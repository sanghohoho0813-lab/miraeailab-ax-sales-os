import { expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

export const SHOTS = 'e2e/screenshots'
mkdirSync(SHOTS, { recursive: true })

/** 준비 4단계 → 전략 화면. 회사명 + 연락처가 사전진단 픽스처(ABC산업)와 일치한다. */
export async function prepareCompany(page: Page, name = 'ABC산업', opts: { phone?: string; withDate?: boolean; shots?: string } = {}) {
  await page.getByTestId('cta-new-company').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/1 \/ 4/)
  await page.getByTestId('company-name').fill(name)
  if (opts.phone) await page.getByTestId('company-phone').fill(opts.phone)
  if (opts.withDate) {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 90)
    const pad = (n: number) => String(n).padStart(2, '0')
    await page.getByTestId('company-meeting-at').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
  }
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02a-prep-1.png`, fullPage: true })
  await page.getByTestId('prep-next').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/2 \/ 4/)
  await page.getByRole('radio', { name: '제조' }).click()
  await page.getByRole('radio', { name: '11~20명' }).click()
  await page.getByRole('radio', { name: 'B2B', exact: true }).click()
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02b-prep-2.png`, fullPage: true })
  await page.getByTestId('prep-next').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/3 \/ 4/)
  await page.getByRole('checkbox', { name: '업무효율' }).click()
  await page.getByRole('checkbox', { name: '정책자금' }).click()
  await page.getByTestId('prep-next').click()
  await expect(page.getByTestId('prep-progress')).toHaveText(/4 \/ 4/)
  if (opts.shots) await page.screenshot({ path: `${SHOTS}/${opts.shots}-02c-prep-4.png`, fullPage: true })
  await page.getByTestId('company-save').click()
  await expect(page.getByTestId('strategy-title')).toContainText(`${name}은 이렇게 접근하세요`)
}

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

