# AX Partner OS — 지능형 등록 / PDF 자동 프로파일링 / Strategy Autopilot 보고 (2026-09-22)

브랜치: `claude/festive-babbage-uj6ugd` · main 은 건드리지 않음 · migration 0001~0005 수정 없음(0006 추가만) · 기존 계약(Handoff·Withdraw) 변경 없음.

목표: **PDF 하나 또는 몇 번의 클릭으로 업체정보 → AX 전략 → 유사 사례 → 질문 → 멘트 → 주의사항까지 자동 준비.**
결과 흐름: `미팅 준비 시작 → [PDF로 1분 준비] / [30초 빠른 등록] / [기존 고객 선택] → 업체정보 자동구조화 → 확인/수정 → 371 사례 자동매칭 → 오늘의 접근전략 → 질문 → 멘트 → 주의 → [미팅 시작]`.

## 1. PDF Pipeline Architecture

```
File (브라우저 메모리)
  → lib/pdfText.ts        pdf.js(동적 import, 431KB 별도 청크) 텍스트 레이어 → 줄 재구성(itemsToLines) · SHA-256 · 텍스트 유무 판정
  → engine/docParser/     adapters(cretop 감지 / generic) → rules(라벨:값 · 재무 표 · 인증 키워드) → pii(주민번호·계좌·자택 줄 제거)
  → ParsedDocument        facts(ProfileFacts) + evidence[]{value,status,source,sourcePage,sourceText} + warnings
  → PdfIntakePage         단계 표시(읽는 중 → 기업정보 → 사례 371 비교 → 전략) · 취소 · 검토(수정/사용 안 함) · 중복 확인 · 확정
  → repo.createCompany(field_sources) + repo.createProfile(partner_company_profiles)
  → CompanyPage           buildStrategy(company, latestProfile, cases) — 결정적, 즉시
```
우선순위: ① 텍스트 레이어 → ② 라벨/표 규칙(문서 구조) → ③ (선택) AI 보강 어댑터(문장만) → ④ OCR: **이번 차수 미구현** — 텍스트가 없으면 "읽지 못했습니다" + [직접 30초 등록] / [다른 PDF 선택]. 30쪽 전체 이미지 OCR 구조는 없다.

## 2. Raw PDF 저장 정책

- 원본 PDF 는 **어디에도 업로드하지 않는다** (Supabase Storage 버킷 없음, Public/Private 모두). 브라우저 메모리에서 텍스트만 추출한다.
- DB 에는 구조화 값(`profile_json`) · 근거(`evidence_json`: 페이지·원문 한 줄) · 메타(파일명·쪽수·SHA-256·파서 버전) 만 남는다.
- "원본도 보관" 옵션은 이번 차수에 없다(요구 시 Private 버킷 + 24h 자동삭제로 추가). 화면에는 "원본 저장 안 함 · 브라우저에서만 처리" 로 표시한다.
- 개인정보 최소화: 주민등록번호·운전면허·여권·계좌번호 패턴은 원문 스니펫에서 마스킹, 자택 주소·계좌 줄은 통째로 버림. DB 트리거(0006)가 주민번호 패턴을 한 번 더 거부한다(T13 검증).

## 3. 실제 Sample 에서 추출된 필드

**실제 크레탑 PDF 샘플은 이번 요청에 첨부되지 않았다.** 그래서 익명화 픽스처(`e2e/fixtures/sample-company-report.pdf`, 4쪽, 가상 기업 "테스트정밀")로 검증했다. 픽스처에서 추출된 필드(34개 근거):

| 필드 | 값 | 상태 | 근거 |
|---|---|---|---|
| 회사명 | 테스트정밀 | ✅ | PDF 2p "회사명 : 테스트정밀 주식회사" |
| 대표자 · 대표 연락처 · 사업장 주소 · 설립일 | 김가상 · 031-000-0000 · 경기도 화성시 … · 2012.03.15 | ✅ | 2p |
| 업력 | 약 14년 | 🟡 (설립일에서 계산) | 2p |
| 업종 · 산업분류 코드 · 업종 분류 | 자동차 부품 제조업 · C30320 · manufacturing | ✅ (코드로 확정) | 2p |
| 직원수 | 14명 → 11~20명 | ✅ | 2p |
| 주요 제품 · 인증(벤처기업·기업부설연구소·ISO 9001) · 특허 3건 · 신용등급 BBB | | ✅ | 2p / 4p |
| 재무 2023~2025 매출액·영업이익·당기순이익·자산·부채·자본 (단위: 백만원 환산) | 예: 2025 매출 112억 3,000만 원 | ✅ | 3p |
| 최근 매출 추이 | 증가 (+18%) | ✅ | 3p |
| 거래형태 | B2B 추정 | 🟡 (문구 기반) | 4p |

