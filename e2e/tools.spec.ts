/**
 * 고객 도구 — 서류 미비 표시 · 명부 업로드 → 고용지원금 검토 · 정책자금 기관.
 * 가장 중요한 검증: 4대보험 명부를 올려도 **주민번호가 화면에도 저장소에도 남지 않는다.**
 */
import { expect, test, type Page } from '@playwright/test'
import { SHOTS, prepareCompany } from './helpers'

const ROSTER = 'e2e/fixtures/insurance-roster.pdf'
const REPORT = 'e2e/fixtures/sample-company-report.pdf'
const RESIDENT = /\d{6}\s*-\s*[1-8]\d{6}/

async function loginPartner(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await expect(page).toHaveURL(/\/$/)
}
const docRow = (page: Page, key: string) => page.locator(`[data-testid="doc-row"][data-key="${key}"]`)

test.describe('기업분석 도구', () => {
  test('서류가 없으면 눈에 띄게 알려 주고, 도구를 막지는 않는다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '도구테스트')
    // 미팅 전략 화면에서도 서류 미비가 보인다
    const entry = page.getByTestId('tools-entry')
    await expect(entry).toBeVisible()
    await expect(entry).toContainText('서류')
    await entry.click()
    await expect(page).toHaveURL(/\/tools$/)

    // 미비 배너 + 서류 5줄
    await expect(page.getByTestId('missing-banner')).toBeVisible()
    await expect(page.getByTestId('doc-row')).toHaveCount(5)
    await expect(docRow(page, 'insurance_roster')).toHaveAttribute('data-have', 'false')
    await expect(docRow(page, 'insurance_roster')).toContainText('집계만 저장')
    await page.screenshot({ path: `${SHOTS}/${tag}-tools-01-missing.png`, fullPage: true })

    // 도구 3개 — 서류가 없어도 화면에 있고, 무엇이 없는지 말한다
    await expect(page.getByTestId('tool-card')).toHaveCount(3)
    await expect(page.locator('[data-testid="tool-card"][data-tool="employment_subsidy"]')).toHaveAttribute('data-ready', 'false')
    // 정책자금은 서류 없이도 결과가 나온다
    await expect(page.locator('[data-testid="tool-card"][data-tool="policy_fund"]')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByTestId('fund-result')).toBeVisible()
    await expect(page.getByTestId('fund-cautions')).toContainText('신청 자격')
    // 화면에 조사 placeholder 가 없다
    expect(await page.locator('main').innerText()).not.toMatch(/이\(가\)|을\(를\)|은\(는\)/)
  })

  test('4대보험 명부를 올리면 집계가 붙고, 주민번호는 화면에도 저장소에도 없다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '명부테스트')
    const url = page.url()
    const id = url.split('/companies/')[1]

    await page.goto(`/companies/${id}/pdf`)
    await page.getByTestId('pdf-input').setInputFiles(ROSTER)
    await expect(page.getByTestId('pdf-review')).toBeVisible({ timeout: 45_000 })
    // 명부로 인식했고, 개인정보를 저장하지 않았다고 말한다
    await expect(page.getByTestId('pdf-review')).toContainText('4대보험 가입자 명부')
    await page.getByTestId('open-evidence').click()
    await expect(page.getByTestId('pdf-warnings')).toContainText('개인정보')
    await expect(page.getByTestId('evidence-sheet')).not.toContainText('900101')
    await page.keyboard.press('Escape')
    expect(await page.locator('body').innerText(), '검토 화면에 주민번호 노출').not.toMatch(RESIDENT)
    await page.getByTestId('merge-confirm').click()
    await expect(page.getByTestId('strategy-title')).toBeVisible()

    // 도구 화면 — 집계가 붙는다
    await page.goto(`/companies/${id}/tools`)
    await expect(docRow(page, 'insurance_roster')).toHaveAttribute('data-have', 'true')
    await expect(page.locator('[data-testid="tool-card"][data-tool="employment_subsidy"]')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByTestId('employment-headline')).toContainText('가입자 5명')
    expect(await page.getByTestId('subsidy-check').count()).toBeGreaterThan(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-tools-02-employment.png`, fullPage: true })
    // 금액을 지어내지 않는다
    const text = await page.getByTestId('employment-result').innerText()
    expect(text, '근거 없는 금액 노출').not.toMatch(/\d[\d,]*\s*(만\s*)?원/)
    expect(await page.locator('body').innerText(), '도구 화면에 주민번호 노출').not.toMatch(RESIDENT)

    // 저장소에도 남지 않는다
    const stored = await page.evaluate(() => localStorage.getItem('axpartner.profiles') ?? '')
    expect(stored, 'localStorage 에 주민번호 저장').not.toMatch(/\d{6}\s*-\s*[1-8]\d{6}/)
    for (const name of ['홍가상', '김가상', '최가상']) expect(stored, `localStorage 에 이름 저장: ${name}`).not.toContain(name)
  })

  test('기업정보 서류를 올리면 기업정보 분석이 채워진다', async ({ page }) => {
    await loginPartner(page)
    await prepareCompany(page, '기업정보테스트')
    const id = page.url().split('/companies/')[1]
    await page.goto(`/companies/${id}/pdf`)
    await page.getByTestId('pdf-input').setInputFiles(REPORT)
    await expect(page.getByTestId('pdf-review')).toBeVisible({ timeout: 45_000 })
    await page.getByTestId('merge-confirm').click()
    await expect(page.getByTestId('strategy-title')).toBeVisible()
    await page.goto(`/companies/${id}/tools`)
    await expect(docRow(page, 'company_report')).toHaveAttribute('data-have', 'true')
    await expect(page.locator('[data-testid="tool-section"][data-tool="company_report"]')).toContainText('읽었습니다')
    // 명부는 여전히 미비로 남는다
    await expect(page.getByTestId('missing-banner')).toContainText('4대보험')
  })
})
