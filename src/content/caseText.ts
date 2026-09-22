/**
 * 리서치 사례의 "영업에서 이렇게 설명" · "주의" 문장을 사실 필드에서만 조립한다.
 * 문장은 파싱된 사실(문제·전환·실증·금액·자금형태·연도)과 PDF 의 금액대 프레임만 사용하고, 없는 사실을 만들지 않는다.
 */
import type { CaseStudy, FundingType } from '../types/domain'

export const CASE_DISCLAIMER =
  '이 업체가 받은 금액이 현재 고객도 같은 금액을 받을 수 있다는 의미는 아닙니다. 승인 여부와 한도는 기업의 재무상태·신용·업력·자금 용도와 신청 시점의 제도에 따라 달라집니다.'

export const AX_GRADE_LABEL: Record<'A' | 'B' | 'C', string> = {
  A: 'AX·플랫폼·데이터 전환형',
  B: '현장 자동화·로봇·디바이스형',
  C: '제품·브랜드 사업화형(AX 확장 여지)',
}

/** 리서치 PDF 의 금액대 프레임(p.11 하단) — 그대로 인용 */
export const AMOUNT_BAND_FRAME: Record<string, string> = {
  '1~4억': '작은 문제를 실제 시스템·제품으로 바꾸고, 첫 고객·첫 실증·첫 매출 같은 초기 증거가 나타나는 단계',
  '5~9억': '반복 사용과 데이터가 쌓이고, 자동화에서 AI 추천·예측·플랫폼으로 고도화되는 단계',
}
export const AMOUNT_BAND_OVER = '매출·사용자·시험 적용(PoC)·공급계약·인증 같은 외부 증거와, 다른 고객·지역으로 확장 가능한 구조가 중요해지는 단계'

/** 리서치 PDF 의 업종별 AX/SW 전환 경로 (10억 미만 특별 인덱스 각 페이지 상단) */
export const TRANSITION_PATH: Record<string, string> = {
  '제조·가공·산업자동화': '견적/BOM → 생산계획 → 품질·검사 → 설비이력 → 예지정비·수요예측 → 외부 생산운영 OS',
  '도매·유통·무역·커머스': '견적·주문 → 재고·발주 → 배송·정산 → 고객 데이터 → 추천·수요예측 → 거래처 포털',
  '식품제조·외식·프랜차이즈': '주문·레시피·원가 → 생산·위생 → 재고·발주 → 가맹·고객 데이터 → 수요예측·추천',
  '화장품·뷰티·퍼스널케어': '상품·고객 데이터 → 주문·CS → 콘텐츠·마케팅 → 개인화 추천 → 브랜드 플랫폼',
  '건설·인테리어·시설·공간': '견적·적산 → 공정·현장 → 자재·인력 → 안전·품질 → 사후관리 → 현장 운영 플랫폼',
  '물류·운송·창고': '입고·피킹·출고 → 배차·경로 → 차량·기사 → ETA·클레임 → WMS/TMS → 수요·적재·납기 예측',
  '자동차·정비·모빌리티': '차량·정비이력 → 부품 → 견적 → 예약·작업 → 진단 → 부품·정비 추천 → 정비소/차량 운영 OS',
  '농업·화훼·스마트팜': '재배·환경 데이터 → 생육·수확 → 유통·주문 → 예측·자동제어 → 산지 플랫폼',
  '축산·수산·양식': '사육·환경 데이터 → 질병·급이 → 출하·유통 → 예측·추적 → 산지 플랫폼',
  '환경·폐기물·자원·에너지': '수거·투입 → 선별·처리 → 물질수지 → 에너지·배출 → 추적·증빙 → 규제/운영 플랫폼',
  '패션·섬유·리세일': '상품·재고 → 주문·판매 → 고객·리세일 데이터 → 추천·소싱 → 브랜드 플랫폼',
  '숙박·관광·레저': '예약·객실·가격 → 청소·시설 → 고객 CRM → 수익관리 → PMS/CMS·추천·여정 플랫폼',
  '렌털·유지관리·A/S': '계약·자산 → 설치 → 점검·고장 → 부품·A/S → 재계약 → 자산 SaaS·예측정비',
  '교육·학원·훈련': '상담·등록 → 출결·학습 → 평가 → 추천 → LMS·AI 코치·학부모/기업 포털',
  '생활·로컬서비스': '예약·매칭 → 배차·현장작업 → 서비스기록 → CS·결제 → 품질 → 지역 서비스 운영 플랫폼',
  '의료·헬스·반려동물': '예약·접수 → 진료·기록 → 처방·정산 → 환자·보호자 데이터 → 리마인드·추천 → 환자 포털',
  '기타 B2B 소프트웨어': '업무 데이터 → 반복업무 자동화 → 분석·추천 → 고객 포털 → 구독 SaaS',
}

