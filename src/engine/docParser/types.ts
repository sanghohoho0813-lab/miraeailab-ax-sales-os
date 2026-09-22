/** 문서 파서 입출력 타입 — pdf.js 텍스트 레이어에서 만든 줄 단위 문서 */
import type { EvidenceField, ProfileFacts } from '../../types/domain'

export interface TextPage {
  page: number
  lines: string[]
}

export interface TextDoc {
  fileName: string
  pageCount: number
  pages: TextPage[]
  /** 전체 글자 수 — 너무 적으면 스캔 PDF(텍스트 레이어 없음) */
  textChars: number
}

export interface ParsedDocument {
  /** 어떤 어댑터가 읽었나 (generic / cretop) */
  adapter: string
  version: string
  /** 문서 종류 표기 (예: '크레탑 기업정보', '기업정보 보고서', '회사소개서') */
  docKind: string
  facts: ProfileFacts
  evidence: EvidenceField[]
  warnings: string[]
  textChars: number
}

/** 어댑터 — 문서 종류를 감지하고 규칙을 보탠다. 실제 샘플이 들어오면 여기만 보강한다 */
export interface DocAdapter {
  id: string
  version: string
  docKind: string
  /** 0~1 — 이 문서가 내 종류일 확률 */
  detect(doc: TextDoc): number
  /** 라벨 별칭 추가 (generic 규칙 위에 얹는다) */
  aliases?: Partial<Record<RuleKey, RegExp[]>>
}

export type RuleKey =
  | 'companyName'
  | 'representativeName'
  | 'phone'
  | 'address'
  | 'foundedAt'
  | 'yearsInBusiness'
  | 'industryText'
  | 'headcount'
  | 'creditNote'
  | 'products'
