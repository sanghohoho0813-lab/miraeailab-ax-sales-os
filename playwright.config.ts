import { defineConfig, devices } from '@playwright/test'

// local 데이터 모드로 앱을 띄워 핵심 흐름(등록 → 브리핑 → 미팅 → 분석 → 전달)과 반응형을 검증한다.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4175',
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    // 이 실행 환경에는 Chromium 이 미리 설치돼 있다(PLAYWRIGHT_CHROMIUM_PATH). 없으면 Playwright 기본 브라우저를 쓴다.
    launchOptions: {
      chromiumSandbox: false,
      args: ['--no-sandbox'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 240_000,
    env: { VITE_DATA_MODE: 'local' },
  },
  projects: [
    { name: 'screens', testMatch: /screens\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'hardening', testMatch: /hardening\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    // 지능형 등록(PDF·음성·시각·권한)은 데스크톱과 폰(390px) 양쪽에서
    { name: 'intake', testMatch: /intake\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'intake-mobile', testMatch: /intake\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    // 화면 이동 스크롤 — 데스크톱과 폰 양쪽에서
    { name: 'shots', testMatch: /shots\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'shots-mobile', testMatch: /shots\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    // 기업분석 도구 — 데스크톱과 폰 양쪽에서 (개인정보 경계 검증 포함)
    { name: 'tools', testMatch: /tools\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tools-mobile', testMatch: /tools\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'copy', testMatch: /copy\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'scroll', testMatch: /scroll\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'scroll-mobile', testMatch: /scroll\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    // 모바일·태블릿은 Chromium 기반 기기 설명자를 쓴다 (WebKit 은 이 환경에 없다)
    { name: 'mobile', testIgnore: /(screens|hardening|intake|scroll|copy|shots|tools)\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'tablet', testIgnore: /(screens|hardening|intake|scroll|copy|shots|tools)\.spec\.ts/, use: { ...devices['Galaxy Tab S4'] } },
    { name: 'desktop', testIgnore: /(screens|hardening|intake|scroll|copy|shots|tools)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
})
