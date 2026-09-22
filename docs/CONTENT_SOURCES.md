# CONTENT_SOURCES — 콘텐츠 출처와 검증 상태

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
| **실제 사례 DB 371건** | `src/content/research-cases.json` · `src/content/cases.ts` · `supabase/migrations/20260922000003_partner_cases_research_seed.sql` | **"미래AI랩 AX·플랫폼 자금조달 사례 종합리서치 (50대 가독성 강화 · 중진공 AX 정책 업데이트 · 최종 2026.09.04)" PDF — 유일한 원천** |

## 실제 사례 DB — 어떻게 만들었나

1. PDF 100쪽의 텍스트와 "원문 보기 ↗" 링크(583개)를 좌표와 함께 추출했다.
2. 다섯 종류의 표를 각각 파싱했다.
   - 10억 미만 특별 인덱스(p.11~26): 기업 · 금액 · AX 등급(A/B/C) · 변화·전환 포인트 · 신규 검증(●) — 121행
   - TIPS/지원 선정 레퍼런스(p.12~30): 기업 · 연도 · 전환 포인트 · **제도상 한도만** — 94행
   - 정책금융·정부 R&D 우선 사례(p.32~46): 기업 · 자금형태 · 원문 · 금액 · 과정 요약 — 107행
   - 금액대별 인덱스(p.47~62): 기업 · 9분류 업종 · 금액 · 한 줄 요약 — 246행
   - 업종별 전체 사례(p.63~99): 기업 · 자금형태 · 출처 · 연도 · 금액 · 시장 문제 → 해결·전환 → 실증 → 조달 — 246행
3. 기업명으로 병합해 371건을 만들었다. 각 행은 `problem / axTransition / internalAx(데이터) / aiFunction(AI·자동화) / customerPortal(고객 접점) / validation(실증) / fundingType / fundingAmountDisclosed / fundingProgramMax / year / source / sourceUrl` 을 가진다.
4. 검증 상태
   - `verified` 291건: 원문 링크 · 금액 · 연도 · 문제/전환 서술이 모두 있는 행
   - `needs_review`(= `reviewRequired`) 80건: TIPS 선정 레퍼런스(실제 수령액 미공개) 46건, 정책 섹션에만 있어 업종을 확정하지 못한 25건, 연도 미확인·금액 표기가 모호한 행. **기본 추천에서 제외**되며 마스터가 검수 후 `verified` 로 바꾼다.
   - 10억 미만 실제 공개금액 사례 123건(그중 verified 112건), 이번 리서치에서 새로 검증된(●) 28건
5. 금액 규칙: `최대·한도·제도상` 이 붙은 숫자는 `fundingProgramMax` 로, 나머지는 `fundingAmountDisclosed` 로 분리한다. 두 값은 절대 같지 않다. `누적·약·총·후속` 표기는 `fundingNote` 에 남기고 화면의 주의 문구로 나온다.
6. 자금유형: 민간투자 / 보증 / 정책융자·정책기관 / 정부 R&D / 사업화지원 / 혼합조달(두 가지 이상 결합) — `fundingForm` 에 원문 표기를 그대로 보관한다.
7. 제외: 기존 컨설팅 고객사(비원미래·정통대왕쑥뜸원·KPJK·태강지엘텍·하나인사이트·선진산업)는 파서에서 차단하고 최종 검사에서 다시 확인했다. 홈페이지 시나리오·고객 사례 기반 구 시드 13건은 삭제했다.
8. AX 등급(A/B/C)은 PDF 표의 표기를 그대로 옮겼다. PDF 에 범례가 없어 화면에서는 "AX·플랫폼·데이터 전환형 / 현장 자동화·로봇·디바이스형 / 제품·브랜드 사업화형" 으로 조심스럽게 표기하며, 검수 대상이다.

재생성: 파서 스크립트(`parse_research.py`, `normalize_cases.py`, `gen_sql.py`)는 세션 작업 디렉터리에 있고, 같은 PDF 를 넣으면 동일한 JSON·SQL 이 나온다. PDF 가 갱신되면 같은 순서로 다시 만들고 `needs_review` 검수를 반복한다.

## 반영하지 못한 것

1. **"(AX+플랫폼전용) 미래AI랩_AX_Platform_Unified_Design_Development_System_v4.0_260915.md"** — 이 저장소·홈페이지·운영 OS 저장소·업로드 폴더 어디에도 없었다. UI/UX 는 업그레이드 프롬프트의 명시 규칙과 운영 OS `docs/DESIGN_SYSTEM.md`(v3.0 계열) 를 기준으로 구현했다. 문서를 받으면 토큰·타이포·모션 값을 대조해 조정한다.
2. **"기존에 정리한 약 30개의 영업 논리"** — 원문이 없어 PROMPT 에 적힌 원칙과 홈페이지 공개 문안으로 플레이북을 썼다.

## 원칙 (콘텐츠 추가 시)

- 사례 금액은 `fundingAmountDisclosed`(실제 공개금액)와 `fundingProgramMax`(제도상 최대한도)를 반드시 분리한다.
- 민간투자·보증·정책융자·정부 R&D·사업화지원·혼합조달·고용지원금을 혼동하지 않는다(`fundingType`).
- 사례는 공개 자료(원문 링크)가 있는 것만 넣는다. 가상의 사례를 만들지 않는다.
- "무조건 됩니다", "비슷한 회사가 5억 받았으니 대표님도" 류 표현은 콘텐츠에도 넣지 않는다 — `guardText()` 가 자유입력에서 잡는 것과 같은 기준.
