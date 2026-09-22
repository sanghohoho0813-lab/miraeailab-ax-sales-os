/**
 * 지능형 등록 — PDF 1분 준비 · 잘못된 값 수정 → 재계산 · 중복 PDF 고객 · 음성 입력(mock) · 미팅 일시 Quick · 삭제 권한 · 자동 매칭.
 * local 데이터 모드. PDF 는 익명화 픽스처(e2e/fixtures/sample-company-report.pdf).
 */
import { expect, test, type Page } from '@playwright/test'
import { SHOTS, SPEECH_MOCK, prepareCompany } from './helpers'

const FIXTURE = 'e2e/fixtures/sample-company-report.pdf'

async function loginPartner(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-partner').click()
  await expect(page).toHaveURL(/\/$/)
}
async function uploadFixture(page: Page) {
  await page.getByTestId('pdf-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('pdf-review')).toBeVisible({ timeout: 45_000 })
}
const row = (page: Page, key: string) => page.locator(`[data-testid="evidence-row"][data-key="${key}"]`)

test.describe('지능형 등록', () => {
  test('PDF로 1분 준비 — 업로드 → 추출(페이지·근거) → 확인 → 회사 생성 → 사례 자동매칭(이유) → 전략 자동생성 → 근거 보기', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await page.getByTestId('cta-new-company').click()
    await expect(page.getByTestId('intake-pdf')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-01-intake-chooser.png`, fullPage: true })
    await page.getByTestId('intake-pdf').click()
    await expect(page.getByTestId('pdf-drop')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-02-pdf-pick.png`, fullPage: true })
    await uploadFixture(page)

    // 추출값 — 값 · 상태 · 페이지 · 원문
    await expect(row(page, 'companyName')).toContainText('테스트정밀')
    await expect(row(page, 'headcount')).toContainText('14명')
    await expect(row(page, 'headcount')).toContainText('PDF 2p')
    await expect(row(page, 'headcount')).toContainText('확인')
    await expect(row(page, 'tradeType')).toContainText('추정')
    await expect(page.locator('[data-testid="fin-cell"][data-key="fin_revenue_2025"]')).toContainText('112.3억')
    await expect(page.getByTestId('fin-row')).toHaveCount(6)
    await expect(row(page, 'revenueTrend')).toContainText('매출 증가')
    await expect(row(page, 'certifications')).toContainText('기업부설연구소')
    // 개인정보 줄은 어디에도 없다
    await expect(page.getByTestId('evidence-list')).not.toContainText('000000-1000000')
    await expect(page.getByTestId('evidence-list')).not.toContainText('자택')
    // 핵심 정보가 PDF 로 채워졌다 (거래형태는 추정 배지)
    await expect(page.getByTestId('company-name')).toHaveValue('테스트정밀')
    await expect(page.getByRole('radio', { name: '제조' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: '11~20명' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'B2B', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'now')
    await page.screenshot({ path: `${SHOTS}/${tag}-03-pdf-review.png`, fullPage: true })

    // 저장 전에는 고객이 없다
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]').length)).toBe(0)
    await page.getByTestId('pdf-confirm').click()
    await expect(page.getByTestId('strategy-title')).toContainText('테스트정밀은 이렇게 접근하세요')
    await expect(page.getByTestId('strategy-confidence')).toHaveAttribute('data-level', 'high')
    await expect(page.getByTestId('strategy-approach')).toContainText(/접근|확인/)
    await expect(page.getByRole('list', { name: '오늘 공략 포인트' }).getByRole('listitem')).toHaveCount(3)
    // 사례 2~3개, 종류가 다르고, 각 사례에 추천 이유
    const cs = page.getByTestId('strategy-case')
    const n = await cs.count()
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(3)
    const kinds = new Set(await cs.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind'))))
    expect(kinds.size).toBe(n)
    for (let i = 0; i < n; i++) await expect(cs.nth(i)).toContainText('왜 추천했나요?')
    await expect(page.getByTestId('case-row').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${tag}-04-strategy.png`, fullPage: true })
    // 문서 → 가설 → 질문
    await page.getByTestId('fold-questions').getByRole('button').first().click()
    expect(await page.getByTestId('hypothesis').count()).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('hypothesis').first()).toContainText('가능성')
    // 말하는 법 · 주의
    await page.getByTestId('fold-scripts').getByRole('button').first().click()
    await expect(page.locator('[data-testid="script"][data-key="opening"]')).toContainText('대표님')
    await expect(page.locator('[data-testid="script"][data-key="price"]')).toContainText('수백만 원')
    await page.getByTestId('fold-forbidden').getByRole('button').first().click()
    await expect(page.getByTestId('fold-forbidden')).toContainText('후불')
    await expect(page.getByTestId('fold-forbidden')).toContainText('매출')
    await page.screenshot({ path: `${SHOTS}/${tag}-05-strategy-open.png`, fullPage: true })
    // 왜 이렇게 판단했나요?
    await page.getByTestId('open-sources').click()
    await expect(page.getByTestId('strategy-sources')).toContainText('PDF 2p')
    await expect(page.getByTestId('strategy-sources')).toContainText('추정')
    await page.screenshot({ path: `${SHOTS}/${tag}-06-sources.png`, fullPage: true })
    await page.keyboard.press('Escape')
    // 기업자료 — 원본 저장 안 함
    await expect(page.getByTestId('profile-row')).toHaveCount(1)
    await expect(page.getByTestId('profile-row')).toContainText('원본 저장 안 함')
    // 사용 이벤트
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.usage_events') ?? '[]').map((e: { eventType: string }) => e.eventType))
    for (const ev of ['pdf_uploaded', 'pdf_parsed', 'pdf_confirmed', 'strategy_generated', 'case_auto_matched']) expect(events).toContain(ev)
  })

  test('잘못 추출된 값 — 개별 삭제·수정 후 저장하면 전략이 수정값 기준으로 재계산된다', async ({ page }) => {
    await loginPartner(page)
    await page.goto('/companies/new/pdf')
    await uploadFixture(page)
    // 직원수 사용 안 함 → 인원은 "잘 모르겠음"
    await row(page, 'headcount').getByTestId('evidence-remove').click()
    await expect(row(page, 'headcount')).toHaveAttribute('data-removed', 'true')
    await expect(page.getByRole('radio', { name: '잘 모르겠음' }).first()).toHaveAttribute('aria-checked', 'true')
    // 회사명 수정
    await row(page, 'companyName').getByTestId('evidence-edit').click()
    await page.getByTestId('evidence-edit-input').fill('테스트정밀상사')
    await page.getByTestId('evidence-edit-save').click()
    await expect(page.getByTestId('company-name')).toHaveValue('테스트정밀상사')
    await page.getByTestId('pdf-confirm').click()
    await expect(page.getByTestId('strategy-title')).toContainText('테스트정밀상사은 이렇게 접근하세요')
    await page.getByTestId('open-sources').click()
    const hcRow = page.getByTestId('source-row').filter({ hasText: '인원' })
    await expect(hcRow).toContainText('잘 모르겠음')
    await expect(hcRow).toContainText('아직 미확인')
    await page.keyboard.press('Escape')
    // 기업자료에서 되돌리면 즉시 재계산 — 직원 14명 가설이 생긴다
    await page.getByTestId('fold-questions').getByRole('button').first().click()
    const before = await page.getByTestId('hypothesis').count()
    await page.getByTestId('open-profile').click()
    const sheetRow = page.getByTestId('profile-sheet').locator('[data-testid="evidence-row"][data-key="headcount"]')
    await sheetRow.getByTestId('evidence-restore').click()
    await expect(sheetRow).toHaveAttribute('data-removed', 'false')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('hypothesis').filter({ hasText: '직원 14명' })).toHaveCount(1)
    expect(await page.getByTestId('hypothesis').count()).toBeGreaterThanOrEqual(before)
    // 정보 수정 화면에서 인원을 바꾸면 근거도 바뀐다
    await page.getByRole('link', { name: '정보 수정' }).click()
    await expect(page.getByTestId('prep-progress')).toHaveText(/1 \/ 3/)
    await page.getByTestId('prep-next').click()
    await page.getByRole('radio', { name: '21~30명' }).click()
    await page.getByTestId('prep-next').click()
    await page.getByTestId('company-save').click()
    await expect(page.getByTestId('strategy-title')).toBeVisible()
    await page.getByTestId('open-sources').click()
    await expect(page.getByTestId('source-row').filter({ hasText: '인원' })).toContainText('21~30명')
  })

  test('중복 PDF 고객 — 기존 고객이 있으면 자동 생성하지 않고 [기존 고객에 정보 추가] (항목별 기존 유지/PDF 반영)', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await loginPartner(page)
    await prepareCompany(page, '테스트정밀')
    await page.goto('/companies/new/pdf')
    await uploadFixture(page)
    await expect(page.getByTestId('dup-sheet')).toBeVisible()
    await expect(page.getByTestId('dup-sheet')).toContainText('테스트정밀')
    await page.screenshot({ path: `${SHOTS}/${tag}-07-dup-sheet.png`, fullPage: true })
    await page.getByTestId('merge-existing').click()
    await expect(page.getByTestId('merge-panel')).toBeVisible()
    // 다른 값이 있는 항목만 — 대표자·연락처 (인원·업종·거래형태는 이미 같다)
    await expect(page.locator('[data-testid="merge-row"][data-key="representativeName"]')).toBeVisible()
    await expect(page.locator('[data-testid="merge-row"][data-key="headcount"]')).toHaveCount(0)
    // 기본은 기존 유지 — 대표자만 PDF 반영
    await page.locator('[data-testid="merge-row"][data-key="representativeName"]').getByTestId('merge-pdf').click()
    await page.screenshot({ path: `${SHOTS}/${tag}-08-merge.png`, fullPage: true })
    await page.getByTestId('merge-confirm').click()
    await expect(page.getByTestId('strategy-title')).toContainText('테스트정밀은 이렇게 접근하세요')
    await expect(page.getByTestId('profile-row')).toHaveCount(1)
    const companies = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]') as { name: string; representativeName: string; phone: string; fieldSources: Record<string, string> }[])
    expect(companies).toHaveLength(1)
    expect(companies[0].representativeName).toBe('김가상')
    expect(companies[0].phone).toBe('') // 기존 유지
    expect(companies[0].fieldSources.representativeName).toBe('pdf')
  })

  test('음성 한 번에 입력(mock) — 초안 확인 전에는 저장하지 않고, 확인한 값만 폼에 들어간다', async ({ page }, testInfo) => {
    const tag = testInfo.project.name
    await page.addInitScript(SPEECH_MOCK)
    await loginPartner(page)
    await page.goto('/companies/new/quick')
    await page.evaluate(() => {
      ;(window as unknown as { __voiceText: string }).__voiceText = 'ABC산업 김철수 대표, 오늘 오후 세시 미팅이고 직원은 열다섯 명, 제조업이고 B2B 납품입니다. 연락처 010 1234 5678'
    })
    await page.getByTestId('voice-all').click()
    await expect(page.getByTestId('voice-sheet')).toBeVisible()
    await page.getByTestId('voice-start').click()
    await expect(page.locator('[data-testid="voice-row"][data-key="회사"]')).toContainText('ABC산업')
    await expect(page.locator('[data-testid="voice-row"][data-key="대표"]')).toContainText('김철수')
    await expect(page.locator('[data-testid="voice-row"][data-key="연락처"]')).toContainText('010-1234-5678')
    await expect(page.locator('[data-testid="voice-row"][data-key="미팅"]')).toContainText('15:00')
    await expect(page.locator('[data-testid="voice-row"][data-key="인원"]')).toContainText('11~20명')
    await page.screenshot({ path: `${SHOTS}/${tag}-09-voice-draft.png`, fullPage: true })
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]').length)).toBe(0)
    await page.getByTestId('voice-apply').click()
    await expect(page.getByTestId('company-name')).toHaveValue('ABC산업')
    await expect(page.getByTestId('company-rep')).toHaveValue('김철수')
    await expect(page.getByTestId('company-phone')).toHaveValue('010-1234-5678')
    await page.getByTestId('prep-next').click()
    await expect(page.getByRole('radio', { name: '제조' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: '11~20명' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'B2B', exact: true })).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('prep-next').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'custom')
    await expect(page.getByTestId('time-custom')).toContainText('15:00')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.companies') ?? '[]').length)).toBe(0)
    await page.getByTestId('company-save').click()
    await expect(page.getByTestId('strategy-title')).toContainText('ABC산업은 이렇게 접근하세요')
    await expect(page.getByText('AX Fit 최우선 검토')).toBeVisible() // 사전진단 연결 (회사명+연락처)
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('axpartner.usage_events') ?? '[]').map((e: { eventType: string }) => e.eventType))
    expect(events).toContain('voice_intake_used')
    // 항목별 마이크 — 한글로 읽은 번호를 정규화
    await page.goto('/companies/new/quick')
    await page.evaluate(() => {
      ;(window as unknown as { __voiceText: string }).__voiceText = '공일공 구팔칠육 오사삼이'
    })
    await page.getByTestId('voice-phone').click()
    await expect(page.getByTestId('company-phone')).toHaveValue('010-9876-5432')
  })

  test('미팅 일시 Quick — 기본 "오늘 · 지금"(실시간), +1시간, 다시 지금, 내일, 지우기', async ({ page }) => {
    await loginPartner(page)
    await page.goto('/companies/new/quick')
    await page.getByTestId('company-name').fill('시각테스트')
    await page.getByTestId('prep-next').click()
    await page.getByRole('radio', { name: '서비스' }).click()
    await page.getByRole('radio', { name: '1~5명' }).click()
    await page.getByRole('radio', { name: 'B2C', exact: true }).click()
    await page.getByTestId('prep-next').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'now')
    const live = (await page.getByTestId('time-live').textContent())?.slice(0, 5)
    const nowHm = await page.evaluate(() => {
      const d = new Date()
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    })
    expect(live).toBe(nowHm)
    await page.getByTestId('time-plus-60').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'custom')
    const custom = await page.getByTestId('time-custom').textContent()
    const plus = await page.evaluate(() => {
      const d = new Date()
      d.setMinutes(d.getMinutes() + 60)
      return String(d.getHours()).padStart(2, '0')
    })
    expect(custom).toContain(` ${plus}:`)
    await page.getByTestId('time-now').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'now')
    await page.getByTestId('time-tomorrow').click()
    await expect(page.getByTestId('meeting-time')).toContainText('내일')
    await page.getByTestId('time-clear').click()
    await expect(page.getByTestId('meeting-time')).toHaveAttribute('data-mode', 'none')
    await page.getByTestId('time-now').click()
    await page.getByTestId('company-save').click()
    await expect(page.getByTestId('strategy-title')).toContainText('오늘 시각테스트은')
  })

  test('삭제 권한 — 다른 파트너는 남의 고객을 보지도 못하고, 마스터는 누가 등록했든 보관·복구·영구삭제', async ({ page }) => {
    await loginPartner(page)
    await prepareCompany(page, '권한테스트')
    const url = page.url()
    const id = url.split('/companies/')[1]
    // 두 번째 파트너(이수진)
    await page.evaluate(() => {
      localStorage.removeItem('axpartner.local_role')
      localStorage.setItem('axpartner.local_profile_id', 'local-partner2')
    })
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await expect(page.getByRole('heading', { name: /이수진 팀장님/ })).toBeVisible()
    await page.goto('/companies')
    await expect(page.getByTestId('company-row')).toHaveCount(0)
    await page.goto(`/companies/${id}`)
    await expect(page.getByText('업체를 찾을 수 없습니다.')).toBeVisible()
    // 마스터
    await page.evaluate(() => {
      localStorage.removeItem('axpartner.local_role')
      localStorage.removeItem('axpartner.local_profile_id')
    })
    await page.goto('/login')
    await page.getByTestId('login-master').click()
    await page.goto(`/companies/${id}`)
    await expect(page.getByTestId('strategy-title')).toContainText('권한테스트')
    await page.getByTestId('archive-company').click()
    await page.getByTestId('archive-modal').getByTestId('danger-confirm').click()
    await page.goto('/companies/trash')
    await expect(page.getByTestId('trash-row')).toHaveCount(1)
    await page.getByTestId('restore').click()
    await expect(page.getByTestId('trash-row')).toHaveCount(0)
    await page.goto(`/companies/${id}`)
    await page.getByTestId('archive-company').click()
    await page.getByTestId('archive-modal').getByTestId('danger-confirm').click()
    await page.goto('/companies/trash')
    await page.getByTestId('delete-permanent').click()
    await expect(page.getByTestId('delete-modal')).toBeVisible()
    await page.getByTestId('danger-typed').fill('권한테스트')
    await page.getByTestId('danger-confirm').click()
    await expect(page.getByTestId('trash-row')).toHaveCount(0)
  })

  test('전략 자동매칭 — 제조 / B2B / 11~20 / 견적·발주 신호 → 추천 이유가 있는 실제 사례 2~3개', async ({ page }) => {
    await loginPartner(page)
    await prepareCompany(page, '매칭테스트')
    const cs = page.getByTestId('strategy-case')
    const n = await cs.count()
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(3)
    for (let i = 0; i < n; i++) {
      await expect(cs.nth(i)).toContainText('왜 추천했나요?')
      await expect(cs.nth(i).getByTestId('case-row')).toBeVisible()
    }
    await expect(cs.first()).toContainText(/같은 업종|가까운 업종|문제 구조/)
    await expect(page.locator('[data-testid="focus-item"][data-area="quote_order"]')).toHaveCount(1)
  })
})
