/** 2차 제안 요청 — 상태(전달 완료 → 검토중 → 2차 제안 준비중 → 제안 준비완료) + 전달된 구조화 데이터. 파트너는 본인 건만, 마스터는 전체. */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Handoff } from '../types/domain'
import { Badge, Disclosure, EvidenceBadge, FlatSection, LevelBadge, Section, SkeletonList } from '../components/ui'
import { AREA_LABEL, HANDOFF_STATUS_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, LEVEL_KO, TRADE_LABEL, VALUE_AREA_LABEL, VALUE_AREA_ORDER } from '../content/labels'
import { getDataModeConfig } from '../data/dataMode'
import { formatDate } from '../lib/util'

const STEPS: Handoff['status'][] = ['submitted', 'received', 'reviewing', 'proposal_ready']
const STEP_DESC: Record<string, string> = {
  submitted: '운영 OS 이벤트함에 등록됨',
  received: '김상호 대표가 확인 중',
  reviewing: '고객사 연결 · 2차 제안 작성 중',
  proposal_ready: '2차 제안 준비 완료',
}

export default function HandoffPage() {
  const { user, repo } = useSession()
  const { handoffId } = useParams()
  const [h, setH] = useState<Handoff | null | undefined>(undefined)

  useEffect(() => {
    if (!handoffId) return
    repo.getHandoff(user, handoffId).then(setH)
    document.title = '2차 제안 요청 · AX Partner OS'
  }, [handoffId, repo, user])

  if (h === undefined) return <SkeletonList rows={2} />
  if (!h) return <p className="t-body text-ink-500">전달 내역을 찾을 수 없습니다.</p>
  const p = h.payload
  const stepIdx = Math.max(0, STEPS.indexOf(h.status))
  const opsUrl = getDataModeConfig().opsOsUrl

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <section className="reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/meetings/${h.meetingId}/result`} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> 미팅 분석
          </Link>
          {user.role === 'master' && opsUrl && (
            <a href={`${opsUrl.replace(/\/$/, '')}/ops/inbox`} target="_blank" rel="noreferrer" className="btn inline-flex h-11 items-center gap-2 rounded-(--radius-control) border border-line-strong bg-white px-4 font-semibold hover:bg-paper-2">
              <ExternalLink aria-hidden="true" className="size-4" /> 운영 OS 이벤트함 열기
            </a>
          )}
        </div>
        <p className="mt-3 inline-flex items-center gap-2 text-[1.2rem] font-black text-ok-700">
          <CheckCircle2 aria-hidden="true" className="size-7" /> 미래AI랩 운영 OS에 전달되었습니다.
        </p>
        <h1 className="t-page mt-1">{p.company.name} · 2차 제안 요청</h1>
        <p className="t-sub mt-1 text-ink-500">
          담당 {p.consultant.name} · 미팅 {formatDate(p.meetingDate, true)} · 전달 {formatDate(h.submittedAt, true) || '-'}
        </p>

        {/* 상태 타임라인 */}
        <ol className="mt-6 grid gap-2 sm:grid-cols-4" aria-label="전달 상태" data-testid="handoff-status">
          {STEPS.map((s, i) => {
            const done = i < stepIdx
            const cur = i === stepIdx
            return (
              <li key={s} className={`relative rounded-(--radius-card) border px-4 py-3 ${cur ? 'border-accent-600 bg-accent-50' : done ? 'border-ok-600/40 bg-ok-50/60' : 'border-line bg-white text-ink-300'}`} aria-current={cur ? 'step' : undefined}>
                <p className="tnum t-meta font-black">
                  {done ? '✓' : i + 1} <span className="ml-1 tracking-wide">{cur ? '현재' : done ? '완료' : '대기'}</span>
                </p>
                <p className={`text-[1.05rem] font-bold ${cur ? 'text-ink-900' : done ? 'text-ok-700' : ''}`}>{HANDOFF_STATUS_LABEL[s]}</p>
                <p className={`t-meta ${cur || done ? 'text-ink-500' : ''}`}>{STEP_DESC[s]}</p>
              </li>
            )
          })}
        </ol>
        <dl className="t-sub mt-3 flex flex-wrap gap-x-6 gap-y-1 text-ink-700">
          <div>
            <dt className="inline font-bold">운영 OS 이벤트 · </dt>
            <dd className="inline">{h.customerEventId ? <Badge tone="ok">등록됨 {h.customerEventId.slice(0, 8)}…</Badge> : <Badge tone="warn">대기</Badge>}</dd>
          </div>
          {h.operationsClientId && (
            <div>
              <dt className="inline font-bold">운영 OS 고객사 · </dt>
              <dd className="inline">{h.operationsClientId}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="기업 기본정보">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{INDUSTRY_LABEL[p.company.industry]}</Badge>
            <Badge>{HEADCOUNT_LABEL[p.company.headcount]}</Badge>
            <Badge>{TRADE_LABEL[p.company.tradeType]}</Badge>
            {p.company.interests.map((i) => (
              <Badge key={i} tone="accent">
                {INTEREST_LABEL[i]}
              </Badge>
            ))}
            {p.diagnosis && <Badge tone="info">사전진단 연결</Badge>}
          </div>
          {(p.company.representativeName || p.company.phone) && (
            <p className="t-sub mt-2 text-ink-700">
              {p.company.representativeName} {p.company.phone}
            </p>
          )}
          {p.keyQuotes.length > 0 && (
            <div className="mt-4 space-y-2">
              {p.keyQuotes.map((q) => (
                <blockquote key={q} className="t-body rounded-r-(--radius-control) border-l-4 border-accent-600 bg-paper-2 px-4 py-3 font-semibold">
                  “{q}”
                </blockquote>
              ))}
            </div>
          )}
        </Section>

        <Section title="핵심 문제와 범위 가설">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="accent">AX 필요도 {LEVEL_KO[p.recommendedAxScope.axNeed]}</Badge>
            <Badge tone="info">
              LEVEL {p.recommendedAxScope.scopeLevel} · {p.recommendedAxScope.scopeLabel}
            </Badge>
            <Badge>실증 {LEVEL_KO[p.recommendedAxScope.validationPotential]}</Badge>
            <Badge>성장자금 준비 {LEVEL_KO[p.recommendedAxScope.fundingReadiness]}</Badge>
          </div>
          <ol className="t-body list-decimal space-y-1.5 pl-6">
            {p.painPoints.map((pp) => (
              <li key={pp.area}>
                <span className="font-bold">{pp.title}</span> <EvidenceBadge status={pp.status} /> <span className="t-sub text-ink-500">({AREA_LABEL[pp.area]})</span>
                <p className="t-sub text-ink-700">
                  ↓ {pp.loss} ↓ {pp.axStructure}
                </p>
              </li>
            ))}
          </ol>
          <p className="t-sub mt-2 text-ink-700">{p.recommendedAxScope.scopeReason}</p>
        </Section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="가치 가능 영역">
          <ul className="t-sub space-y-1.5">
            {VALUE_AREA_ORDER.map((k) => (
              <li key={k} className="flex items-center justify-between">
                {VALUE_AREA_LABEL[k]} <LevelBadge level={p.valuePotential[k]} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="추가 확인 · 자금 관심">
          <ol className="t-body list-decimal space-y-1 pl-6">
            {p.followupQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="t-sub mt-3 text-ink-700">
            정책자금/정부지원 관심: <span className="font-bold">{p.fundingInterest.note}</span>
          </p>
        </Section>
      </div>

      <FlatSection title="답변 원본 · 사실 구분" sub="현장에서 클릭한 그대로. AI 분석이 덮어쓰지 않습니다.">
        <div className="space-y-3 rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
          <Disclosure label={`답변 원본 ${p.answers.length}개 보기`}>
            <ul className="t-sub divide-y divide-line">
              {p.answers.map((an) => (
                <li key={an.questionId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-ink-700">{an.question}</span>
                  <span className="font-bold">
                    {an.answerLabel} {an.source === 'diagnosis' && <Badge tone="warn">사전진단</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['confirmed', p.confirmedFacts],
                ['assumed', p.assumptions],
                ['unknown', p.unknownItems],
              ] as const
            ).map(([status, facts]) => (
              <div key={status}>
                <EvidenceBadge status={status} />
                <ul className="t-sub mt-2 space-y-1">
                  {facts.map((f) => (
                    <li key={f.key}>
                      <span className="font-bold">{f.label}</span> · {f.value}
                    </li>
                  ))}
                  {facts.length === 0 && <li className="text-ink-500">없음</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </FlatSection>

      {(p.internalNotes || p.clientSafeSummary.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="INTERNAL — 내부 메모" className="border-danger-600/20">
            <p className="t-body whitespace-pre-wrap text-ink-700">{p.internalNotes || '없음'}</p>
          </Section>
          <Section title="CLIENT SAFE — 고객 문서용 문장" className="border-ok-600/30">
            <ul className="t-body list-disc space-y-1 pl-5">
              {p.clientSafeSummary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  )
}
