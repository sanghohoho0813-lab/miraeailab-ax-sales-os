/**
 * 홈페이지 3분 AX Fit 사전진단 → Partner OS 질문 미리 채우기.
 * 같은 내용을 다시 묻지 않는다. 미리 채운 답은 source='diagnosis'(🟡 추정) 로 두고,
 * 컨설턴트가 [그대로 확인] 을 누르면 source='consultant'(✅ 확인) 이 된다.
 */
import type { Degree, DiagnosisSnapshot, Question } from '../types/domain'
import { DIAGNOSIS_DEGREE_LABEL, DIAGNOSIS_QUESTION_LABEL } from '../content/labels'

const DIAG_VALUE: Record<string, number> = { no: 0, sometimes: 1, often: 2, always: 3 }

function diagIntensity(d: DiagnosisSnapshot, key: string): number | null {
  const v = d.answers[key]
  if (typeof v !== 'string') return null
  return DIAG_VALUE[v] ?? null
}

function avgIntensity(d: DiagnosisSnapshot, keys: string[]): number | null {
  const vals = keys.map((k) => DIAG_VALUE[d.answers[k] ?? ''] ?? null).filter((v): v is number => v !== null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function toDegree(n: number): Degree {
  if (n >= 2.5) return 'very_high'
  if (n >= 1.5) return 'high'
  if (n >= 0.5) return 'mid'
  return 'low'
}

export interface Prefill {
  value: string
  /** "대표님이 사전진단에서 …라고 체크했습니다" */
  note: string
}

/** 질문 하나에 대한 사전진단 미리채움 (없으면 null) */
export function prefillFromDiagnosis(question: Question, d: DiagnosisSnapshot | null): Prefill | null {
  if (!d || !question.diagnosisKeys?.length) return null
  const keys = question.diagnosisKeys.filter((k) => typeof d.answers[k] === 'string')
  if (!keys.length) return null
  const note = keys
    .map((k) => `'${DIAGNOSIS_QUESTION_LABEL[k] ?? k}' → ${DIAGNOSIS_DEGREE_LABEL[d.answers[k]] ?? d.answers[k]}`)
    .join(' · ')
  const noteText = `대표님이 사전진단에서 ${note} 라고 체크했습니다.`

  switch (question.id) {
    case 'current_system': {
      const u = DIAG_VALUE[d.answers.uniqueWork ?? ''] ?? null
      if (u === null || u < 2) return null
      return { value: 'partial', note: noteText }
    }
    case 'data_potential': {
      const u = DIAG_VALUE[d.answers.dataUnused ?? ''] ?? null
      if (u === null || u < 2) return null
      return { value: 'scattered', note: noteText }
    }
    case 'internal_owner': {
      const v = d.answers.internalOwner
      if (v === 'dedicated' || v === 'partTime' || v === 'ceo' || v === 'none') return { value: v, note: noteText }
      return null
    }
    case 'customer_mgmt':
      return null // 관리 방식은 진단으로 알 수 없다 — 힌트만 보여준다
    default: {
      const avg = avgIntensity(d, keys)
      if (avg === null) return null
      return { value: toDegree(avg), note: noteText }
    }
  }
}

/** 사전진단 힌트만 (미리 채우지 않는 질문용) */
export function diagnosisHint(question: Question, d: DiagnosisSnapshot | null): string | null {
  if (!d || !question.diagnosisKeys?.length) return null
  const keys = question.diagnosisKeys.filter((k) => typeof d.answers[k] === 'string')
  if (!keys.length) return null
  return `사전진단: ${keys.map((k) => `${DIAGNOSIS_QUESTION_LABEL[k] ?? k} → ${DIAGNOSIS_DEGREE_LABEL[d.answers[k]] ?? d.answers[k]}`).join(' · ')}`
}

/** 브리핑용 — 사전진단에서 강하게 체크된 항목 라벨 (강도 순) */
export function diagnosisHighlights(d: DiagnosisSnapshot | null, max = 3): { key: string; label: string; degree: string; intensity: number }[] {
  if (!d) return []
  return Object.keys(DIAGNOSIS_QUESTION_LABEL)
    .filter((k) => k !== 'internalOwner')
    .map((k) => ({ key: k, intensity: diagIntensity(d, k) ?? -1 }))
    .filter((x) => x.intensity >= 2)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, max)
    .map((x) => ({ key: x.key, label: DIAGNOSIS_QUESTION_LABEL[x.key], degree: DIAGNOSIS_DEGREE_LABEL[d.answers[x.key]] ?? '', intensity: x.intensity }))
}
