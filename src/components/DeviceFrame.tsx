/**
 * 가상 뷰포트 프레임 — 같은 앱을 iframe 으로 띄운다(같은 라우트·같은 저장소·같은 로그인).
 * width/height 는 "진짜" 뷰포트 크기이고, 부모가 준 공간에 맞춰 CSS scale 로 축소한다 → 레이아웃이 찌그러지지 않는다.
 * 부모 ↔ 프레임 사이의 라우트를 postMessage 로 맞춘다. 프레임 안에서는 다시 프레임을 만들지 않는다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const NAV_MSG = 'axpartner:navigate'
type NavMsg = { type: typeof NAV_MSG; path: string }

function isNavMsg(d: unknown): d is NavMsg {
  return typeof d === 'object' && d !== null && (d as NavMsg).type === NAV_MSG && typeof (d as NavMsg).path === 'string'
}

export function DeviceFrame({ width, height, kind, className = '', fit = 'width' }: { width: number; height: number; kind: 'pc' | 'mobile'; className?: string; fit?: 'width' | 'both' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const ref = useRef<HTMLIFrameElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [src] = useState(() => `${location.pathname}${location.search}${location.search ? '&' : '?'}frame=${kind}`)
  const current = `${location.pathname}${location.search}`

  // 부모 공간에 맞춰 축소 (확대는 하지 않는다)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      const s = fit === 'both' ? Math.min(1, w / width, h / height) : Math.min(1, w / width)
      setScale(Number.isFinite(s) && s > 0 ? s : 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height, fit])

  // 부모 → 프레임
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ type: NAV_MSG, path: current } satisfies NavMsg, window.location.origin)
  }, [current])
  // 프레임 → 부모
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return
      if (isNavMsg(e.data) && e.data.path !== current) navigate(e.data.path)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [current, navigate])

  const scaledH = Math.round(height * scale)
  return (
    <div ref={boxRef} className={`relative w-full ${className}`} style={{ height: fit === 'both' ? '100%' : scaledH }} data-testid={`device-frame-${kind}`} data-scale={scale.toFixed(3)}>
      <div className={kind === 'mobile' ? 'phone-frame' : 'pc-frame'} style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: fit === 'both' ? '50%' : 0, top: 0, marginLeft: fit === 'both' ? -(width * scale) / 2 : 0 }}>
        <iframe ref={ref} src={src} title={kind === 'mobile' ? '모바일 미리보기 (390px)' : 'PC 미리보기 (1280px)'} style={{ width, height }} />
      </div>
    </div>
  )
}

/** 프레임 안에서 실행될 때 — 부모와 라우트를 맞춘다 */
export function FrameSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = `${location.pathname}${location.search.replace(/[?&]frame=(mobile|pc)/, '').replace(/^&/, '?')}`
  useEffect(() => {
    window.parent.postMessage({ type: NAV_MSG, path: current } satisfies NavMsg, window.location.origin)
  }, [current])
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return
      if (isNavMsg(e.data) && e.data.path !== current) navigate(e.data.path)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [current, navigate])
  return null
}