제외 확인: 픽스처에 심어 둔 "자택 주소" 줄과 주민번호 패턴은 결과 JSON 어디에도 없다(단위·E2E 검증).

## 4. Parser 정확도 / 미지원 필드

- 라벨:값 규칙(회사명/대표자/전화/주소/설립일/업력/업종/직원수/신용등급/제품)과 연도 열 재무 표, 한 줄 금액("매출액 12억 3,000만원"), △·괄호 음수, (단위: 천원/백만원) 환산 — 단위 테스트 45개 통과.
- 같은 항목에 서로 다른 값이 여러 번 나오면 첫 값을 🟡 추정으로 낮추고 경고를 남긴다. 단위 표기를 못 찾으면 "금액이 작게 읽혔을 수 있음" 경고.
- **크레탑 전용 어댑터는 감지(CRETOP/크레탑/NICE 문구)와 라벨 별칭만 있는 미검증 상태(`cretop 0.1-unverified`)** 다. 실제 샘플이 들어오면 `src/engine/docParser/adapters.ts` 의 aliases 만 보강한다. 문서에 없는 항목을 상상해서 만들지 않았다.
- 미지원: 스캔 이미지 PDF(OCR 없음), 세로 쓰기/2단 레이아웃의 표, 그래프 이미지 안의 숫자, 주주·임원 명부(개인정보라 의도적으로 제외), 사업자등록번호(AX 영업에 불필요해 저장하지 않음).

## 5. Voice UX

- `lib/speech.ts` 로 브라우저 SpeechRecognition 을 공용화 — LIVE 핵심말 기록과 빠른 등록이 같은 코드를 쓴다(중복 구현 없음). 미지원 브라우저는 버튼을 숨기고 텍스트 입력만 남긴다.
- 항목별 마이크: 회사명 · 대표자 · 연락처 ("공일공 일이삼사 오육칠팔" → 010-1234-5678 정규화).
- [음성으로 한 번에 입력]: "ABC산업 김철수 대표, 오늘 오후 세시 미팅이고 직원은 열다섯 명, 제조업" → 초안 "이렇게 들었습니다"(회사·대표·연락처·미팅·인원·업종·거래형태·관심사, 각각 ✅/🟡/⚪) → [확인] 해야 폼에 들어간다. **🟡 추정 값(예: "정도", 오전/오후 없는 3시)은 자동 선택하지 않는다.** DB 저장은 [미팅 전략 만들기] 에서만.
- 순우리말·한자어 수(열다섯·스물·십오), 시각(오늘/내일/모레 · 오전/오후 · N시 반/분), 관심사 키워드 파서 — 단위 테스트.

## 6. 새 Quick Meeting Time UX

- 기본 **오늘 · 지금(Live Now)**: 실제 현재 시각이 초 단위로 계속 갱신되고, 저장하는 순간의 시각이 `meeting_at` 으로 확정된다.
- Quick Chips: [지금] [오늘(다음 30분 단위)] [내일 10:00] · [+30분] [+1시간] · [다른 날짜](날짜 + 시간 칩 09~18시 + 직접 시간 + 정확한 일시) · [지우기]. 다른 날짜를 고르면 Live Now 해제, 다시 [지금] 이면 복귀.
- datetime-local 은 "다른 날짜" 안의 보조 입력으로만 남겼다.

## 7. Company Profile Schema (migration 0006)

- `partner_companies.field_sources jsonb` — 항목별 입력 출처 `{name: pdf, phone: voice, interests: manual, headcount: master_edit …}`.
- `partner_company_profiles` — `company_id`, `source_type(manual|pdf|voice|website_diagnosis|master_edit)`, `source_name`, `source_file_name`, `source_hash`, `page_count`, `profile_json`(ProfileFacts), `evidence_json`(EvidenceField[] · removed 플래그), `parser_json`, `created_by`, `created_at`. 재업로드는 새 행(이력 보존), 전략은 최신 행 사용.
- RLS: 담당자(`partner_can_manage_company`)만 읽기/추가/수정, 직접 DELETE 는 `using (false)`, 회사·작성자 변경 금지 트리거, 주민번호 패턴 거부 트리거, 감사(`profile_added` / `profile_corrected`).
- `partner_intake_jobs` 는 만들지 않았다 — 추출이 브라우저에서 끝나 서버 잡이 필요 없다.
- 사용 이벤트 9종 추가: pdf_uploaded · pdf_parsed · pdf_confirmed · pdf_failed · voice_intake_used · strategy_generated · case_auto_matched · company_duplicate_detected · profile_corrected.