const FUND_LABEL: Record<FundingType, string> = {
  private_investment: '민간투자',
  guarantee: '보증',
  policy_loan: '정책융자·정책기관',
  gov_rnd: '정부 R&D',
  commercialization: '사업화지원',
  employment_subsidy: '고용지원금',
  mixed: '혼합조달',
  none: '자금조달 없음',
  unknown: '자금유형 미확인',
}

export function formatEok(won: number | null | undefined): string {
  if (won === null || won === undefined) return ''
  const eok = won / 100_000_000
  return `${Number.isInteger(eok) ? eok : Math.round(eok * 10) / 10}억`
}

export function caseTalkingPoints(c: CaseStudy): string[] {
  const pts: string[] = []
  const free = c.narrativeKind === 'free'
  if (c.problem) pts.push(`${free ? '상황' : '문제'}: ${c.problem.slice(0, 90)}`)
  if (c.axTransition) pts.push(`전환: ${c.axTransition.slice(0, 100)}`)
  if (c.validation) pts.push(`실증: ${c.validation.slice(0, 90)}`)
  const actual = c.fundingAmountDisclosed
  const limit = c.fundingProgramMax
  if (actual !== null && actual !== undefined) {
    pts.push(`조달: ${c.year ? `${c.year}년 · ` : ''}${c.fundingForm || FUND_LABEL[c.fundingType]} · ${formatEok(actual)} (공개자료 기준). 이 회사의 결과이지 우리 고객의 약속이 아닙니다.`)
  } else if (limit !== null && limit !== undefined) {
    pts.push(`조달: 공개된 것은 제도상 한도(${formatEok(limit)})뿐이며 실제 수령액은 확인되지 않았습니다.`)
  }
  const band = c.amountBand ?? ''
  if (AMOUNT_BAND_FRAME[band]) pts.push(`구간: ${band} — ${AMOUNT_BAND_FRAME[band]}입니다.`)
  else if (band) pts.push(`구간: 10억 이상 — ${AMOUNT_BAND_OVER}라 우리 고객과 규모가 다릅니다. 방향만 참고합니다.`)
  return pts
}

export function caseCaveats(c: CaseStudy): string[] {
  const cv: string[] = []
  const actual = c.fundingAmountDisclosed
  const limit = c.fundingProgramMax
  if (actual != null && limit != null) cv.push(`실제 공개금액 ${formatEok(actual)}과 제도상 한도 ${formatEok(limit)}은 다른 숫자입니다. 한도를 받은 것처럼 말하지 않습니다.`)
  if (c.fundingType === 'private_investment') cv.push("민간투자 사례입니다. 정책자금과 경로가 다르므로 '우리도 이만큼 받는다'식 설명은 금지입니다.")
  if (c.fundingType === 'guarantee' || c.fundingType === 'policy_loan' || c.fundingType === 'mixed') cv.push('보증·정책융자는 상환 의무가 있는 자금입니다. 지원금처럼 설명하지 않습니다.')
  if (c.fundingType === 'gov_rnd') cv.push('정부 R&D·TIPS는 선정 후 과제 수행이 전제이며, 개발비를 정책자금으로 대체하는 구조가 아닙니다.')
  if (c.fundingForm?.startsWith('TIPS 선정(일반)')) cv.push('TIPS 선정 레퍼런스입니다. 실제 수령액이 아니라 제도상 한도만 표기되어 있습니다.')
  if (c.narrativeKind === 'free' || c.narrativeKind === 'flow') cv.push('요약 서술은 공개 기사·리서치 기반이며 내부 프로세스 상세는 확인되지 않았습니다.')
  for (const n of (c.fundingNote ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    if (/^(누적|약|총|후속|복수|한 구간)/.test(n)) cv.push(`금액 표기 주의: ${n}`)
  }
  return cv
}

/** 사례 상세의 유사 태그 (업종·구간·자금·거래형태·등급·문제구조) */
export function caseSimilarityTags(c: CaseStudy, areaLabel: (a: CaseStudy['problemAreas'][number]) => string): string[] {
  const tags = [
    c.researchSection,
    c.researchCategory,
    c.amountBand,
    FUND_LABEL[c.fundingType],
    { b2b: 'B2B', b2c: 'B2C', both: 'B2B·B2C' }[c.businessModel],
    c.axGrade ? AX_GRADE_LABEL[c.axGrade] : '',
    ...c.problemAreas.map(areaLabel),
  ].filter((t): t is string => Boolean(t))
  return Array.from(new Set(tags))
}
