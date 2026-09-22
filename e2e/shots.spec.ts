/**
 * 보고용 화면 캡처 — 실제 뷰포트 크기 그대로 찍는다(fullPage 아님).
 * fullPage 캡처는 하단 고정 CTA·바텀 내비게이션을 페이지 중간에 그려 실제와 다르게 보이므로,
 * "한 화면에 무엇이 보이는가" 를 확인할 때는 뷰포트 캡처가 정확하다.
 */
import { expect, test, type Page } from '@playwright/test'
import { SHOTS, answerAll } from './helpers'

const FIXTURE = 'e2e/fixtures/sample-company-report.pdf'

async function shot(page: Page, tag: string, name: string) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/${tag}-view-${name}.png` })
}

test('한 화면에 보이는 것 — 가져오기 → PDF 검토 → 전략 → LIVE → 결과', async ({ page }, testInfo) => {
  const tag = testInfo.project.name
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await shot(page, tag, '01-home')

  await page.getByTestId('cta-new-company').click()
  await expect(page.getByTestId('intake-pdf')).toBeVisible()
  await shot(page, tag, '02-intake')

  await page.getByTestId('intake-pdf').click()
  await page.getByTestId('pdf-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('pdf-review')).toBeVisible({ timeout: 45_000 })
  await shot(page, tag, '03-pdf-review-top')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await shot(page, tag, '03b-pdf-review-bottom')

  await page.getByTestId('pdf-confirm').click()
  await expect(page.getByTestId('strategy-title')).toBeVisible()
  await shot(page, tag, '04-strategy-top')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await shot(page, tag, '04b-strategy-bottom')
  await page.evaluate(() => window.scrollTo(0, 0))

  await page.getByTestId('start-meeting').click()
  await expect(page).toHaveURL(/\/live$/)
  await shot(page, tag, '05-live')

  await answerAll(page)
  await page.getByTestId('key-quote').fill('내가 하루만 빠져도 직원들이 계속 전화해요.')
  await page.getByTestId('end-meeting').click()
  await expect(page).toHaveURL(/\/result$/)
  await shot(page, tag, '06-result-first-frame')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await shot(page, tag, '06b-result-bottom')
})
