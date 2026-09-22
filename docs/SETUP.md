# SETUP — 적용 순서와 완료 조건 점검

## 0. 전제

- 미래AI랩 공용 Supabase 프로젝트(`mirae-ai-lab`)에 홈페이지 SQL 과 운영 OS 브릿지 마이그레이션(`20260903000006 ~ 0009`)이 이미 적용돼 있다.
- Claude 실행 환경에는 Supabase 자격증명이 없어 **운영 DB 에 적용하지 않았다.** 아래는 사람이 실행한다.
- 대신 로컬 PostgreSQL 16 에 홈페이지 SQL 8개 + 운영 OS 마이그레이션 12개 + 이 저장소 마이그레이션 2개를 순서대로 적용하고 계약 테스트를 통과시켰다(`supabase/tests/run_local.sh`).

## 1. 순서 (중요)

1. **운영 OS 앱 배포** — `AX-MVP-Factory-OS` 브랜치 `claude/partner-os-handoff-v1` 을 main 에 병합·배포. (`ax_proposal_requested` 타입을 모르는 운영 OS 는 이벤트함 렌더링이 깨지므로 SQL 보다 먼저)
2. **SQL 적용** — Supabase Dashboard → SQL Editor 에서 순서대로 (둘 다 멱등):
   1. `supabase/migrations/20260922000001_partner_os.sql`
   2. `supabase/migrations/20260922000002_partner_os_bridge.sql`
   3. `supabase/migrations/20260922000003_partner_cases_research_seed.sql` — 리서치 PDF 기반 실제 사례 371건(검수 완료 291 · 검수 필요 80). 이미 있는 id 는 건드리지 않는다.
   4. `supabase/migrations/20260922000004_partner_companies_pinned_cases.sql` — 업체별 "미팅에 사용할 사례" 컬럼
3. **사례 검수** — 마스터가 실제 사례 화면에서 `검수 필요` 행을 열어 검수 후 `검수 완료` 로 바꾸면 파트너 기본 추천에 들어간다. DB 가 비어 있으면 앱이 코드 시드(`src/content/research-cases.json`)를 읽기 전용으로 보여 준다.
4. **Partner OS 배포 (Vercel)** — 새 프로젝트, 환경변수:
   ```
   VITE_DATA_MODE=supabase
   VITE_SUPABASE_URL=https://<ref>.supabase.co        # 홈페이지·운영 OS 와 같은 값
   VITE_SUPABASE_ANON_KEY=<anon 또는 sb_publishable_…>  # service_role / sb_secret_ 금지 (앱이 거부)
   VITE_OPS_OS_URL=https://<운영 OS 도메인>            # 마스터 화면의 "운영 OS 열기" 링크
   ```
   Supabase Auth → URL Configuration 의 Redirect URLs 에 Partner OS 도메인을 추가한다(이메일/비밀번호 로그인만 쓰면 필수는 아님).
5. **파트너 등록** — 김상호 대표(마스터: 운영 OS 워크스페이스 owner 또는 `profiles.role='admin'`)가 Partner OS 로그인 → 더보기 → 파트너 관리 → 곽주환 팀장 이메일(miraeailab.com 가입 계정) 등록.

## 2. 적용 후 확인 SQL

```sql
select count(*) from pg_tables where schemaname='public' and tablename like 'partner\_%';   -- 6
select count(*) from pg_tables where schemaname='public' and rowsecurity and tablename like 'partner\_%'; -- 6
select pg_get_constraintdef(oid) from pg_constraint where conname='customer_events_event_type_check'; -- ax_proposal_requested 포함
select proname from pg_proc where proname in ('partner_submit_handoff','partner_lookup_diagnosis','partner_current_role'); -- 3
```

## 3. 완료 조건(§43) 점검표

| # | 조건 | 어떻게 확인했나 |
|---|---|---|
| 1 | Partner 로그인 | Supabase Auth(홈페이지 계정) + `partner_current_role()`; local 모드 역할 선택 (e2e) |
| 2 | 신규 업체 등록 | e2e `company-save` → `/companies/:id` |
| 3 | 미팅 전 전략 생성 | `buildBriefing()` 단위테스트 + e2e "오늘 공략 포인트" |
| 4 | 유사사례 확인 | `recommendCases()` 단위테스트(①업종 ②문제구조) + 브리핑/분석 화면 |
| 5 | 클릭 중심 미팅 | e2e — 라디오 버튼만으로 전 질문 진행, 자유입력은 핵심발언 1개 |
| 6 | 미팅 종료 분석 | `analyzeMeeting()` 단위테스트 6건(A/C/D 판정, 분리 평가, 사실/추정/미확인, 원본 보존) |
| 7 | 추가 확인사항 | 최대 3개 — 단위테스트 |
| 8 | PDF | `/meetings/:id/report` 인쇄 문서 (e2e 스크린샷 `*-09-report.png`) |
| 9 | "2차 제안 요청" 버튼 동작 | e2e(local) + SQL 계약 테스트 T4 (RPC 실행) |
| 10 | 운영 OS 에 실제 등록 | SQL 계약 테스트 T4 — `customer_events(ax_proposal_requested)` 1건, 유입 워크스페이스 라우팅 |
| 11 | 운영 OS 에서 열람 | 운영 OS 패치(이벤트함 카드 + `/ops/inbox/handoff/:id`) — 별도 브랜치 |
| 12 | 2차 제안 작업 시작 | 운영 OS 패치의 [2차 제안 만들기] → 고객사 연결/작업실 |
| 13 | 기존 기능 불변 | 홈페이지 코드 변경 0 · 운영 OS 는 타입 추가·페이지 추가만 · 마이그레이션은 additive(check 확장 1건) · 전체 SQL 리플레이 성공 |
| 14 | 반응형 | Playwright mobile(iPhone 13)/tablet(iPad Mini)/desktop — 가로 스크롤 없음 assert |
| 15 | 중복 전송 방지 | SQL T4(두 번 호출 = 1건) + e2e(로컬 이벤트 1건, 새로고침 후 버튼 사라짐) |
| 16 | 권한 분리 | SQL T2/T2b/T5/T7 (다른 파트너 0행, anon 차단, 남의 미팅 전달 불가, 초안 사례 비공개) + e2e 마스터 경로 차단 |

## 4. 로컬 검증 재현

```bash
# 로컬 PostgreSQL 이 있을 때 (Supabase 아님)
createdb axpartner_test
DATABASE_URL=postgresql:///axpartner_test \
HOMEPAGE_DIR=../mirae-ai-lab-homepage OPS_DIR=../AX-MVP-Factory-OS \
bash supabase/tests/run_local.sh
# → PARTNER OS CONTRACT: ALL ASSERTIONS PASSED
```
