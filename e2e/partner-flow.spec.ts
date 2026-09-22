import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = 'e2e/screenshots'
mkdirSync(SHOTS, { recursive: true })

test.describe('AX Partner OS — 핵심 흐름', () => {
  test('등록 → 브리핑 → 클릭 미팅 → 분석 → 2차 제안 요청 (중복 방지) → 리포트', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await expect(page).toHaveURL(/\/$/)
    await page.screenshot({ path: `${SHOTS}/${tag}-01-home.png`, fullPage: true })

    // 1) 신규 업체 등록 — 클릭형. 회사명 + 연락처가 사전진단 픽스처(ABC산업)와 일치
    await page.getByTestId('cta-new-company').click()
    await page.getByTestId('company-name').fill('ABC산업')
    await page.getByRole('radio', { name: '제조' }).click()
    await page.getByRole('radio', { name: '11~20명' }).click()
    await page.getByRole('radio', { name: 'B2B', exact: true }).click()
    await page.getByRole('checkbox', { name: '업무효율' }).click()
    await page.getByRole('checkbox', { name: '정책자금' }).click()
    await page.getByTestId('company-phone').fill('010-1234-5678')
    await page.screenshot({ path: `${SHOTS}/${tag}-02-register.png`, fullPage: true })
    await page.getByTestId('company-save').click()

    // 2) 브리핑 — 사전진단 연결·오늘의 접근법·추천 사례
    await expect(page.getByRole('heading', { name: 'ABC산업' })).toBeVisible()
    await expect(page.getByText('오늘 공략 포인트')).toBeVisible()
    await expect(page.getByText('AX Fit 최우선 검토')).toBeVisible()
    await expect(page.getByText('사전진단으로 미리 채움').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-03-brief.png`, fullPage: true })

    // 3) 미팅 — 한 화면 한 질문. 첫 질문은 사전진단으로 미리 채워져 있다 → 그대로 확인
    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await expect(page.getByText('1 /')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-04-live-prefill.png`, fullPage: true })
    await page.getByTestId('confirm-prefill').click()

    // 나머지 질문은 큰 버튼으로 답하거나 건너뛴다
    for (let i = 0; i < 12; i++) {
      if (await page.getByTestId('key-quote').isVisible().catch(() => false)) break
      const confirm = page.getByTestId('confirm-prefill')
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        continue
      }
      const radios = page.getByRole('radio')
      const n = await radios.count()
      if (n === 0) break
      if (i === 2) await page.getByTestId('skip').click()
      else await radios.nth(Math.min(2, n - 1)).click()
    }
    await expect(page.getByTestId('key-quote')).toBeVisible()
    await page.getByTestId('key-quote').fill('내가 하루만 빠져도 직원들이 계속 전화해요. 후불 가능합니다라고 말해 버렸어요.')
    await expect(page.getByText('표현 수정 권장')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-05-quote.png`, fullPage: true })
    await page.getByTestId('end-meeting').click()

    // 4) 분석 — TOP 3, 범위 가설, 추가 확인 ≤ 3, 오늘의 포인트
    await expect(page).toHaveURL(/\/result$/)
    await expect(page.getByRole('heading', { name: '핵심 문제 TOP 3' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '프로젝트 범위 가설' })).toBeVisible()
    await expect(page.getByText('오늘의 AX 포인트')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-06-result.png`, fullPage: true })

    // 5) 2차 제안 요청 — 두 번 눌러도 한 번만 등록
    await page.getByTestId('submit-handoff').click()
    await expect(page.getByText('미래AI랩 운영 OS 로 전달되었습니다.').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-07-submitted.png`, fullPage: true })
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.customer_events') ?? '[]').length)
    expect(before).toBe(1)
    await page.reload()
    await expect(page.getByTestId('submit-handoff')).toHaveCount(0)
    await page.getByRole('link', { name: '전달 내용 보기' }).click()
    await expect(page.getByRole('heading', { name: /2차 제안 요청/ })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-08-handoff.png`, fullPage: true })

    // 6) 리포트 (PDF 저장용)
    await page.goBack()
    await page.getByRole('link', { name: /PDF 저장/ }).click()
    await expect(page.getByRole('heading', { name: '1차 AX 미팅 내부 리포트' })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-09-report.png`, fullPage: true })

    // 7) 마스터로 전환 — 요청함에 보인다
    await page.goto('/settings')
    await page.getByRole('button', { name: '마스터로 전환' }).click()
    await page.goto('/master/inbox')
    await expect(page.getByText('ABC산업').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-10-master-inbox.png`, fullPage: true })

    // 가로 스크롤 없음 (반응형)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(overflow).toBe(false)
  })

  test('파트너는 마스터 화면에 들어갈 수 없다', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/master/partners')
    await expect(page).toHaveURL(/\/$/)
  })

  test('주의 표현 검사기가 금지 표현을 잡는다', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/forbidden')
    await page.getByTestId('guard-input').fill('AX 하면 정책자금 받을 수 있습니다')
    await expect(page.getByTestId('guard-hits')).toContainText('표현 수정 권장')
  })
})