## 8. Case Matcher V2 변경사항

기존 축(업종·문제구조·B2B/B2C·전환방식·규모↔금액구간·자금유형·검증)을 유지하고 추가:
- 세부업종·제품 키워드 겹침(+1~2, "세부업종·제품 유사: 정밀·금형")
- 성장 추이(PDF 매출 증가 → growing / 업력 ≤3 → early / 업력 ≥10·보합 → stable) — 미팅 답변이 있으면 답변 우선
- 기술 인증(연구소·벤처·이노비즈) ↔ R&D·사업화·혼합 자금 경로(+1)
- 고객 접점 필요(B2B + 견적·주문/거래처 문제) ↔ 포털·하이브리드 전환(+1)
- 추천 3개: ① 업종 ② 문제구조 ③ **전환경로(AX Path)** — 각 카드에 "왜 추천했나요?" 이유 태그. Vector DB·임베딩 없음. reviewRequired 사례는 기본 추천 제외 유지.

## 9. Strategy Autopilot 결과 Sample (픽스처 PDF → 테스트정밀)

- 접근법: "이 회사는 AI 자체보다 대표 의존도 → 견적·공정 계산 분산 → 추가채용 부담 이(가) 어디에서 끊기는지를 먼저 확인하는 것이 좋습니다. 매출 2025년 +18% (PDF 3p) 로 보아 성장에 따라 관리업무 부담이 함께 늘고 있을 가능성이 있으니, "매출이 늘면서 관리 인력이나 확인 업무도 같이 늘고 있나요?" 로 여세요."
- 오늘 공략 TOP 3: ① 대표 의존도 🟡 (직원 14명 규모 … PDF 2p) ② 견적·공정 계산 분산 🟡 (주요 제품 정밀 절삭 부품… PDF 2p) ③ 추가채용 부담 🟡 (매출 +18% PDF 3p)
- 질문 8개(공략 영역 순) + 문서→가설→질문 4개 · AX 방향 · 범위 가설 B(🟡) · 사례 3(업종/문제구조/전환경로 + 이유) · 멘트 OPENING/PRICE/CASE/CLOSING(1~2문장 + 다음 질문) · 절대 먼저 하지 말 말 6개(후불·자금·"자료 보니 매출이…"·"매출 늘어서 엉망이시죠") · 추가정보 3개 · 정보 충분도 높음(PDF 완료 · 사전진단 없음 · 미확인 0) · [왜 이렇게 판단했나요?] 근거 목록.
- 수정 시 즉시 재계산: 기업자료에서 직원수를 "사용 안 함" 하면 관련 가설이 사라지고, 되돌리면 다시 생긴다(E2E). 같은 입력이면 같은 해시(`strategyHash`) — 전략 생성 이벤트는 해시당 1회, AI 보강 결과도 해시로 캐시.

## 10. Master / Partner Delete Permission

| 역할 | 본인/담당 고객 | 다른 파트너 고객 |
|---|---|---|
| PARTNER | 보관·복구·영구삭제(전달 이력 없을 때) | 읽기 불가 · 보관/삭제 RPC 거부(insufficient_privilege) |
| MASTER | 전체 보관·복구·영구삭제(안전 RPC: 보관 상태·활성 요청·운영 OS 이벤트 확인) | 동일 |
DB 계약 T14, E2E "삭제 권한" 으로 검증. Handoff 가 있으면 철회/보관 규칙(0005) 그대로 적용, orphan 없음.

## 11. 새 Migration

`supabase/migrations/20260922000006_partner_intake_profiles.sql` (additive only). 적용 순서 `docs/SETUP.md` 6번.

## 12. E2E 결과

`e2e/intake.spec.ts` 7건 × 2 프로젝트(intake 1366px · intake-mobile Pixel 7 390px): PDF 1분 준비 · 잘못된 값 삭제/수정 → 재계산 · 중복 PDF 고객(기존 고객에 정보 추가, 항목별 기존 유지/PDF 반영) · 음성 한 번에 입력(mock SpeechRecognition, 확인 전 저장 없음) · 미팅 일시 Quick(실시간·+1시간·지금 복귀·내일·지우기) · 삭제 권한(파트너2 차단·마스터 전체) · 전략 자동매칭(이유 있는 사례 2~3). 기존 partner-flow·hardening·screens 는 새 3단계 흐름에 맞게 helper 만 바꾸고 삭제하지 않았다. 전체 결과는 아래 "검증 요약".

## 13. SQL Contract 결과

