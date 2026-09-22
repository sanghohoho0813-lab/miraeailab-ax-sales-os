import { expect, test } from '@playwright/test'
import { SHOTS, answerAll, prepareCompany } from './helpers'

test.describe('AX Partner OS — 핵심 흐름', () => {
  test('준비 4단계 → 전략 → LIVE(적응형·코치·핵심말) → 요약 → 2차 제안 요청(중복 방지) → 리포트 → 마스터', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await expect(page).toHaveURL(/\/$/)
    // 홈 — 인사 · 실시간 시계 · 오늘 미팅 N건 · CTA 하나
    await expect(page.getByRole('heading', { name: /안녕하세요, 곽주환 팀장님/ })).toBeVisible()
    await expect(page.getByTestId('home-clock')).toHaveText(/^\d{2}:\d{2}:\d{2}$/)
    const t1 = await page.getByTestId('home-clock').textContent()
    await page.waitForTimeout(1100)
    expect(await page.getByTestId('home-clock').textContent()).not.toBe(t1)
    await page.screenshot({ path: `${SHOTS}/${tag}-01-home.png`, fullPage: true })

    // 1) 준비 4단계
    await prepareCompany(page, 'ABC산업', { phone: '010-1234-5678', shots: tag })

    // 2) 전략 화면 — 공략 포인트 3개 · 목표 · 주의 · 사전진단 건너뜀 · 추천 사례(리서치)
    await expect(page.getByRole('list', { name: '오늘 공략 포인트' }).getByRole('listitem')).toHaveCount(3)
    await expect(page.getByText('AX Fit 최우선 검토')).toBeVisible()
    await expect(page.getByText(/사전진단으로 \d+개 건너뜀/)).toBeVisible()
    await expect(page.getByTestId('case-row').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-03-strategy.png`, fullPage: true })

    // 3) LIVE — 포커스 헤더 "회사명 / LIVE MEETING / 1 / N", 최대 9문항, 사전진단 항목은 묻지 않는다
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await expect(page.getByTestId('live-header')).toContainText('LIVE MEETING')
    const progress = await page.getByTestId('live-progress').textContent()
    const total = Number(progress?.split('/')[1]?.trim())
    expect(total).toBeGreaterThanOrEqual(4)
    expect(total).toBeLessThanOrEqual(9)
    await expect(page.getByText(/사전진단으로 \d+개는 건너뜁니다/)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-04-live.png`, fullPage: true })

    // WHY / SAY 바텀시트 — 닫으면 포커스·스크롤 복원
    await page.getByTestId('open-why').click()
    await expect(page.getByTestId('sheet-why')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-04b-live-why.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('sheet-why')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await page.getByTestId('open-say').click()
    await expect(page.getByTestId('sheet-say')).toBeVisible()
    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByTestId('sheet-say')).toHaveCount(0)

    // 코치 — 사전진단에서 "ERP 있지만 밖에서 다시 관리" 로 답했으므로 "ERP 가 있다고 할 때" 가 지금 상황으로 올라온다
    await page.getByTestId('open-coach').click()
    await expect(page.getByTestId('sheet-coach')).toBeVisible()
    await expect(page.getByTestId('coach-now').filter({ hasText: 'ERP 가 있다고 할 때' })).toHaveCount(1)
    await expect(page.getByTestId('sheet-coach').getByText('자주 나오는 상황')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-04c-live-coach.png`, fullPage: true })
    await page.getByRole('button', { name: '닫기' }).click()

    // 떠 있는 [대표 핵심말 기록]
    await page.getByTestId('open-quote').click()
    await page.getByTestId('quote-input').fill('내가 하루만 빠져도 직원들이 계속 전화해요. 후불 가능합니다라고 말해 버렸어요.')
    await expect(page.getByTestId('sheet-quote').getByText('표현 수정 권장')).toBeVisible()
    await page.getByRole('button', { name: '저장하고 계속' }).click()

    await answerAll(page)
    await expect(page.getByTestId('key-quote')).toHaveValue(/하루만 빠져도/)
    await expect(page.getByText('표현 수정 권장')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-05-live-final.png`, fullPage: true })
    await page.getByTestId('end-meeting').click()

    // 4) 요약 먼저 — 핵심 01/02/03 + 추천 범위, 상세는 접혀 있음
    await expect(page).toHaveURL(/\/result$/)
    await expect(page.getByRole('heading', { name: '오늘 확인한 핵심' })).toBeVisible()
    expect(await page.getByTestId('core-finding').count()).toBeGreaterThanOrEqual(1)
    await expect(page.getByText('추천 범위')).toBeVisible()
    await expect(page.getByTestId('analysis-detail')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-06-after-summary.png`, fullPage: true })
    await page.getByTestId('toggle-detail').click()
    await expect(page.getByRole('heading', { name: '핵심 문제 TOP 3' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '추천 연구사례' })).toBeVisible()
    await expect(page.getByTestId('case-row').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-06b-after-detail.png`, fullPage: true })

    // 5) 2차 제안 요청 — 성공 모션 + 상태. 두 번 눌러도 한 번만 등록
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByTestId('handoff-success')).toContainText('미래AI랩 운영 OS에 전달되었습니다.')
    await expect(page.getByTestId('handoff-cta')).toContainText(/전달 완료|검토중/)
    await page.screenshot({ path: `${SHOTS}/${tag}-07-submitted.png`, fullPage: true })
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.customer_events') ?? '[]').length)
    expect(before).toBe(1)
    await page.reload()
    await expect(page.getByTestId('submit-handoff')).toHaveCount(0)
    await page.getByTestId('handoff-link').click()
    await expect(page.getByRole('heading', { name: /2차 제안 요청/ })).toBeVisible()
    await expect(page.getByTestId('handoff-status').getByText('현재')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-08-handoff.png`, fullPage: true })

    // 6) 브랜드 PDF 리포트 — 질문 전체 나열 없음
    await page.goBack()
    await page.getByRole('link', { name: /PDF 리포트/ }).click()
    await expect(page.getByTestId('report')).toContainText('1차 AX 미팅 리포트')
    await expect(page.getByTestId('report')).toContainText('추천 연구사례')
    await expect(page.getByTestId('report')).toContainText('2차 제안 상태')
    await page.screenshot({ path: `${SHOTS}/${tag}-09-report.png`, fullPage: true })

    // 7) 마스터로 전환 — 요청함에 보인다
    await page.goto('/settings')
    await page.getByRole('button', { name: '마스터로 전환' }).click()
    await page.goto('/master/inbox')
    await expect(page.getByText('ABC산업').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-10-master-inbox.png`, fullPage: true })

    // 가로 스크롤 없음
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(overflow).toBe(false)
  })

  test('사례 탐색 — 검색·필터·추천/전체·상세 흐름·미팅에 사용', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await prepareCompany(page, '테스트유통')
    await page.getByRole('link', { name: '사례 더 찾기' }).click()
    await expect(page).toHaveURL(/\/cases\?company=/)
    await expect(page.getByTestId('cases-tab-recommended')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('테스트유통 미팅 기준으로 추천 중')).toBeVisible()
    await expect(page.getByTestId('case-row').nth(1)).toBeVisible()
    // 검수 필요 사례는 추천에 없다
    await expect(page.getByTestId('case-row').filter({ hasText: '검수 필요' })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-11-cases.png`, fullPage: true })
    await page.getByTestId('cases-tab-all').click()
    await page.getByTestId('case-search').fill('재고')
    await expect(page.getByTestId('case-row').first()).toBeVisible()
    await page.getByTestId('case-filters').click()
    await page.getByRole('button', { name: '민간투자', exact: true }).click()
    await page.getByRole('button', { name: /적용/ }).click()
    await page.getByTestId('case-row').first().getByRole('link', { name: '사례 보기' }).click()
    await expect(page.getByTestId('case-title')).toBeVisible()
    for (const k of ['problem', 'transformation', 'data', 'proof', 'funding']) await expect(page.getByTestId(`flow-${k}`)).toBeVisible()
    await expect(page.getByTestId('reason-tags')).toBeVisible()
    await expect(page.getByRole('link', { name: /원문 보기/ })).toHaveAttribute('href', /^https?:\/\//)
    await page.screenshot({ path: `${SHOTS}/${tag}-12-case-detail.png`, fullPage: true })
    await page.getByTestId('use-case').click()
    await expect(page.getByTestId('use-case')).toContainText('미팅에서 빼기')
    await page.getByRole('link', { name: '미팅 전략으로' }).click()
    await expect(page.getByText('📌 내가 고른 사례')).toBeVisible()
  })

  test('파트너는 마스터 화면에 들어갈 수 없다', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/master/partners')
    await expect(page).toHaveURL(/\/$/)
  })

  test('플레이북 탭 — 상황별 답변·주의 표현 검사기(옛 주소는 리다이렉트)', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/forbidden')
    await expect(page).toHaveURL(/\/playbook\?tab=forbidden/)
    await page.getByTestId('guard-input').fill('AX 하면 정책자금 받을 수 있습니다')
    await expect(page.getByTestId('guard-hits')).toContainText('표현 수정 권장')
    await page.getByTestId('playbook-tab-objections').click()
    await page.getByTestId('playbook-search').fill('ERP')
    await expect(page.getByText('ERP 있는데요.')).toBeVisible()
  })

  test('테마 전환이 사이드바·강조색을 바꾸고 저장된다', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/settings')
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--th-accent-600').trim())
    await page.getByTestId('theme-deep_navy').click()
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--th-accent-600').trim())
    expect(after).not.toBe(before)
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('deep_navy')
    await page.getByTestId('theme-pure_white').click()
  })
})
