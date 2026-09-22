import { useState } from 'react'
import { Link } from 'react-router-dom'

const LOGO_LIGHT = '/brand/mirae-ai-lab-logo-transparent.png'
const LOGO_DARK = '/brand/mirae-ai-lab-logo-light.png'

/** 미래AI랩 로고 — 홈페이지와 같은 자산. 화면 명칭은 "AX 미팅 가이드" 를 우선 쓴다. */
export function BrandLogo({ tone = 'light', subtitle, compact = false }: { tone?: 'light' | 'dark'; subtitle?: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <Link to="/" aria-label="AX 미팅 가이드 홈" className="inline-flex min-w-0 flex-col items-start">
      <span className="inline-flex items-center gap-2">
        {!failed ? (
          <img src={tone === 'dark' ? LOGO_DARK : LOGO_LIGHT} alt="미래에이아이랩" width={828} height={250} onError={() => setFailed(true)} className={`${compact ? 'h-7' : 'h-9'} w-auto object-contain`} />
        ) : (
          <span className={`text-[1.05rem] font-black ${tone === 'dark' ? 'text-white' : 'text-ink-900'}`}>미래AI랩</span>
        )}
      </span>
      {subtitle && <span className={`t-meta mt-0.5 font-bold tracking-wide ${tone === 'dark' ? 'text-accent-200' : 'text-accent-700'}`}>{subtitle}</span>}
    </Link>
  )
}
