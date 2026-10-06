/**
 * 하루 업무 흐름 E2E — 컨설턴트가 매일 반복하는 동선이 끊기지 않는가.
 *   1) 중단된 미팅은 홈 "지금 할 일" 맨 위 → 한 번 눌러 이어서 진행
 *   2) 분석이 끝난 고객을 다시 열면 주 버튼이 "2차 제안 요청" — 새 미팅이 생기지 않는다. 요청하면 할 일에서 빠진다
 *   3) 일정이 지났는데 기록이 없는 미팅은 "지난 미팅" 으로 할 일에 올라온다
 *   4) 고객 찾기 — 대표자 이름 · 전화번호 뒷자리 · 상태 · 정렬. 고객을 열었다 돌아와도 보던 목록 그대로
 * 데스크톱(daily)과 폰(daily-mobile) 양쪽에서 돈다.
 */
import { expect, test, type Page } from '@playwright/test'
import { SHOTS, answerAll, prepareCompany } from './helpers'

async function loginPartner(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await expect(page).toHaveURL(/\/$/)
}

/** local 모드 저장소에서 회사의 미팅 일시만 바꾼다 — "며칠 전 미팅" 같은 시간 경과를 흉내 낸다 */
async function setMeetingAt(page: Page, name: string, meetingAt: string | null) {
  await page.evaluate(
    ([n, at]) => {
      const list = JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]') as { name: string; meetingAt: string | null }[]
      for (const c of list) if (c.name === n) c.meetingAt = at
      localStorage.setItem('axpartner.companies', JSON.stringify(list))
    },
    [name, meetingAt] as const,
  )
}
const meetingCount = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('axpartner.meetings') ?? '[]') as unknown[]).length)
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

