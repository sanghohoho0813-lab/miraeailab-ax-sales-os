import { useState } from 'react'
import { Link } from 'react-router-dom'

const LOGO_LIGHT = '/brand/mirae-ai-lab-logo-transparent.png'
const LOGO_DARK = '/brand/mirae-ai-lab-logo-light.png'

/** 미래AI랩 공식 로고 — 홈페이지와 같은 자산. 제품명은 "AX Partner OS". */
export function BrandLogo({
  tone = 'light',
  subtitle = 'AX Partner OS',
  size = 'md',
}: {
  tone?: 'light' | 'dark'
  subtitle?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const h = size === 'lg' ? 'h-12' : size === 'sm' ? 'h-7' : 'h-9'
  return (
    <Link to="/" aria-label="AX Partner OS 홈" className="inline-flex min-w-0 flex-col items-start">
      {!failed ? (
        <img src={tone === 'dark' ? LOGO_DARK : LOGO_LIGHT} alt="미래AI랩" width={828} height={250} onError={() => setFailed(true)} className={`${h} w-auto object-contain`} />
      ) : (
        <span className={`${size === 'lg' ? 'text-[1.4rem]' : 'text-[1.05rem]'} font-black ${tone === 'dark' ? 'text-white' : 'text-ink-900'}`}>미래AI랩</span>
      )}
      {subtitle && <span className={`mt-1 font-bold tracking-wide ${size === 'lg' ? 'text-[0.95rem]' : 't-meta'} ${tone === 'dark' ? 'text-white/70' : 'text-accent-700'}`}>{subtitle}</span>}
    </Link>
  )
}
