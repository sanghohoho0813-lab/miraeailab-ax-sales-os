/**
 * 화면을 옮길 때 항상 맨 위에서 시작하는가.
 *
 * 실제 스크롤 주인은 문서(documentElement)다 — AppShell 은 overflow 컨테이너를 쓰지 않는다.
 * 그래서 window.scrollY 와 documentElement.scrollTop 을 함께 확인한다.
 * 분석 결과 화면은 LIVE 에서 한참 내려둔 상태로 넘어오기 때문에 가장 중요한 검증 대상이다.
 */
import { expect, test, type Page } from '@playwright/test'
import { SHOTS, answerAll, prepareCompany } from './helpers'

async function loginPartner(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await expect(page).toHaveURL(/\/$/)
}

/** 실제 스크롤 주인의 현재 위치 */
async function scrollPos(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop))
}

/**
 * URL 이 바뀐 직후에는 React 가 아직 커밋하기 전일 수 있다(Playwright 가 더 빠르다).
 * 스크롤 초기화는 useLayoutEffect 에서 일어나므로 화면에 그려지기 전에 끝나지만,
 * 테스트에서는 커밋을 기다렸다가 확인한다.
 */
async function expectTop(page: Page, where: string) {
  await expect.poll(() => scrollPos(page), { message: where, timeout: 3000 }).toBe(0)
}

/** 스크롤할 수 있을 만큼 내려 둔다 (내용이 짧으면 0 그대로) */
async function scrollToBottom(page: Page): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(150)
  return scrollPos(page)
}

test.describe('화면 이동 스크롤', () => {
  test('LIVE 에서 아래까지 내린 뒤 마무리해도 분석 결과는 맨 위에서 시작한다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '스크롤테스트')
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await answerAll(page)
    await page.getByTestId('key-quote').fill('내가 하루만 빠져도 직원들이 계속 전화해요.')
    // 마무리 화면에서 끝까지 내린다
    const before = await scrollToBottom(page)
    expect(before, 'LIVE 마무리 화면이 스크롤되어 있어야 의미 있는 검증이다').toBeGreaterThan(0)
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)
    // 첫 화면부터 최상단 — 제목이 보이는 자리에 있다
    await expectTop(page, 'LIVE → 결과')
    await expect(page.getByTestId('result-title')).toBeInViewport()
    await page.screenshot({ path: `${SHOTS}/${tag}-result-first-frame.png` })
    // 핵심 3개 · 추천 범위 · 전달 CTA 가 첫 화면 순서대로 있다
    await expect(page.getByTestId('result-title')).toContainText('미팅 분석 완료')
    await expect(page.getByText('추천 범위')).toBeVisible()
    await expect(page.getByTestId('handoff-cta')).toBeVisible()
    // 상세 분석은 접혀 있다
    await expect(page.getByTestId('analysis-detail')).toHaveCount(0)
  })

  test('다른 화면 이동도 최상단에서 시작한다 — 전략→LIVE, 결과→전달, 사례→상세', async ({ page }) => {
    await loginPartner(page)
    await prepareCompany(page, '스크롤회귀')
    // 전략 → LIVE
    await scrollToBottom(page)
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await expectTop(page, '전략 → LIVE')
    await answerAll(page)
    await page.getByTestId('key-quote').fill('확인 전화가 하루에도 여러 번 옵니다.')
    await scrollToBottom(page)
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)
    await expectTop(page, 'LIVE → 결과')
    // 결과 → 전달
    await scrollToBottom(page)
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toBeVisible()
    await scrollToBottom(page)
    await page.getByTestId('handoff-link').click()
    await expect(page).toHaveURL(/\/handoffs\//)
    await expectTop(page, '결과 → 전달')
    // 사례 목록 → 사례 상세
    await page.goto('/cases')
    await scrollToBottom(page)
    await page.getByTestId('case-row').first().getByRole('link', { name: '사례 보기' }).click()
    await expect(page).toHaveURL(/\/cases\/[^/]+/)
    await expectTop(page, '사례 → 상세')
    // 고객 목록 → 고객 상세
    await page.goto('/companies')
    await scrollToBottom(page)
    await page.getByTestId('company-row').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/\/companies\/[^/]+$/)
    await expectTop(page, '고객 → 전략')
  })

  test('뒤로가기는 원래 보던 위치를 지키지만, 분석 결과만은 맨 위에서 시작한다', async ({ page }) => {
    await loginPartner(page)
    await prepareCompany(page, '뒤로가기테스트')
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await answerAll(page)
    await page.getByTestId('key-quote').fill('견적을 매번 다시 계산합니다.')
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)
    // 상세를 펼쳐 확실히 스크롤되는 상태로 만든 뒤, 다른 화면에 갔다가 뒤로 돌아온다
    await expect(page.getByTestId('result-title')).toBeVisible()
    await page.getByTestId('toggle-detail').click()
    await expect(page.getByTestId('analysis-detail')).toBeVisible()
    const scrolled = await scrollToBottom(page)
    expect(scrolled, '상세를 펼치면 결과 화면은 스크롤된다').toBeGreaterThan(0)
    await page.goto('/cases')
    await page.goBack()
    await expect(page).toHaveURL(/\/result$/)
    await expectTop(page, '결과는 뒤로 와도 맨 위')
  })
})
