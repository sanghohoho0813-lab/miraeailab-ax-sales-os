/**
 * 회사가 가진 서류 상태 — 프로필(업로드 이력)에서 계산한다. 새 테이블을 만들지 않았다.
 * 프로필의 sourceName 이 곧 서류 종류다(파서가 docKind 로 넣는다).
 */
import type { CompanyProfile } from '../types/domain'
import { DOC_SPECS, TOOL_SPECS, type DocKey, type ToolId, type ToolSpec } from '../content/documents'

export interface DocStatus {
  key: DocKey
  label: string
  reads: string
  usedBy: string
  sensitive: boolean
  /** 어떤 도구가 이 서류 없이는 결과를 낼 수 없는가 — 없으면 "있으면 좋은" 서류다 */
  required: boolean
  /** 이 서류로 만들어진 프로필 (최신 우선) */
  profiles: CompanyProfile[]
  have: boolean
  uploadedAt: string | null
}

/** 프로필 하나가 어떤 서류인가 */
export function docKeyOf(p: CompanyProfile): DocKey | null {
  const text = `${p.sourceName} ${p.sourceFileName}`
  for (const spec of DOC_SPECS) if (spec.detect.test(text)) return spec.key
  // 파서가 일반 보고서로 읽었으면 기업정보 보고서로 본다
  if (p.sourceType === 'pdf') return 'company_report'
  return null
}

const REQUIRED = new Set<DocKey>(TOOL_SPECS.flatMap((t) => t.needs))

export function documentStatus(profiles: CompanyProfile[]): DocStatus[] {
  const sorted = [...profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return DOC_SPECS.map((spec) => {
    const mine = sorted.filter((p) => docKeyOf(p) === spec.key)
    return { key: spec.key, label: spec.label, reads: spec.reads, usedBy: spec.usedBy, sensitive: Boolean(spec.sensitive), required: REQUIRED.has(spec.key), profiles: mine, have: mine.length > 0, uploadedAt: mine[0]?.createdAt ?? null }
  })
}

export interface ToolStatus {
  spec: ToolSpec
  /** 지금 결과를 낼 수 있는가 */
  ready: boolean
  /** 없어서 못 하는 서류 */
  missing: DocStatus[]
  /** 있으면 더 정확해지는 서류 중 없는 것 */
  wouldHelp: DocStatus[]
}

export function toolStatus(docs: DocStatus[]): ToolStatus[] {
  const by = new Map(docs.map((d) => [d.key, d]))
  return TOOL_SPECS.map((spec) => {
    const missing = spec.needs.map((k) => by.get(k)!).filter((d) => d && !d.have)
    const wouldHelp = spec.helps.map((k) => by.get(k)!).filter((d) => d && !d.have)
    return { spec, ready: missing.length === 0, missing, wouldHelp }
  })
}

/** 아직 올라오지 않은 필수 서류 — 화면에서 눈에 띄게 표시할 대상 */
export function missingRequired(docs: DocStatus[]): DocStatus[] {
  return docs.filter((d) => d.required && !d.have)
}

export type { DocKey, ToolId }
