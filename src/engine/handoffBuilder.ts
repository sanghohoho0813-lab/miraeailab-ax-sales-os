/**
 * 운영 OS 전달 패킷 — PDF가 아니라 구조화 데이터가 본체다.
 * INTERNAL(내부 표현·메모)과 CLIENT SAFE(고객 문서용 문장)를 분리해서 담는다.
 */
import type { Analysis, CaseStudy, Company, CurrentUser, HandoffPayload, Meeting } from '../types/domain'
import { QUESTION_BY_ID, optionLabel } from '../content/questions'
import { AREA_LABEL } from '../content/labels'
import { recommendCases, shownCases } from './caseMatcher'

export function buildHandoffPayload(company: Company, meeting: Meeting, analysis: Analysis, user: CurrentUser, cases: CaseStudy[]): HandoffPayload {
  const answers = meeting.questionIds
    .map((qid) => {
      const q = QUESTION_BY_ID[qid]
      const a = meeting.answers[qid]
      if (!q) return null
      return {
        questionId: qid,
        area: q.area,
        question: q.title,
        answer: a?.value ?? (meeting.skippedQuestionIds.includes(qid) ? 'skipped' : ''),
        answerLabel: a ? optionLabel(q, a.value) : meeting.skippedQuestionIds.includes(qid) ? '건너뜀' : '미응답',
        source: a?.source ?? 'consultant',
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const rec = recommendCases(cases, company, analysis.painPoints.map((p) => p.area), {
    growthAnswer: meeting.answers.growth_plan?.value ?? null,
    fundingInterest: Boolean(meeting.answers.funding_interest && meeting.answers.funding_interest.value !== 'none' && meeting.answers.funding_interest.value !== 'unknown'),
    areaLabel: (a) => AREA_LABEL[a],
  })
  const similarCases = shownCases(rec).map((m) => ({ id: m.caseStudy.id, companyName: m.caseStudy.companyName, whySimilar: m.whySimilar }))

  const fundingAnswer = meeting.answers.funding_interest?.value ?? ''
  const durationSec = meeting.startedAt && meeting.endedAt ? Math.max(0, Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 1000)) : null

  return {
    version: 1,
    company: {
      name: company.name,
      industry: company.industry,
      industryNote: company.industryNote,
      headcount: company.headcount,
      tradeType: company.tradeType,
      interests: company.interests,
      representativeName: company.representativeName,
      phone: company.phone,
    },
    consultant: { id: user.id, name: user.name, email: user.email },
    meetingDate: meeting.endedAt ?? meeting.startedAt ?? meeting.updatedAt,
    diagnosis: company.diagnosis,
    answers,
    keyQuotes: meeting.keyQuote.trim() ? [meeting.keyQuote.trim()] : [],
    confirmedFacts: analysis.confirmedFacts,
    assumptions: analysis.assumptions,
    unknownItems: analysis.unknowns,
    painPoints: analysis.painPoints,
    recommendedAxScope: {
      axNeed: analysis.axNeed,
      scopeLevel: analysis.scopeLevel,
      scopeLabel: analysis.scopeLabel,
      scopeReason: analysis.scopeReason,
      validationPotential: analysis.validationPotential,
      fundingReadiness: analysis.fundingReadiness,
      structure: analysis.recommendedStructure,
    },
    similarCases,
    valuePotential: analysis.valuePotential,
    fundingInterest: {
      interested: fundingAnswer === 'high' || fundingAnswer === 'some' || fundingAnswer === 'past',
      note: fundingAnswer ? optionLabel(QUESTION_BY_ID.funding_interest, fundingAnswer) : '미확인 (미팅에서 다루지 않음)',
    },
    followupQuestions: analysis.followupQuestions,
    internalNotes: meeting.memo,
    clientSafeSummary: analysis.clientSafeSummary,
    usage: { durationSec, skipped: meeting.skippedQuestionIds.length, hard: meeting.hardQuestionIds.length },
  }
}

/** 운영 OS 이벤트함에 보여 줄 "고객이 제출한 값 + 요약" — 내부 메모·수임 판단은 넣지 않는다 */
export function buildCustomerSafeEventPayload(payload: HandoffPayload): Record<string, unknown> {
  return {
    company_name: payload.company.name,
    representative_name: payload.company.representativeName || undefined,
    phone: payload.company.phone || undefined,
    industry: payload.company.industry,
    headcount: payload.company.headcount,
    trade_type: payload.company.tradeType,
    consultant_name: payload.consultant.name,
    meeting_date: payload.meetingDate,
    ax_need: payload.recommendedAxScope.axNeed,
    scope_level: payload.recommendedAxScope.scopeLevel,
    scope_label: payload.recommendedAxScope.scopeLabel,
    top_problems: payload.painPoints.map((p) => p.clientSafeTitle).join(' · '),
    followup_count: String(payload.followupQuestions.length),
    key_quote: payload.keyQuotes[0],
    source: 'AX Partner OS',
  }
}