T1~T12(기존) + **T13 회사 프로필**(파트너 격리 · 주민번호 거부 · 수정만 가능/삭제 0건 · 회사 이동 금지 · 감사 · 항목 출처) + **T14 삭제 권한 매트릭스** + **T15 지능형 등록 이벤트** — `PARTNER OS CONTRACT: ALL ASSERTIONS PASSED` (홈페이지 → 운영 OS → Partner OS 0001~0006 리플레이).

## 14~15. 스크린샷

`docs/screenshots/intake/` — 가져오기 방법 · PDF 선택 · 검토 · 전략(접힘/펼침) · 근거 시트 · 중복 안내 · 병합 · 음성 초안 (1366px 과 390px). E2E 원본은 `e2e/screenshots/intake-*.png`, `intake-mobile-*.png`.

## 16. PDF 1건당 실행 과정

1. 파일 선택(끌어놓기/선택, 40MB 이하) → `pdf_uploaded`
2. pdf.js 로 텍스트 레이어 추출(최대 60쪽, 페이지 진행 표시, 취소 가능) · SHA-256
3. 텍스트가 거의 없으면 실패 화면(`pdf_failed`) — 직접 등록/다른 PDF
4. 어댑터 감지 → 라벨/표 규칙 → 개인정보 제거 → facts + 근거 · `pdf_parsed`
5. 사례 371건 로드(별도 청크) → 전략 미리 계산(결정적)
6. 회사명·연락처로 기존 고객 검색 → 비슷하면 중복 안내(`company_duplicate_detected`)
7. 검토: 항목 수정/사용 안 함(`profile_corrected`) · 핵심 정보 확인 · 관심사 · 미팅 일시
8. [이대로 준비] → 회사 생성(field_sources) + 프로필 저장 + 사전진단 조회 · `pdf_confirmed` → 전략 화면(`strategy_generated`, `case_auto_matched`)

## 17. 현재 Variable Cost 가 발생하는 부분

- **없음.** PDF 추출·파싱·매칭·전략은 모두 브라우저 안의 결정적 코드다. Storage 업로드 없음, 외부 CDN 없음(pdf.js cmaps 는 빌드 시 로컬 복사).
- AI 보강은 `VITE_AI_ENHANCER_URL` 이 설정된 경우에만, 서버 엔드포인트를 통해, 같은 해시는 1회만 호출한다. 서버 함수와 Provider 비용은 이번 차수에 포함되지 않았다.

## 18. 다음 10건 미팅에서 측정할 KPI

미팅 준비 완료시간(가져오기 시작 → [미팅 시작]) · 직접 입력 필드 수 · PDF 사용률(pdf_uploaded / 준비 시작) · PDF 추출 후 수정된 필드 비율(profile_corrected / 근거 수) · pdf_failed 비율과 사유 · Voice 사용률 · 추천 사례 클릭률(case_opened from brief) · 추천 사례 교체율(📌 pinned 가 추천을 대체한 비율) · Strategy 생성 후 실제 미팅 시작률(meeting_started / strategy_generated) · 중복 안내 후 "기존 고객에 정보 추가" 선택 비율. 마스터 사용 데이터 화면에 "지능형 등록" 건수 블록을 추가했다(미팅 10건 미만 게이트와 무관한 단순 건수).

## 검증 요약

| 항목 | 결과 |
|---|---|
| typecheck / lint / build | 통과 (lint 은 fast-refresh 경고만) · pdf.js 는 431KB 별도 청크 + worker, 메인 번들 미포함 |
| vitest | 45 passed (문서 파서 · 한국어 수/금액/전화 · PII · pdf.js 픽스처 추출 · 음성 파서 · Strategy Autopilot · Matcher V2) |
| Playwright 전체 | **50 passed** (mobile/tablet/desktop 핵심 흐름 15 · hardening 5 · screens 16 · intake 7 × 2) |
| SQL 계약 T1~T15 | ALL ASSERTIONS PASSED |
| 기존 테스트 삭제 | 0건 (준비 흐름이 4단계 → 가져오기 방법 + 3단계로 바뀌어 helper 만 수정) |

## 알려진 한계 / 하지 않은 것

- 크레탑 실제 샘플 미검증(어댑터는 감지+별칭 셸). 스캔 PDF OCR 없음. 원본 보관 옵션 없음. AI 서버 함수 없음(클라이언트 인터페이스·캐시·계약만).
- Vector DB · 전체 OCR · Chatbot · 새 CRM · 금융분석 · 정책자금 승인예측은 의도적으로 하지 않았다. PDF 하나로 AX 필요성을 확정하지 않는다(모든 판단은 🟡 가설, 미팅에서 ✅).
