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

    // 일정은 정보 수정 폼이 아니라 그 자리에서 — 내일로 다시 잡으면 할 일에서 빠지고 예정으로
    await page.getByTestId('overdue-note').getByTestId('schedule-open').click()
    await expect(page.getByTestId('schedule-sheet')).toContainText('지난 일정')
    await page.getByTestId('time-tomorrow').click()
    await page.getByTestId('schedule-save').click()
    await expect(page.getByTestId('schedule-sheet')).toHaveCount(0)
    await expect(page.getByTestId('toast')).toContainText('미팅으로 잡았습니다')
    await expect(page.getByTestId('primary-action')).toHaveAttribute('data-stage', 'upcoming')
    await expect(page.getByTestId('overdue-note')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe(companyPath)

    // 무산·보류된 건은 일정 미정으로 — 지난 미팅이 할 일 큐를 계속 막지 않는다
    await page.getByTestId('schedule-open').click()
    await page.getByTestId('schedule-clear').click()
    await expect(page.getByTestId('primary-action')).toHaveAttribute('data-stage', 'prep')
    await page.goto('/')
    await expect(page.getByTestId('todo-empty')).toBeVisible()
  })

  test('2차 제안 준비완료 → 홈에서 한 번에 2차 미팅 일정 → 다가오는 미팅, 전화는 눌러서 바로', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '후속상사', { rep: '한지수', phone: '010-5555-1234' })
    const companyPath = new URL(page.url()).pathname
    // 미팅 전 확인 전화 — 폰에서 눌러서 바로 건다
    await expect(page.getByTestId('core-rep')).toContainText('한지수 대표')
    await expect(page.getByTestId('core-phone')).toHaveAttribute('href', 'tel:01055551234')

    await page.getByTestId('start-meeting').click()
    await answerAll(page)
    await page.getByTestId('key-quote').fill('확인 전화가 하루에도 여러 번 옵니다.')
    await page.getByTestId('end-meeting').click()
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toBeVisible()
    // 운영 OS 에서 김상호 대표가 2차 제안을 준비했다
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('axpartner.handoffs') ?? '[]') as { status: string }[]
      for (const h of list) h.status = 'proposal_ready'
      localStorage.setItem('axpartner.handoffs', JSON.stringify(list))
    })

    // 홈 — 다시 할 일이 된다. 버튼 하나로 고객 화면 + 일정 시트가 바로 열린다
    await page.goto('/')
    const row = page.getByTestId('todo-row').first()
    await expect(row).toHaveAttribute('data-stage', 'proposal_ready')
    await expect(row.getByTestId('todo-action')).toContainText('2차 미팅 일정 잡기')
    await page.screenshot({ path: `${SHOTS}/${tag}-05-home-proposal-ready.png`, fullPage: true })
    await row.click()
    await expect(page.getByTestId('schedule-sheet')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(companyPath)
    expect(new URL(page.url()).search).toBe('')
    await page.screenshot({ path: `${SHOTS}/${tag}-06-schedule-sheet.png`, fullPage: true })
    await page.getByTestId('time-tomorrow').click()
    await page.getByTestId('schedule-save').click()
    await expect(page.getByTestId('schedule-sheet')).toHaveCount(0)

    // 2차 미팅이 잡히면 주 버튼은 다시 미팅 시작, 할 일에서 빠지고 다가오는 미팅으로
    await expect(page.getByTestId('primary-action')).toHaveAttribute('data-stage', 'upcoming')
    await expect(page.getByTestId('start-meeting')).toContainText('미팅 시작')
    await expect(page.getByTestId('strategy-title')).toContainText('내일')
    // 새로고침해도 시트가 다시 열리지 않는다
    await page.reload()
    await expect(page.getByTestId('strategy-title')).toBeVisible()
    await expect(page.getByTestId('schedule-sheet')).toHaveCount(0)

    await page.goto('/')
    await expect(page.getByTestId('todo-empty')).toBeVisible()
    await expect(page.getByRole('heading', { name: '다가오는 미팅' })).toBeVisible()
    await expect(page.getByRole('link', { name: /후속상사/ })).toContainText('내일')

    // 요청 화면에서도 2차 미팅 일시가 보인다
    const handoffId = await page.evaluate(() => (JSON.parse(localStorage.getItem('axpartner.handoffs') ?? '[]') as { id: string }[])[0].id)
    await page.goto(`/handoffs/${handoffId}`)
    await expect(page.getByTestId('handoff-next-meeting')).toContainText('2차 미팅')
    await expect(page.getByTestId('handoff-next-meeting')).toContainText('내일')
  })

  test('마스터 홈 — 파트너의 진행 중 미팅은 내 할 일이 아니다. 확인할 요청과 멈춘 파트너 고객을 따로 본다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    // 파트너: 미팅을 시작만 하고 멈춘 고객 + 2차 제안 요청까지 보낸 고객
    await prepareCompany(page, '멈춘상사')
    await page.getByTestId('start-meeting').click()
    await page.getByRole('radio').first().click()
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
    await page.goto('/')
    await prepareCompany(page, '요청상사')
    await page.getByTestId('start-meeting').click()
    await answerAll(page)
    await page.getByTestId('key-quote').fill('확인 전화가 하루에도 여러 번 옵니다.')
    await page.getByTestId('end-meeting').click()
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toBeVisible()
    // 멈춘 지 이틀
    await page.evaluate((at) => {
      const list = JSON.parse(localStorage.getItem('axpartner.meetings') ?? '[]') as { status: string; updatedAt: string }[]
      for (const m of list) if (m.status === 'live' || m.status === 'draft') m.updatedAt = at
      localStorage.setItem('axpartner.meetings', JSON.stringify(list))
    }, daysFromNow(-2))

    await page.goto('/settings')
    await page.getByRole('button', { name: '마스터로 전환' }).click()
    await page.goto('/')

    // 할 일 = 확인할 요청. 파트너의 진행 중 미팅은 [이어서 진행] 으로 올라오지 않는다
    const todo = page.getByTestId('todo-row')
    await expect(todo).toHaveCount(1)
    await expect(todo.first()).toHaveAttribute('data-stage', 'request')
    await expect(todo.first()).toContainText('요청상사')
    await expect(todo.first()).toContainText('곽주환 팀장')
    await expect(page.getByTestId('home-summary')).toContainText('확인할 요청 1건')

    // 파트너 고객 중 하루 넘게 멈춘 건 — 담당 파트너와 함께
    const stuck = page.getByTestId('stuck-row')
    await expect(stuck).toHaveCount(1)
    await expect(stuck.first()).toHaveAttribute('data-stage', 'live')
    await expect(stuck.first()).toContainText('멈춘상사')
    await expect(stuck.first()).toContainText('곽주환 팀장')
    await page.screenshot({ path: `${SHOTS}/${tag}-07-master-home.png`, fullPage: true })

    await todo.first().click()
    await expect(page).toHaveURL(/\/handoffs\//)

    // 고객 목록 — 담당이 붙고, 남의 미팅은 [이어서 진행] 이 아니라 [고객 보기]
    await page.goto('/companies')
    const row = page.getByTestId('company-row').filter({ hasText: '멈춘상사' })
    await expect(row).toContainText('담당 곽주환')
    await expect(row.getByTestId('company-next')).toHaveText(/고객 보기/)
    await row.getByTestId('company-next').click()
    await expect(page.getByTestId('strategy-title')).toContainText('멈춘상사')
  })

  test('2차 미팅 → 결과 기록(계약) — 할 일에서 빠지고 "결과" 로, 마스터 전환율에 계약이 잡힌다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '계약상사')
    const companyPath = new URL(page.url()).pathname
    await page.getByTestId('start-meeting').click()
    await answerAll(page)
    await page.getByTestId('key-quote').fill('견적을 매번 엑셀로 다시 계산합니다.')
    await page.getByTestId('end-meeting').click()
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toBeVisible()
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('axpartner.handoffs') ?? '[]') as { status: string }[]
      for (const h of list) h.status = 'proposal_ready'
      localStorage.setItem('axpartner.handoffs', JSON.stringify(list))
    })
    // 1차 미팅은 사흘 전에 했다 (같은 날 2차 미팅은 없다 — 같은 날 일정은 1차 미팅 자신으로 본다)
    await page.evaluate((at) => {
      const list = JSON.parse(localStorage.getItem('axpartner.meetings') ?? '[]') as Record<string, string>[]
      for (const m of list) Object.assign(m, { startedAt: at, endedAt: at, updatedAt: at })
      localStorage.setItem('axpartner.meetings', JSON.stringify(list))
    }, daysFromNow(-3))
    await setMeetingAt(page, '계약상사', daysFromNow(-3))
    const meetingsBefore = await meetingCount(page)

    // 제안 준비완료 — 일정을 잡으려면 먼저 연락. 2차 미팅 제안 문자가 준비돼 있다
    await page.goto(companyPath)
    await page.getByTestId('message-cta').click()
    await expect(page.getByTestId('message-kind-proposal')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('message-text')).toHaveValue(/회사에 맞는 방향을 정리했습니다/)
    await page.keyboard.press('Escape')

    // 2차 미팅을 "지금" 으로 잡는다 → 오늘 2차 미팅. 1차 질문을 다시 돌리지 않고 결과 기록이 주 버튼
    await page.getByTestId('schedule-open').click()
    await page.getByTestId('time-now').click()
    await page.getByTestId('schedule-save').click()
    const action = page.getByTestId('primary-action')
    await expect(action).toHaveAttribute('data-stage', 'today')
    await expect(action).toHaveAttribute('data-round2', 'yes')
    await expect(page.getByTestId('next-reason')).toContainText('오늘 2차 미팅')
    await expect(action.getByTestId('outcome-open')).toContainText('결과 기록')
    await expect(page.getByTestId('round1-result')).toHaveAttribute('href', /\/result$/)
    // 1차 발굴 질문 대신 "1차에서 들은 것" — 핵심 문제 · 대표가 한 말 · 추천 범위
    await expect(page.getByTestId('round1-recap')).toBeVisible()
    await expect(page.getByTestId('focus-item')).toHaveCount(0)
    expect(await page.getByTestId('recap-item').count()).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('recap-quote')).toContainText('견적을 매번 엑셀로 다시 계산합니다.')
    await page.screenshot({ path: `${SHOTS}/${tag}-08-round2.png`, fullPage: true })

    // 결과 기록 — 계약 + 메모
    await action.getByTestId('outcome-open').click()
    const sheet = page.getByTestId('outcome-sheet')
    await sheet.getByRole('radio', { name: '계약' }).click()
    await page.getByTestId('outcome-note').fill('정책자금 + 연구소 패키지')
    await page.screenshot({ path: `${SHOTS}/${tag}-09-outcome-sheet.png`, fullPage: true })
    await page.getByTestId('outcome-save').click()
    await expect(page.getByTestId('toast')).toContainText('계약으로 기록했습니다')
    await expect(action).toHaveAttribute('data-stage', 'won')
    await expect(page.getByTestId('outcome-note-view')).toContainText('정책자금 + 연구소 패키지')
    await expect(page.getByTestId('outcome-open-top')).toContainText('결과 변경')
    expect(await meetingCount(page)).toBe(meetingsBefore)

    // 홈 — 할 일 없음. 고객 목록 — "결과" 로 모인다
    await page.goto('/')
    await expect(page.getByTestId('todo-empty')).toBeVisible()
    await page.goto('/companies')
    await expect(page.getByTestId('filter-closed')).toContainText('1')
    await page.getByTestId('filter-closed').click()
    await expect(page.getByTestId('company-row')).toHaveCount(1)
    await expect(page.getByTestId('company-row').first()).toHaveAttribute('data-stage', 'won')

    // 마스터 — 1차 미팅 → 계약 전환 (고객 수 기준)
    await page.goto('/settings')
    await page.getByRole('button', { name: '마스터로 전환' }).click()
    await page.goto('/master/usage')
    const f = page.getByTestId('funnel')
    await expect(f).toContainText('1차 미팅 마무리')
    await expect(f.getByText('1차 미팅 대비 100%')).toHaveCount(3)
    await expect(page.getByTestId('funnel-closed')).toContainText('보류 0곳 · 무산 0곳')
    await page.screenshot({ path: `${SHOTS}/${tag}-10-funnel.png`, fullPage: true })
  })

  test('1차 분석 뒤 거절 → 무산(사유) 으로 할 일에서 내리고, 보류로 바꾸면 재연락일에 "연락하기" 로 돌아온다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '거절상사', { phone: '010-7777-8888' })
    const companyPath = new URL(page.url()).pathname
    await page.getByTestId('start-meeting').click()
    await answerAll(page)
    await page.getByTestId('key-quote').fill('지금은 여유가 없어요.')
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)

    // 분석 완료 — 요청 대신 결과를 남길 수 있다. 사유 없이 저장하면 같은 화면에서 고르라고 한다
    await page.goto(companyPath)
    const action = page.getByTestId('primary-action')
    await expect(action).toHaveAttribute('data-stage', 'analyzed')
    await action.getByTestId('outcome-open').click()
    const sheet = page.getByTestId('outcome-sheet')
    await sheet.getByRole('radio', { name: '무산' }).click()
    await page.getByTestId('outcome-save').click()
    await expect(page.getByTestId('outcome-error')).toContainText('무산 사유')
    await sheet.getByRole('radio', { name: '예산 부족' }).click()
    await page.getByTestId('outcome-save').click()
    await expect(action).toHaveAttribute('data-stage', 'lost')
    await expect(page.getByTestId('next-reason')).toContainText('무산 · 예산 부족')
    await page.goto('/')
    await expect(page.getByTestId('todo-empty')).toBeVisible()

    // 보류로 바꾼다 — 2주 후 재연락. 그 전에는 조용하다
    await page.goto(companyPath)
    await page.getByTestId('outcome-open-top').click()
    await sheet.getByRole('radio', { name: '보류' }).click()
    await page.getByTestId('followup-2w').click()
    await expect(page.getByTestId('outcome-followup')).toContainText('지금 할 일')
    await page.getByTestId('outcome-save').click()
    await expect(page.getByTestId('toast')).toContainText('보류로 기록했습니다')
    await expect(action).toHaveAttribute('data-stage', 'hold')
    await expect(page.getByTestId('next-reason')).toContainText('재연락')

    // 시간이 흘러 재연락일 — 홈 할 일 "연락하기", 고객 화면 주 버튼은 전화하기
    await page.evaluate((at) => {
      const list = JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]') as { outcome?: { followUpAt?: string } }[]
      for (const c of list) if (c.outcome) c.outcome.followUpAt = at
      localStorage.setItem('axpartner.companies', JSON.stringify(list))
    }, daysFromNow(-1))
    await page.goto('/')
    const row = page.getByTestId('todo-row').first()
    await expect(row).toHaveAttribute('data-stage', 'followup')
    await expect(row.getByTestId('todo-action')).toContainText('연락하기')
    await page.screenshot({ path: `${SHOTS}/${tag}-11-home-followup.png`, fullPage: true })
    await row.click()
    await expect(action).toHaveAttribute('data-stage', 'followup')
    await expect(page.getByTestId('call')).toHaveAttribute('href', 'tel:01077778888')

    // 재연락일에는 안부 문자도 준비돼 있다
    await page.getByTestId('message-cta').click()
    await expect(page.getByTestId('message-kind-followup')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('message-text')).toHaveValue(/안부 겸 연락드립니다/)
    await page.keyboard.press('Escape')

    // 결과를 지우면 다시 진행 중 — 분석 완료 고객이니 2차 제안 요청이 할 일로 돌아온다
    await page.getByTestId('outcome-open-top').click()
    await page.getByTestId('outcome-clear').click()
    await expect(action).toHaveAttribute('data-stage', 'analyzed')
  })

  test('대표님께 문자 — 미팅 확인 · 서류 요청 · 감사 인사가 상황에 맞게 채워지고, 문자 앱으로 바로 보내거나 복사한다', async ({ page, context }, testInfo) => {
    const tag = testInfo.project.name
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginPartner(page)
    await prepareCompany(page, '문자상사', { rep: '박영호', phone: '010-2468-1357', withDate: true })
    const companyPath = new URL(page.url()).pathname

    // 오늘 미팅 — 미팅 확인 문자가 먼저
    await page.getByTestId('message-open').click()
    await expect(page.getByTestId('message-kind-confirm')).toHaveAttribute('aria-checked', 'true')
    const text = page.getByTestId('message-text')
    await expect(text).toHaveValue(/^박영호 대표님, 안녕하세요\. 미래AI랩 곽주환 팀장입니다\./)
    await expect(text).toHaveValue(/미팅 일정 확인차 연락드립니다/)
    await expect(text).toHaveValue(/따로 준비하실 것은 없습니다/)

    // 아직 받은 서류가 없다 — 서류 요청 문자. 개인정보는 가리라고 먼저 말한다
    await page.getByTestId('message-kind-documents').click()
    await expect(text).toHaveValue(/1\. 사업자등록증/)
    await expect(text).toHaveValue(/주민등록번호 뒷자리는 가리고/)
    await expect(text).not.toHaveValue(/크레탑/)
    await page.screenshot({ path: `${SHOTS}/${tag}-12-message.png`, fullPage: true })

    // 문자 앱 링크 — 번호와 본문이 채워져 있다
    const href = (await page.getByTestId('message-sms').getAttribute('href')) ?? ''
    expect(href.startsWith('sms:01024681357?&body=')).toBe(true)
    expect(decodeURIComponent(href.split('&body=')[1])).toBe(await text.inputValue())

    // 고친 문장도 주의 표현 검사를 거친다
    await text.fill(`${await text.inputValue()}\n정책자금 무조건 됩니다.`)
    await expect(page.getByTestId('message-guard')).toContainText('표현 수정 권장')

    // 복사
    await page.getByTestId('message-kind-confirm').click()
    await expect(page.getByTestId('message-guard')).toHaveCount(0)
    await page.getByTestId('message-copy').click()
    await expect(page.getByTestId('toast')).toContainText('복사했습니다')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await text.inputValue())
    await page.keyboard.press('Escape')

    // 미팅을 마치고 2차 제안 요청까지 — 결과 화면에서 감사 문자로 바로
    await page.getByTestId('start-meeting').click()
    await answerAll(page)
    await page.getByTestId('key-quote').fill('같은 내용을 장부와 엑셀에 두 번 적습니다.')
    await page.getByTestId('end-meeting').click()
    await page.getByTestId('submit-handoff').click()
    await page.getByTestId('thanks-message-link').click()
    await expect(page.getByTestId('message-sheet')).toBeVisible()
    await expect(page.getByTestId('message-kind-thanks')).toHaveAttribute('aria-checked', 'true')
    await expect(text).toHaveValue(/오늘 귀한 시간 내주셔서 감사합니다/)
    await expect(text).toHaveValue(/부분( 등)?을 중심으로/)
    expect(new URL(page.url()).pathname).toBe(companyPath)
    expect(new URL(page.url()).search).toBe('')
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
    await expect(page.getByRole('radiogroup', { name: '상태' }).getByRole('radio')).toHaveCount(5)

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
