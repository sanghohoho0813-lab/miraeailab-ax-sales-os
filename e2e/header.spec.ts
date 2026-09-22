/**
 * 글로벌 헤더 — 날짜·요일·초 단위 시각.
 *
 * 390px 에서 시각만 보이고 날짜가 사라지면 Partner 가 "오늘이 며칠이지" 를 앱 밖에서 확인해야 한다.
 * mobile(Pixel 7 · 390px) / tablet / desktop 세 프로젝트에서 모두 돌아간다.
 */
import { expect, test } from '@playwright/test'
import { SHOTS } from './helpers'

test('어느 폭에서도 날짜 · 요일 · 초 단위 시각이 함께 보인다', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await expect(page).toHaveURL(/\/$/)

  const clock = page.getByTestId('live-clock')
  await expect(clock).toBeVisible()
  // 화면에 실제로 그려진 글자만 읽는다 (innerText 는 display:none 을 제외한다)
  const shown = await clock.innerText()
  expect(shown, `${testInfo.project.name}: 헤더에 날짜가 없다`).toMatch(/\d{4}\.\d{2}\.\d{2}\s*[일월화수목금토](요일)?/)
  expect(shown, `${testInfo.project.name}: 헤더에 초 단위 시각이 없다`).toMatch(/\d{2}:\d{2}:\d{2}/)

  // 오늘 날짜와 요일이 맞는가 (브라우저 시간대 기준)
  const expected = await page.evaluate(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return { date: `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`, weekday: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] }
  })
  await expect(page.getByTestId('clock-date')).toContainText(expected.date)
  await expect(page.getByTestId('clock-date')).toContainText(expected.weekday)

  // 초가 실제로 흐른다 (새 타이머를 만들지 않고 useClock 하나를 쓴다)
  const t1 = await page.getByTestId('clock-time').innerText()
  await expect.poll(() => page.getByTestId('clock-time').innerText(), { timeout: 3000 }).not.toBe(t1)

  // 날짜가 라우트 제목을 밀어내지 않는다
  await expect(page.getByTestId('route-title')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-header-clock.png` })
})
