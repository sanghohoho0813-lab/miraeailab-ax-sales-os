/**
 * 라우트가 바뀌면 새 화면을 항상 맨 위에서 시작한다.
 *
 * 왜 필요한가: React Router 는 기본적으로 스크롤을 건드리지 않는다. LIVE 화면에서 아래까지 내린 채
 * [미팅 마무리] 를 누르면 결과 화면이 중간부터 보였다. 분석 결과는 첫 줄부터 읽어야 한다.
 *
 * 스크롤 주인(scroll owner)은 문서(documentElement)다 — AppShell 은 overflow 컨테이너를 쓰지 않고
 * `min-h-dvh` 로 문서 자체가 스크롤된다. Mobile / PC+Mobile 미리보기는 iframe 안에서 같은 앱이 돌고,
 * 그 iframe 은 자기 window 를 가지므로 이 컴포넌트가 프레임 안에서도 그대로 동작한다.
 * 혹시 나중에 overflow 컨테이너가 생겨도 견디도록 data-scroll-root 요소가 있으면 그쪽도 함께 0 으로 만든다.
 *
 * 뒤로가기(POP)는 브라우저가 복원하는 위치가 더 자연스러우므로 건드리지 않는다.
 * 단 분석 결과(/result)만은 뒤로 오더라도 언제나 맨 위에서 시작한다.
 */
import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** 뒤로가기로 와도 무조건 최상단에서 시작하는 화면 */
const ALWAYS_TOP = [/^\/meetings\/[^/]+\/result/]

export function scrollWindowTop(): void {
  if (typeof window === 'undefined') return
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  } catch {
    window.scrollTo(0, 0)
  }
  // 브라우저·엔진에 따라 스크롤 주인이 다르다 (Safari 는 body, 나머지는 documentElement)
  if (document.documentElement) document.documentElement.scrollTop = 0
  if (document.body) document.body.scrollTop = 0
  // 앱 안에 별도 스크롤 컨테이너를 두게 되더라도 함께 초기화된다
  document.querySelectorAll<HTMLElement>('[data-scroll-root]').forEach((el) => {
    el.scrollTop = 0
  })
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useLayoutEffect(() => {
    if (navigationType === 'POP' && !ALWAYS_TOP.some((re) => re.test(pathname))) return
    scrollWindowTop()
    // 레이아웃·이미지·폰트가 늦게 들어와 높이가 변해도 첫 프레임은 맨 위를 보게 한다
    const raf = requestAnimationFrame(scrollWindowTop)
    return () => cancelAnimationFrame(raf)
  }, [pathname, navigationType])

  return null
}
