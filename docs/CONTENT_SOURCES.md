# CONTENT_SOURCES — 콘텐츠 출처와 미반영 자료

## 반영한 것

| 콘텐츠 | 파일 | 출처 |
|---|---|---|
| 질문 은행 12 공통 + 7 업종 특화 (WHY/SAY/CLICK) | `src/content/questions.ts` | MASTER BUILD PROMPT §6·§7·§10, 홈페이지 3분 AX Fit 10문항(`businessDiagnosisQuestions.ts`)과 영역 정렬 |
| 사전진단 미리채움 매핑 | `src/engine/diagnosis.ts` | 홈페이지 `businessDiagnosisEngine.ts` 의 문항 키(repeatInput … internalOwner) |
| 오늘의 접근법(업종별 체인) | `src/engine/briefing.ts` | 홈페이지 업종별 AX 시나리오(`axIndustryShowcaseV2.ts`)의 문제 구조 |
| 가격·후불·자금 설명 문장 | `src/content/pricing.ts` | PROMPT §12~§15, 홈페이지 AX 프로그램 A/B/C(`axPackages.ts`), 2026 정책근거(`policyAxEvidence2026.ts`) |
| 플레이북 7장 | `src/content/playbook.ts` | PROMPT §19·§27 + 위 자료를 교육자료 형태로 재구성 |
| 상황별 응대 10건 | `src/content/objections.ts` | PROMPT §20 예시 확장 |
| 주의 표현 7건 + 감지 패턴 | `src/content/forbidden.ts` | PROMPT §13·§21 |
| 사례 시드 13건 | `src/content/cases.ts` | 홈페이지 실제 프로젝트(`realProjectsDeep.ts` 6건, verified) · 정책자금 실제 사례(`fundingCases.ts` 4건, verified — AX 아님을 명시) · 업종 패턴(`axIndustryShowcaseV2.ts` 3건, needs_review) |

## 반영하지 못한 것 (Master 가 추가해야 함)

1. **"미래AI랩 AX·플랫폼·자금조달 종합리서치" PDF** — 이 저장소·홈페이지·운영 OS 저장소 어디에도 첨부돼 있지 않았다. 사례 DB 의 원천자료로 지정된 문서이므로, 받는 즉시 `AI 추출 → Master 검수 → 승인 → 사례 DB 반영` 순서로 넣는다. 마스터 화면(사례 → 사례 추가(초안))에서 `draft` 로 만들고 검수 후 `verified` 로 바꾸면 파트너에게 공개된다.
2. **"기존에 정리한 약 30개의 영업 논리"** — 원문이 없어 PROMPT 에 적힌 원칙과 홈페이지 공개 문안으로 플레이북을 썼다. 원문을 받으면 `src/content/playbook.ts` 의 `points` 에 항목을 더한다(채팅 원문 형태가 아니라 교육자료 문장으로).

## 원칙 (콘텐츠 추가 시)

- 사례 금액은 `fundingAmountDisclosed`(실제 공개금액)와 `fundingProgramMax`(제도상 최대한도)를 반드시 분리한다.
- 민간투자·보증·정책융자·정부 R&D·사업화지원·고용지원금을 혼동하지 않는다(`fundingType`).
- 회사명·대표자명은 넣지 않는다. 홈페이지 공개 표기(업종·지역)까지만.
- "무조건 됩니다", "비슷한 회사가 5억 받았으니 대표님도" 류 표현은 콘텐츠에도 넣지 않는다 — `guardText()` 가 자유입력에서 잡는 것과 같은 기준.
