/**
 * 미팅 준비 첫 화면 — "업체 정보를 어떻게 가져올까요?" 큰 CTA 3개. PDF가 가장 강조되지만 PDF 없이도 모든 기능이 동작한다.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileText, Mic, Users, Zap } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company } from '../types/domain'
import { INDUSTRY_LABEL } from '../content/labels'
import { formatDate, relativeDay } from '../lib/util'
import { speechSupported } from '../lib/speech'

export default function IntakeStartPage() {
  const { user, repo } = useSession()
  const [recent, setRecent] = useState<Company[] | null>(null)
  useEffect(() => {
    document.title = '미팅 준비 · AX Partner OS'
    let alive = true
    repo.listCompanies(user).then((c) => alive && setRecent(c.slice(0, 5)))
    return () => {
      alive = false
    }
  }, [repo, user])

  return (
    <div className="mx-auto max-w-[760px]">
      <Link to="/" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
        <ArrowLeft aria-hidden="true" className="size-4" /> 홈으로
      </Link>
      <h1 className="t-page mt-3">업체 정보를 어떻게 가져올까요?</h1>
      <p className="t-body mt-2 text-ink-500">PDF 하나 또는 몇 번의 클릭이면 오늘의 접근 전략 · 실제 사례 · 질문 · 멘트까지 자동으로 준비됩니다.</p>

      <div className="mt-6 grid gap-3">
        <Link to="/companies/new/pdf" className="btn tap group flex items-center gap-4 rounded-(--radius-card) border-2 border-accent-600 bg-accent-50 p-5 text-left hover:bg-accent-100" data-testid="intake-pdf">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white">
            <FileText aria-hidden="true" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.25rem] font-black leading-tight">PDF로 1분 준비</span>
            <span className="t-sub mt-1 block text-ink-700">기업정보·크레탑·회사소개서 PDF → 업체정보 자동 구조화 → 확인만 하면 전략까지</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-accent-700" />
        </Link>
        <Link to="/companies/new/quick" className="btn tap flex items-center gap-4 rounded-(--radius-card) border border-line bg-white p-5 text-left hover:bg-paper-2" data-testid="intake-quick">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-900">
            <Zap aria-hidden="true" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.2rem] font-black leading-tight">30초 빠른 등록</span>
            <span className="t-sub mt-1 block text-ink-500">회사명만 적고 나머지는 클릭{speechSupported() ? ' · 음성으로 한 번에 입력 가능' : ''}</span>
          </span>
          {speechSupported() ? <Mic aria-hidden="true" className="size-5 shrink-0 text-ink-300" /> : <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-ink-300" />}
        </Link>
        <Link to="/companies" className="btn tap flex items-center gap-4 rounded-(--radius-card) border border-line bg-white p-5 text-left hover:bg-paper-2" data-testid="intake-existing">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-900">
            <Users aria-hidden="true" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.2rem] font-black leading-tight">기존 고객 선택</span>
            <span className="t-sub mt-1 block text-ink-500">이미 등록한 고객의 전략 화면으로 바로</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-ink-300" />
        </Link>
      </div>

      {recent && recent.length > 0 && (
        <section className="mt-8">
          <p className="t-section">최근 고객</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {recent.map((c) => (
              <li key={c.id}>
                <Link to={`/companies/${c.id}`} className="nav-item tap flex items-center gap-3 px-4 py-3 hover:bg-paper-2" data-testid="recent-company">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="t-meta block text-ink-500">
                      {INDUSTRY_LABEL[c.industry]}
                      {c.meetingAt ? ` · ${relativeDay(c.meetingAt)} ${formatDate(c.meetingAt, true)}` : ''}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
