/**
 * PDF — "1차 AX 미팅 내부 리포트". 보관·출력·외부공유용. 고객에게 자동 발송하지 않는다.
 * 브라우저 인쇄(PDF 로 저장)로 만든다 — 별도 라이브러리 없음.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Meeting } from '../types/domain'
import { Button, Spinner } from '../components/ui'
import { QUESTION_BY_ID, optionLabel } from '../content/questions'
import { AREA_LABEL, EVIDENCE_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, LEVEL_KO, TRADE_LABEL, VALUE_AREA_LABEL, VALUE_AREA_ORDER } from '../content/labels'
import { formatDate } from '../lib/util'

export default function MeetingReportPage() {
  const { user, repo } = useSession()
  const { meetingId } = useParams()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])

  useEffect(() => {
    if (!meetingId) return
    ;(async () => {
      const m = await repo.getMeeting(user, meetingId)
      if (!m) return
      const [c, cs] = await Promise.all([repo.getCompany(user, m.companyId), repo.listCases(user)])
      setMeeting(m)
      setCompany(c)
      setCases(cs)
      document.title = `1차 AX 미팅 내부 리포트 · ${c?.name ?? ''}`
    })()
  }, [meetingId, repo, user])

  if (!meeting || !company) return <Spinner />
  const a = meeting.analysis
  const similar = a ? a.similarCaseIds.map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c)) : []

  return (
    <div className="min-h-dvh bg-paper">
      <div className="no-print mx-auto flex max-w-[820px] items-center justify-between px-4 py-3">
        <Link to={`/meetings/${meeting.id}/result`} className="t-sub text-ink-500 hover:underline">
          ← 분석 화면
        </Link>
        <Button variant="primary" onClick={() => window.print()} data-testid="print">
          PDF 로 저장 / 인쇄
        </Button>
      </div>
      <article className="print-document mx-auto max-w-[820px] bg-white px-6 py-8 text-[15px] leading-relaxed text-ink-900 sm:px-10">
        <p className="text-[11px] font-bold tracking-[0.2em] text-accent-700">MIRAE AI LAB · AX PARTNER OS · INTERNAL</p>
        <h1 className="mt-1 text-[24px] font-black">1차 AX 미팅 내부 리포트</h1>
        <p className="mt-1 text-ink-500">
          {company.name} · 미팅 {formatDate(meeting.endedAt ?? meeting.startedAt ?? meeting.createdAt, true)} · 담당 {user.name} · 작성 {formatDate(new Date().toISOString(), true)}
        </p>
        <p className="mt-2 rounded border border-danger-600/30 bg-danger-50 px-3 py-1.5 text-[13px] font-semibold text-danger-700">내부용 문서 — 고객에게 그대로 전달하지 않습니다. 고객용 문장은 "CLIENT SAFE" 항목만 사용합니다.</p>

        <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">1. 기업 기본정보</h2>
        <table className="mt-2 w-full text-[14px]">
          <tbody>
            <tr>
              <td className="w-32 py-1 font-bold text-ink-500">업종</td>
              <td>{INDUSTRY_LABEL[company.industry]}{company.industryNote ? ` · ${company.industryNote}` : ''}</td>
            </tr>
            <tr>
              <td className="py-1 font-bold text-ink-500">인원 / 거래형태</td>
              <td>
                {HEADCOUNT_LABEL[company.headcount]} / {TRADE_LABEL[company.tradeType]}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-bold text-ink-500">대표 관심사</td>
              <td>{company.interests.map((i) => INTEREST_LABEL[i]).join(', ')}</td>
            </tr>
            {company.diagnosis && (
              <tr>
                <td className="py-1 font-bold text-ink-500">사전진단</td>
                <td>홈페이지 3분 AX Fit 연결 (등급 {company.diagnosis.grade ?? '-'}) — 🟡 추정</td>
              </tr>
            )}
          </tbody>
        </table>

        {a && (
          <>
            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">2. 핵심 문제 TOP 3</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {a.painPoints.map((p) => (
                <li key={p.area} className="avoid-break">
                  <span className="font-bold">{p.title}</span> <span className="text-[12px] text-ink-500">[{EVIDENCE_LABEL[p.status].icon} {EVIDENCE_LABEL[p.status].label}]</span>
                  <div className="text-[14px] text-ink-700">
                    ↓ {p.loss}
                    <br />↓ {p.axStructure}
                  </div>
                  <div className="text-[13px] text-ok-700">CLIENT SAFE: {p.clientSafeTitle}</div>
                </li>
              ))}
            </ol>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">3. 체크 결과</h2>
            <table className="mt-2 w-full text-[13.5px]">
              <tbody>
                {meeting.questionIds.map((qid) => {
                  const q = QUESTION_BY_ID[qid]
                  const an = meeting.answers[qid]
                  if (!q) return null
                  return (
                    <tr key={qid} className="border-b border-line/70">
                      <td className="w-36 py-1 align-top font-bold text-ink-500">{AREA_LABEL[q.area]}</td>
                      <td className="py-1 align-top">{q.title}</td>
                      <td className="w-40 py-1 align-top font-bold">
                        {an ? optionLabel(q, an.value) : meeting.skippedQuestionIds.includes(qid) ? '건너뜀' : '미응답'}
                        {an?.source === 'diagnosis' && ' (사전진단)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">4. 대표 핵심발언</h2>
            <blockquote className="mt-2 border-l-4 border-accent-600 pl-3 font-semibold">“{meeting.keyQuote}”</blockquote>
            {meeting.memo && <p className="mt-1 text-[13px] text-ink-500">내부 메모: {meeting.memo}</p>}

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">5. 예상 AX 구조 (범위 가설)</h2>
            <p className="mt-2">
              AX 필요도 <b>{LEVEL_KO[a.axNeed]}</b> · 예상 구축범위 <b>LEVEL {a.scopeLevel} · {a.scopeLabel}</b> · 실증 잠재력 <b>{LEVEL_KO[a.validationPotential]}</b> · 성장자금 활용 준비도 <b>{LEVEL_KO[a.fundingReadiness]}</b>
            </p>
            <p className="mt-1 text-[14px] text-ink-700">{a.scopeReason}</p>
            <ul className="mt-2 list-disc pl-5 text-[14px]">
              {a.recommendedStructure.map((s) => (
                <li key={s.problem}>
                  {s.problem} ↓ {s.loss} ↓ <b>{s.structure}</b>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-500">정확한 견적과 3년 Value Map 은 미래AI랩 Master 검토 후 2차 제안에서 확정합니다.</p>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">6. 유사사례</h2>
            {similar.length === 0 ? (
              <p className="mt-2 text-ink-500">없음</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {similar.map((c) => (
                  <li key={c.id} className="avoid-break">
                    <b>{c.companyName}</b> ({INDUSTRY_LABEL[c.industry]}) — {c.problem} → {c.axTransition}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[12px] text-ink-500">사례의 자금 결과가 현재 고객에게 같은 결과를 뜻하지 않습니다.</p>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">7. 가치 가능영역</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 text-[14px]">
              {VALUE_AREA_ORDER.map((k) => (
                <li key={k} className="flex justify-between border-b border-line/60 py-0.5">
                  <span>{VALUE_AREA_LABEL[k]}</span>
                  <b>{LEVEL_KO[a.valuePotential[k]]}</b>
                </li>
              ))}
            </ul>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">8. 추가 확인사항</h2>
            <ol className="mt-2 list-decimal pl-5">
              {a.followupQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>

            <h2 className="mt-6 border-b border-line pb-1 text-[17px] font-bold">9. 사실 · 추정 · 미확인</h2>
            <div className="mt-2 grid grid-cols-3 gap-3 text-[13px]">
              {(
                [
                  ['confirmed', a.confirmedFacts],
                  ['assumed', a.assumptions],
                  ['unknown', a.unknowns],
                ] as const
              ).map(([s, facts]) => (
                <div key={s}>
                  <p className="font-bold">
                    {EVIDENCE_LABEL[s].icon} {EVIDENCE_LABEL[s].label}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {facts.map((f) => (
                      <li key={f.key}>
                        {f.label}: {f.value}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mt-8 text-[11px] text-ink-300">미래AI랩 AX Partner OS · 내부 리포트 · 이 문서의 표현은 고객용이 아닙니다.</p>
      </article>
    </div>
  )
}
