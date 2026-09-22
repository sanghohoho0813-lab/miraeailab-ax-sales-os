/**
 * 390px 폰 프레임 — 같은 앱을 iframe 으로 띄운다(같은 라우트·같은 저장소·같은 로그인).
 * 부모 ↔ 프레임 사이의 라우트를 postMessage 로 맞춘다. 프레임 안에서는 다시 프레임을 만들지 않는다.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const NAV_MSG = 'axpartner:navigate'
type NavMsg = { type: typeof NAV_MSG; path: string }

function isNavMsg(d: unknown): d is NavMsg {
  return typeof d === 'object' && d !== null && (d as NavMsg).type === NAV_MSG && typeof (d as NavMsg).path === 'string'
}

export function DeviceFrame({ className = '' }: { className?: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const ref = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => `${location.pathname}${location.search}${location.search ? '&' : '?'}frame=mobile`)
  const current = `${location.pathname}${location.search}`

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

  return (
    <div className={`phone-frame ${className}`} data-testid="device-frame">
      <iframe ref={ref} src={src} title="모바일 미리보기 (390px)" />
    </div>
  )
}

/** 프레임 안에서 실행될 때 — 부모와 라우트를 맞춘다 */
export function FrameSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = `${location.pathname}${location.search.replace(/[?&]frame=mobile/, '').replace(/^&/, '?')}`
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
