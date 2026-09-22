/**
 * PDF — 브랜드 리포트 "1차 AX 미팅 리포트". 큰 글씨, 질문 전부 나열하지 않음(핵심 체크 결과만).
 * 보관·출력·내부공유용. 브라우저 인쇄(PDF 로 저장)로 만든다 — 별도 라이브러리 없음.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Handoff, Meeting } from '../types/domain'
import { Button, SkeletonList } from '../components/ui'
import { QUESTION_BY_ID, optionLabel } from '../content/questions'
import { AREA_LABEL, EVIDENCE_LABEL, FUNDING_TYPE_LABEL, HANDOFF_STATUS_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, LEVEL_KO, TRADE_LABEL } from '../content/labels'
import { formatEok } from '../content/caseText'
import { formatDate } from '../lib/util'

export default function MeetingReportPage() {
  const { user, repo } = useSession()
  const { meetingId } = useParams()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  useEffect(() => {
    if (!meetingId) return
    ;(async () => {
      const m = await repo.getMeeting(user, meetingId)
      if (!m) return
      const [c, cs, h] = await Promise.all([repo.getCompany(user, m.companyId), repo.listCases(user), repo.getHandoffByMeeting(user, m.id)])
      setMeeting(m)
      setCompany(c)
      setCases(cs)
      setHandoff(h)
      document.title = `1차 AX 미팅 리포트 · ${c?.name ?? ''}`
    })()
  }, [meetingId, repo, user])

  if (!meeting || !company) return <SkeletonList rows={3} />
  const a = meeting.analysis
  const similar = a ? a.similarCaseIds.map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c)) : []
  // 체크 결과 — 답한 것 중 강도가 높은 것만 (질문 전체 나열 금지)
  const checks = meeting.questionIds
    .map((qid) => ({ q: QUESTION_BY_ID[qid], an: meeting.answers[qid] }))
    .filter((x) => x.q && x.an && x.an.value !== 'unknown')
    .map((x) => ({ area: AREA_LABEL[x.q.area], label: optionLabel(x.q, x.an!.value), source: x.an!.source, strong: ['very_high', 'high', 'none', 'partial'].includes(x.an!.value) }))
  const strong = checks.filter((c) => c.strong)
  const shown = (strong.length >= 3 ? strong : checks).slice(0, 6)

  return (
    <div className="min-h-dvh bg-paper">
      <div className="no-print mx-auto flex max-w-[860px] items-center justify-between px-4 py-3">
        <Link to={`/meetings/${meeting.id}/result`} className="t-sub text-ink-500 hover:underline">
          ← 미팅 분석
        </Link>
        <Button variant="primary" onClick={() => window.print()} data-testid="print">
          PDF 로 저장 / 인쇄
        </Button>
      </div>
      <article className="print-document mx-auto max-w-[860px] bg-white px-7 py-9 text-[16px] leading-relaxed text-ink-900 sm:px-12" data-testid="report">
        {/* 브랜드 헤더 */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <div>
            <img src="/brand/mirae-ai-lab-logo-transparent.png" alt="미래AI랩" width={828} height={250} className="h-11 w-auto object-contain" />
            <p className="mt-1 text-[12px] font-bold tracking-[0.2em] text-accent-700">AX PARTNER OS · 1차 AX 미팅 리포트</p>
          </div>
          <div className="text-right text-[13px] text-ink-500">
            <p>내부 문서 · {formatDate(new Date().toISOString())}</p>
            <p className="font-bold text-ink-900">{handoff ? `2차 제안 ${HANDOFF_STATUS_LABEL[handoff.status]}` : '2차 제안 요청 전'}</p>
          </div>
        </header>

        <h1 className="mt-6 text-[30px] font-black leading-tight">{company.name}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-4">
          <div>
            <dt className="text-[12px] font-bold text-ink-500">상담 일시</dt>
            <dd className="font-semibold">{formatDate(meeting.endedAt ?? meeting.startedAt ?? meeting.createdAt, true)}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-ink-500">담당</dt>
            <dd className="font-semibold">
              {user.name}
              {user.title ? ` ${user.title}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-ink-500">업종 · 인원</dt>
            <dd className="font-semibold">
              {INDUSTRY_LABEL[company.industry]}
              {company.industryNote ? ` · ${company.industryNote}` : ''} · {HEADCOUNT_LABEL[company.headcount]}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-ink-500">거래 · 관심사</dt>
            <dd className="font-semibold">
              {TRADE_LABEL[company.tradeType]} · {company.interests.map((i) => INTEREST_LABEL[i]).join(', ')}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded border border-danger-600/30 bg-danger-50 px-3 py-1.5 text-[13px] font-semibold text-danger-700">내부용 문서 — 고객에게 그대로 전달하지 않습니다. 고객용 문장은 "고객용 표현" 만 사용합니다.</p>

        {a && (
          <>
            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">01 · 핵심 문제</h2>
            <ol className="mt-2 space-y-3">
              {a.painPoints.map((p) => (
                <li key={p.area} className="avoid-break rounded-lg border border-line p-4">
                  <p className="text-[18px] font-bold">
                    {p.rank}. {p.title} <span className="text-[12px] font-semibold text-ink-500">[{EVIDENCE_LABEL[p.status].icon} {EVIDENCE_LABEL[p.status].label}]</span>
                  </p>
                  <p className="mt-1 text-[15px] text-ink-700">↓ {p.loss}</p>
                  <p className="text-[15px] text-ink-700">↓ {p.axStructure}</p>
                  <p className="mt-1 text-[13px] text-ok-700">고객용 표현: {p.clientSafeTitle}</p>
                </li>
              ))}
              {a.painPoints.length === 0 && <li className="text-ink-500">강한 문제 신호 없음 — 2차 미팅에서 확인</li>}
            </ol>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">02 · 체크 결과 (핵심만)</h2>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {shown.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line/70 py-1 text-[15px]">
                  <span className="text-ink-700">{c.area}</span>
                  <span className="font-bold">
                    {c.label}
                    {c.source === 'diagnosis' && <span className="ml-1 text-[12px] font-semibold text-warn-700">사전진단</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-500">
              전체 {meeting.questionIds.length}문항 중 답변 {Object.keys(meeting.answers).length} · 건너뜀 {meeting.skippedQuestionIds.length} · 어려워함 {meeting.hardQuestionIds.length}
            </p>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">03 · 대표 핵심발언</h2>
            <blockquote className="mt-2 border-l-4 border-accent-600 pl-4 text-[19px] font-semibold leading-snug">“{meeting.keyQuote}”</blockquote>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">04 · 추천 AX 방향</h2>
            <p className="mt-2 text-[17px] font-bold">
              LEVEL {a.scopeLevel} · {a.scopeLabel}
            </p>
            <p className="text-[15px] text-ink-700">{a.scopeReason}</p>
            <p className="mt-1 text-[14px] text-ink-700">
              AX 필요도 <b>{LEVEL_KO[a.axNeed]}</b> · 실증 잠재력 <b>{LEVEL_KO[a.validationPotential]}</b> · 성장자금 활용 준비도 <b>{LEVEL_KO[a.fundingReadiness]}</b>
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
              {a.recommendedStructure.map((s) => (
                <li key={s.problem}>
                  {s.problem} ↓ {s.loss} ↓ <b>{s.structure}</b>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-500">정확한 견적과 3년 Value Map 은 미래AI랩 Master 검토 후 2차 제안에서 확정합니다.</p>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">05 · 추천 연구사례</h2>
            {similar.length === 0 ? (
              <p className="mt-2 text-ink-500">없음</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {similar.map((c) => (
                  <li key={c.id} className="avoid-break rounded-lg border border-line p-3 text-[15px]">
                    <p className="font-bold">
                      {c.companyName} <span className="text-[12px] font-semibold text-ink-500">{c.subIndustry || INDUSTRY_LABEL[c.industry]}</span>
                    </p>
                    {c.problem && <p className="text-ink-700">문제: {c.problem}</p>}
                    {c.axTransition && <p className="text-ink-700">전환: {c.axTransition}</p>}
                    <p className="text-[13px] text-ink-500">
                      {FUNDING_TYPE_LABEL[c.fundingType]}
                      {c.fundingAmountDisclosed != null && ` · 실제 공개금액 ${formatEok(c.fundingAmountDisclosed)}`}
                      {c.fundingProgramMax != null && ` · 제도 한도 ${formatEok(c.fundingProgramMax)}`}
                      {c.year && ` · ${c.year}`} · 출처 {c.source}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[12px] text-ink-500">사례의 자금 결과가 현재 고객에게 같은 결과를 뜻하지 않습니다.</p>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">06 · 추가 확인 (최대 3개)</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[16px] font-semibold">
              {a.followupQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>

            <h2 className="mt-8 text-[13px] font-black tracking-[0.15em] text-accent-700">07 · 2차 제안 상태</h2>
            <p className="mt-2 text-[17px] font-bold">{handoff ? `${HANDOFF_STATUS_LABEL[handoff.status]} · 전달 ${formatDate(handoff.submittedAt, true)}` : '아직 요청하지 않음'}</p>
            <p className="text-[13px] text-ink-500">{handoff ? '김상호 대표의 운영 OS 에서 검토합니다.' : '미팅 분석 화면의 [김상호 대표에게 2차 제안 요청] 으로 보냅니다.'}</p>
          </>
        )}
        <footer className="mt-10 flex items-center justify-between border-t border-line pt-3 text-[11px] text-ink-300">
          <span>미래AI랩 AX Partner OS · 내부 리포트</span>
          <span>이 문서의 표현은 고객용이 아닙니다.</span>
        </footer>
      </article>
    </div>
  )
}