test.describe('하루 업무 흐름', () => {
  test('중단된 미팅 → 홈에서 이어서 → 분석 완료 고객은 주 버튼이 2차 제안 요청 → 요청하면 할 일에서 빠진다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '이어하기상사')
    const companyPath = new URL(page.url()).pathname

    // 미팅을 시작해 한 문항만 답하고 자리를 뜬다
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await page.getByRole('radio').first().click()
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
    await page.goto('/')

    // 홈 — 중단된 미팅이 할 일 맨 위, 줄 전체가 이어서 진행으로 간다
    const first = page.getByTestId('todo-row').first()
    await expect(first).toHaveAttribute('data-stage', 'live')
    await expect(first).toContainText('이어하기상사')
    await expect(first.getByTestId('todo-action')).toContainText('이어서 진행')
    await expect(page.getByTestId('todo-count')).toHaveText('1건')
    await page.screenshot({ path: `${SHOTS}/${tag}-01-home-live.png`, fullPage: true })
    await first.click()
    await expect(page).toHaveURL(/\/live$/)

    // 마무리 → 분석
    await answerAll(page)
    await page.getByTestId('key-quote').fill('견적을 매번 엑셀로 다시 계산합니다.')
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)
    const meetings = await meetingCount(page)

    // 홈 — 분석은 끝났는데 2차 제안 요청을 안 보냈다 → 할 일
    await page.goto('/')
    await expect(page.getByTestId('todo-row').first()).toHaveAttribute('data-stage', 'analyzed')
    await expect(page.getByTestId('todo-row').first()).toContainText('2차 제안 요청을 아직 보내지 않았습니다')

    // 고객을 다시 열어도 주 버튼은 "미팅 시작" 이 아니라 2차 제안 요청이다
    await page.goto(companyPath)
    await expect(page.getByTestId('primary-action')).toHaveAttribute('data-stage', 'analyzed')
    await expect(page.getByTestId('next-reason')).toContainText('2차 제안 요청을 아직 보내지 않았습니다')
    await expect(page.getByTestId('next-action')).toContainText('2차 제안 요청')
    await page.screenshot({ path: `${SHOTS}/${tag}-02-company-analyzed.png`, fullPage: true })
    await page.getByTestId('next-action').click()
    await expect(page).toHaveURL(/\/result$/)
    expect(await meetingCount(page)).toBe(meetings)

    // 요청 → 할 일에서 빠지고 "2차 제안 진행 상황" 으로 옮겨 간다
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toBeVisible()
    await page.goto('/')
    await expect(page.getByTestId('todo-empty')).toBeVisible()
    await expect(page.getByRole('heading', { name: '2차 제안 진행 상황' })).toBeVisible()
    await expect(page.getByRole('link', { name: /이어하기상사/ })).toBeVisible()

    // 고객 화면도 같은 판단 — 전달 완료, 다음 행동은 요청 상태 확인
    await page.goto(companyPath)
    await expect(page.getByTestId('primary-action')).toHaveAttribute('data-stage', 'submitted')
    await expect(page.getByTestId('next-action')).toContainText('요청 상태')
  })

  test('지난 미팅 — 일정이 지났는데 기록이 없으면 할 일로 올라오고, 전략 화면에서 일정을 바로 바꿀 수 있다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '지난미팅상사')
    const companyPath = new URL(page.url()).pathname
    await setMeetingAt(page, '지난미팅상사', daysFromNow(-3))

    await page.goto('/meetings')
    const row = page.getByTestId('meeting-group-todo').getByTestId('meeting-row').filter({ hasText: '지난미팅상사' })
    await expect(row).toHaveAttribute('data-stage', 'overdue')
    await expect(row).toContainText('3일 전 미팅이 기록되지 않았습니다')
    // "일정 미정" 으로 잘못 들어가지 않는다
    await expect(page.getByTestId('meeting-group-prep')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-03-meetings-overdue.png`, fullPage: true })

    await page.goto('/')
    await expect(page.getByTestId('todo-row').first()).toHaveAttribute('data-stage', 'overdue')

    await page.goto(companyPath)
    await expect(page.getByTestId('overdue-note')).toContainText('3일 전 미팅')
    // 미팅을 했다면 바로 기록할 수 있다 — 주 버튼은 그대로 미팅 시작
    await expect(page.getByTestId('start-meeting')).toBeVisible()
    await page.getByTestId('overdue-note').getByRole('link', { name: '일정 변경' }).click()
    await expect(page).toHaveURL(/\/edit$/)
  })

  test('고객 찾기 — 대표자 이름 · 전화번호 뒷자리 · 상태 필터 · 정렬, 다녀와도 보던 목록 그대로', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    for (const [name, rep, phone] of [
      ['가나정밀', '박영수', '010-2222-7788'],
      ['다라식품', '최민정', '010-3333-4455'],
      ['마바물산', '정우진', '010-4444-9911'],
    ]) {
      await page.goto('/')
      await prepareCompany(page, name, { rep, phone })
    }
    // 시간 경과 — 다라식품은 사흘 뒤 미팅(예정), 마바물산은 일정 미정(준비). 가나정밀만 오늘 미팅(할 일)
    await setMeetingAt(page, '다라식품', daysFromNow(3))
    await setMeetingAt(page, '마바물산', null)

    await page.goto('/companies')
    const rows = page.getByTestId('company-row')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId('filter-todo')).toContainText('1')
    await expect(page.getByTestId('filter-planned')).toContainText('2')
    // 칩은 화면 읽기 프로그램에도 "상태" 라디오 묶음으로 남는다(레이아웃용 contents 여도)
    await expect(page.getByRole('radiogroup', { name: '상태' }).getByRole('radio')).toHaveCount(4)

    // 대표자 이름으로
    await page.getByTestId('company-search').fill('최민')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('다라식품')
    await expect(rows.first()).toContainText('최민정 대표')

    // 전화번호 뒷자리로 — 하이픈 없이 쳐도 찾고, 찾은 번호를 줄에 보여 준다
    await page.getByTestId('company-search').fill('9911')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('마바물산')
    await expect(rows.first()).toContainText('010-4444-9911')

    // 없는 검색어 → 안내 + 전체 보기
    await page.getByTestId('company-search').fill('없는회사')
    await expect(rows).toHaveCount(0)
    await expect(page.getByText('회사명 · 대표자 이름 · 전화번호 뒷자리로도 찾을 수 있습니다.')).toBeVisible()
    await page.getByRole('button', { name: '전체 보기' }).click()
    await expect(rows).toHaveCount(3)

    // 상태 필터 + 이름순 → 주소에 남는다
    await page.getByTestId('filter-planned').click()
    await page.getByTestId('company-sort').selectOption('name')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('다라식품')
    await expect(rows.nth(1)).toContainText('마바물산')
    await expect(page).toHaveURL(/f=planned/)
    await expect(page).toHaveURL(/sort=name/)
    // 예정·준비 고객의 다음 행동은 "전략 보기" — 줄을 누르는 것과 같아 버튼을 따로 두지 않는다
    await expect(page.getByTestId('company-next')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-04-companies-filter.png`, fullPage: true })

    // 고객을 열었다가 뒤로 — 보던 목록 그대로
    await rows.nth(1).getByRole('link', { name: /마바물산/ }).click()
    await expect(page.getByTestId('strategy-title')).toContainText('마바물산')
    await page.goBack()
    await expect(page.getByTestId('filter-planned')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('company-sort')).toHaveValue('name')
    await expect(rows).toHaveCount(2)

    // 줄의 다음 행동 — 할 일 고객은 바로 전략으로
    await page.getByTestId('filter-todo').click()
    await expect(rows).toHaveCount(1)
    await rows.first().getByTestId('company-next').click()
    await expect(page.getByTestId('strategy-title')).toContainText('가나정밀')
  })
})
