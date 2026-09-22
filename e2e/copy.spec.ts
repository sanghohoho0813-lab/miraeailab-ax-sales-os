/**
 * 화면에 실제로 그려진 한국어 점검.
 * 코드 검색으로는 잡히지 않는 조합(문자열 이어붙이기 결과)까지 보기 위해 렌더된 텍스트를 읽는다.
 *   - "이(가)" "을(를)" "은(는)" 같은 placeholder 표기가 남아 있으면 실패
 *   - "AX 를" "PDF 가" 처럼 약어와 조사가 떨어져 있으면 실패
 *   - 기업인증·재무 상세가 1차 미팅 화면에 기본 노출되면 실패
 */
import { expect, test, type Page } from '@playwright/test'
import { answerAll, prepareCompany } from './helpers'

const PLACEHOLDER = /이\(가\)|을\(를\)|은\(는\)|와\(과\)|으로\(로\)/
const ACRONYM_JOSA = /(AX|PDF|OS|AI|ERP|POS|CRM|SaaS|B2B|B2C)\s(를|을|는|은|가|이|로|으로|에서|에|와|과|도|만|의)(?![가-힣])/

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText)
}

async function checkCopy(page: Page, where: string) {
  const text = await visibleText(page)
  const ph = text.match(PLACEHOLDER)
  expect(ph?.[0], `${where}: 조사 placeholder 노출`).toBeUndefined()
  const aj = text.match(ACRONYM_JOSA)
  expect(aj?.[0], `${where}: 약어와 조사 사이 띄어쓰기`).toBeUndefined()
  expect(text, `${where}: 어색한 띄어쓰기`).not.toContain('회사 마다')
}

test.describe('한국어 표기', () => {
  test('주요 화면에 조사 placeholder·약어 띄어쓰기가 없다', async ({ page }) => {
    await page.goto('/login')
    await checkCopy(page, '로그인')
    await page.getByTestId('login-partner').click()
    await checkCopy(page, '홈')

    await prepareCompany(page, '표기테스트', { phone: '010-1234-5678' })
    await checkCopy(page, '미팅 전략')

    // 시트 안 문구까지
    for (const id of ['open-detail', 'open-tips', 'open-docs', 'open-sources']) {
      await page.getByTestId(id).click()
      await checkCopy(page, `전략 · ${id}`)
      await page.keyboard.press('Escape')
    }

    await page.getByTestId('start-meeting').click()
    await expect(page).toHaveURL(/\/live$/)
    await checkCopy(page, 'LIVE 질문')
    await page.getByTestId('open-say').click()
    await page.getByTestId('open-why').click()
    await checkCopy(page, 'LIVE · 어떻게 물어보지?')
    await page.keyboard.press('Escape')

    await answerAll(page)
    await page.getByTestId('key-quote').fill('내가 하루만 빠져도 직원들이 계속 전화해요.')
    await checkCopy(page, 'LIVE 마무리')
    await page.getByTestId('end-meeting').click()
    await expect(page).toHaveURL(/\/result$/)
    await checkCopy(page, '분석 결과')
    await page.getByTestId('toggle-detail').click()
    await checkCopy(page, '분석 결과 상세')

    for (const path of ['/cases', '/playbook', '/companies', '/meetings', '/settings', '/companies/new', '/companies/new/quick']) {
      await page.goto(path)
      await checkCopy(page, path)
    }
  })

  test('1차 미팅 화면에는 인증·재무 상세가 기본 노출되지 않는다', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-partner').click()
    await page.goto('/companies/new/pdf')
    await page.getByTestId('pdf-input').setInputFiles('e2e/fixtures/sample-company-report.pdf')
    await expect(page.getByTestId('pdf-review')).toBeVisible({ timeout: 45_000 })
    const review = await visibleText(page)
    for (const hidden of ['기업부설연구소', '벤처기업', 'ISO 9001', 'BBB', '부채총계', '자본총계', '영업이익', '특허']) {
      expect(review, `PDF 검토 기본 화면에 "${hidden}" 노출`).not.toContain(hidden)
    }
    // 대신 핵심 4가지는 그대로 보인다
    expect(review).toContain('업종')
    expect(review).toContain('근로자')
    expect(review).toContain('최근 매출')
    expect(review).toContain('업력')

    await page.getByTestId('pdf-confirm').click()
    await expect(page.getByTestId('strategy-title')).toBeVisible()
    const strategy = await visibleText(page)
    for (const hidden of ['기업부설연구소', '이노비즈', '부채총계', '신용등급']) {
      expect(strategy, `전략 화면에 "${hidden}" 노출`).not.toContain(hidden)
    }
  })
})
