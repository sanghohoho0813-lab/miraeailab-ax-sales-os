/**
 * 정책보증·융자 공개 사례 (미래AI랩 리서치 2026-09-28 기준).
 *
 * 원 자료가 거듭 강조하는 것을 데이터 구조로 옮겼다: **"최대 ○억" 은 제도 한도지 실제 대출 실행액이 아니다.**
 *   disclosed   — 공개 원문에 개별 확보·승인·보증액이 적힌 것 (상담에서 "○억 확보" 라고 말할 수 있다)
 *   planned     — "지원 예정" 표현 (아직 실행이 아니다)
 *   program_cap — 선정 사실 + 제도 공통 최대한도만 (이 회사가 그 금액을 받았다는 뜻이 절대 아니다)
 *
 * 수록 범위: 기업별 금액·한도가 공개자료에 명시된 건 + 2·3·4차 검증 신규 건.
 * 혁신아이콘(26) · 예비유니콘(30) · 유니콘브릿지(50) 106건은 전부 공통 최대한도(100~200억)만 공개돼
 * 5~30명 중소기업 상담에 쓸 수 없어 넣지 않았다. 업종 커버리지가 필요해지면 그때 추가한다.
 */
import type { Industry } from '../types/domain'
import raw from './funding-cases.json'

export type AmountKind = 'disclosed' | 'planned' | 'program_cap'
export type FundingForm = 'guarantee' | 'loan' | 'rnd' | 'mixed'

export interface FundingCase {
  id: string
  year: number
  companyName: string
  /** 원문 업종 표기 — "AI·세일즈 SaaS" 처럼 세분화돼 있어 키워드 매칭의 핵심이다 */
  industryText: string
  industry: Industry
  program: string
  institutionCode: string
  institutionLabel: string
  fundingForm: FundingForm
  amountText: string
  amountKrw: number | null
  amountKind: AmountKind
  /** 공개 상태 원문 — 화면에 그대로 보여 준다 */
  disclosure: string
  section: string
}

export const FUNDING_CASES: FundingCase[] = raw as FundingCase[]

export const AMOUNT_KIND_LABEL: Record<AmountKind, string> = {
  disclosed: '확보 금액',
  planned: '지원 예정',
  program_cap: '제도 한도',
}
/** 화면에서 한 줄로 경고할 문구 — 제도 한도를 실제 받은 돈으로 읽지 않게 */
export const AMOUNT_KIND_NOTE: Record<AmountKind, string> = {
  disclosed: '공개 원문에 적힌 확보·승인 금액',
  planned: '지원 예정으로 발표된 금액 (실행 여부 별도)',
  program_cap: '선정 사실 + 제도 공통 한도 — 이 회사가 받은 금액이 아닙니다',
}

export const FUNDING_FORM_LABEL: Record<FundingForm, string> = {
  guarantee: '보증',
  loan: '융자',
  rnd: 'R&D',
  mixed: '보증+융자',
}
