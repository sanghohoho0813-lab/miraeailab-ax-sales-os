/**
 * QA 스크린샷 — 390/430/768/1280/1440/1920 각 라우트 + 1440 PC+Mobile 듀얼 뷰.
 * 첫 테스트가 흐름을 한 번 돌려 상태(localStorage)를 만들고 storageState 로 저장한다.
 */
import { expect, test, type Browser } from '@playwright/test'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { answerAll, prepareCompany } from './helpers'

const OUT = 'e2e/screenshots/qa'
const STATE = 'e2e/.qa-state.json'
mkdirSync(OUT, { recursive: true })

test.describe.configure({ mode: 'serial' })

test('seed — 흐름을 돌려 상태를 만든다', async ({ page, context }) => {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await prepareCompany(page, 'ABC산업', { phone: '010-1234-5678', withDate: true })
  const companyId = page.url().split('/companies/')[1]
  await page.getByTestId('start-meeting').click()
  await expect(page).toHaveURL(/\/live$/)
  const meetingId = page.url().split('/meetings/')[1].replace('/live', '')
  await page.getByTestId('open-quote').click()
  await page.getByTestId('quote-input').fill('내가 하루만 빠져도 직원들이 계속 전화해요.')
  await page.getByRole('button', { name: '저장하고 계속' }).click()
  await answerAll(page)
  await page.getByTestId('end-meeting').click()
  await expect(page).toHaveURL(/\/result$/)
  await page.getByTestId('submit-handoff').click()
  await expect(page.getByTestId('handoff-success')).toBeVisible()
  const handoffId = await page.getByTestId('handoff-link').getAttribute('href').then((h) => h!.split('/handoffs/')[1])
  // 두 번째 회사(진행 중 상태) + 사례 id
  await page.goto('/')
  await prepareCompany(page, '테스트유통', { withDate: true })
  await page.getByTestId('start-meeting').click()
  await expect(page).toHaveURL(/\/live$/)
  const liveMeetingId = page.url().split('/meetings/')[1].replace('/live', '')
  await page.goto('/cases?tab=all')
  const caseHref = await page.getByTestId('case-row').first().getByRole('link', { name: '사례 보기' }).getAttribute('href')
  const caseId = caseHref!.split('/cases/')[1].split('?')[0]
  await page.evaluate((ids) => localStorage.setItem('axpartner.qa', JSON.stringify(ids)), { companyId, meetingId, handoffId, liveMeetingId, caseId })
  await context.storageState({ path: STATE })
})

const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
]

async function routes(browser: Browser, w: number, h: number, dual: boolean) {
  const context = await browser.newContext({ storageState: STATE, viewport: { width: w, height: h }, locale: 'ko-KR' })
  const page = await context.newPage()
  await page.goto('/')
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.qa') ?? '{}') as Record<string, string>)
  if (dual) await page.evaluate(() => localStorage.setItem('axpartner.deviceView', 'dual'))
  else await page.evaluate(() => localStorage.setItem('axpartner.deviceView', 'pc'))
  const list: [string, string][] = [
    ['home', '/'],
    ['new-meeting', '/companies/new'],
    ['strategy', `/companies/${ids.companyId}`],
    ['live', `/meetings/${ids.liveMeetingId}/live`],
    ['cases', '/cases'],
    ['case-detail', `/cases/${ids.caseId}?company=${ids.companyId}`],
    ['after', `/meetings/${ids.meetingId}/result`],
    ['handoff', `/handoffs/${ids.handoffId}`],
    ['playbook', '/playbook'],
    ['settings', '/settings'],
    ['meetings', '/meetings'],
  ]
  const tag = dual ? `dual-${w}` : `${w}`
  const overflows: string[] = []
  for (const [name, path] of list) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    if (dual) await expect(page.getByTestId('dual-view')).toBeVisible()
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: !dual })
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (over) overflows.push(name)
  }
  await context.close()
  return overflows
}

for (const v of VIEWPORTS) {
  test(`screens ${v.w}x${v.h}`, async ({ browser }) => {
    test.skip(!existsSync(STATE), 'seed 필요')
    const over = await routes(browser, v.w, v.h, false)
    expect(over, `가로 넘침: ${over.join(', ')}`).toEqual([])
  })
}
test('screens dual view 1440', async ({ browser }) => {
  test.skip(!existsSync(STATE), 'seed 필요')
  const over = await routes(browser, 1440, 900, true)
  expect(over, `가로 넘침: ${over.join(', ')}`).toEqual([])
})

test('hover — 버튼·카드·내비가 호버에서 변한다', async ({ browser }) => {
  test.skip(!existsSync(STATE), 'seed 필요')
  const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 }, hasTouch: false })
  const page = await context.newPage()
  await page.goto('/')
  const btn = page.getByTestId('cta-new-company')
  const before = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
  await btn.hover()
  await page.waitForTimeout(250)
  const after = await btn.evaluate((el) => `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).transform}`)
  expect(after).not.toBe(`${before}|none`)
  const nav = page.getByRole('link', { name: '실제 사례' }).first()
  const nb = await nav.evaluate((el) => getComputedStyle(el).backgroundColor)
  await nav.hover()
  await page.waitForTimeout(250)
  expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(nb)
  await page.screenshot({ path: `${OUT}/hover-nav.png` })
  await context.close()
  void readFileSync
})
