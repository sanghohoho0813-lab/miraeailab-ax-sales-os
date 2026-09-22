# 미래AI랩 AX Partner OS — AX 미팅 가이드

> AX 를 잘 모르는 컨설턴트도 미팅 5분 전에 열고, 1차 미팅을 클릭으로 진행한 뒤,
> 버튼 한 번으로 김상호 대표의 운영 OS 에 "2차 AX 제안 요청" 을 넣을 수 있게 만드는 앱.

```
CUSTOMER  홈페이지 3분 AX Fit 진단  ──┐  (같은 Supabase project: mirae-ai-lab)
PARTNER   AX 미팅 가이드 (이 저장소) ──┼─▶ customer_events (ax_proposal_requested)
MASTER    미래AI랩 운영 OS 이벤트함 ◀─┘  → 2차 제안 · Value Map · 가격 · 구축 · 실증
```

## 화면 흐름 (BEFORE → LIVE → AFTER)

| 단계 | 화면 | 내용 |
|---|---|---|
| BEFORE | 신규 업체 등록 | 회사명 1개 입력 + 업종·인원·거래형태·관심사 클릭 (전부 "잘 모르겠음" 가능) |
| BEFORE | 미팅 준비 4단계(회사→기본구조→관심사→준비완료) → 미팅 전략 | "오늘/내일 ○○은 이렇게 접근하세요" · 공략 포인트 3 · 오늘 목표 · 주의 · [자세히 보기] · 홈페이지 사전진단 연동(겹치는 질문 건너뜀) · 리서치 사례 2개(+📌 내가 고른 사례) · 오늘 물어볼 질문 4~9개 |
| LIVE | 질문 화면 | 한 화면 한 질문 · 큰 버튼 · [왜 묻나요?][어떻게 말하나요?] · 건너뛰기 · 답하기 어려워함 · 도움말(상황별 답변/가격/후불/자금) |
| LIVE | 핵심발언 | 필수 자유입력 1개(음성입력 지원) · 선택 메모 · ⚠ 표현 수정 권장 |
| AFTER | 요약 먼저 → [분석 자세히 보기] | 오늘 확인한 핵심 01/02/03(HIGH/MEDIUM) · 추천 범위 · CTA [김상호 대표에게 2차 제안 요청] → 성공 모션 → 상태(전달 완료/검토중/2차 제안 준비중/제안 준비완료) · 상세: TOP 3 · 범위 가설 A~D · 4축 · 가치 가능영역 · 추천 연구사례 · 추가 확인 ≤3 · 사실/추정/미확인 · 브랜드 PDF |
| AFTER | **김상호 대표에게 2차 제안 요청** | 구조화 데이터로 운영 OS 즉시 전달 · meeting_id 기준 idempotent · 상태(submitted→received→reviewing→proposal_ready) |
| AFTER | PDF | "1차 AX 미팅 내부 리포트" (보관·출력용, 고객 자동 발송 없음) |
| 공통 | WORK(홈·미팅·고객) · KNOWLEDGE(실제 사례 371건 탐색/상세 · AX 플레이북[영업 원칙/상황별 답변/주의 표현]) · SYSTEM(설정: 7 테마 · Device View) | 파트너 |
| MASTER | 2차 제안 요청함 · 파트너 관리 · 사례 DB 관리(검수) | 미래AI랩 |

## 기술 스택 (기존 미래AI랩 프로젝트와 동일)

Vite 8 · React 19 · TypeScript · Tailwind CSS 4 · React Router 7 · @supabase/supabase-js · lucide-react · Vercel

## 실행

```bash
npm install
cp .env.example .env        # 기본은 local(브라우저 데모) 모드 — 로그인 없이 역할만 고른다
npm run dev                 # http://localhost:5175
npm run check               # typecheck + lint + 단위테스트 + build
npm run test:e2e            # Playwright — 모바일/태블릿/PC 에서 핵심 흐름 + 가로 스크롤 검증
```

운영 배포는 `VITE_DATA_MODE=supabase` 로 미래AI랩 공용 프로젝트에 연결한다. 순서는 [docs/SETUP.md](docs/SETUP.md).

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 기존 홈페이지·운영 OS 구조 조사 결과와 Partner OS 가 들어가는 자리
- [docs/INTEGRATION.md](docs/INTEGRATION.md) — 홈페이지 → Partner OS → 운영 OS 데이터 계약 (테이블·RPC·이벤트)
- [docs/SETUP.md](docs/SETUP.md) — 마이그레이션 적용 순서, 운영 OS 배포 순서, 파트너 등록, 완료 조건 점검
- [docs/CONTENT_SOURCES.md](docs/CONTENT_SOURCES.md) — 질문·플레이북·사례 DB 의 출처와 아직 반영하지 못한 자료

## 구조

```
src/
  content/   질문 은행(WHY/SAY/CLICK) · 플레이북 · 상황별 답변 · 주의 표현 · 세일즈 코치 · 가격 가이드 · 리서치 사례 DB(research-cases.json) · 라벨
  engine/    질문 선택 · 브리핑 · 사전진단 미리채움 · 분석(범위 A~D, 4축, 가치, 추가확인) · 유사사례 · 전달 패킷
  data/      Repository 인터페이스 · local(localStorage) · supabase(partner_* 테이블 + RPC)
  lib/       auth(파트너/마스터) · util
  components/ 공용 UI(시트·스켈레톤·카운트업·레이아웃 변주) · 앱 셸(그룹 사이드바·실시간 시계·Device View) · 폰 프레임 · 사례 행
  pages/     BEFORE / LIVE / AFTER 화면, 사례·플레이북·상황별·주의표현·설정, 마스터 화면, 인쇄 리포트
supabase/
  migrations/20260922000001_partner_os.sql         partner_* 테이블 · RLS · RPC
  migrations/20260922000002_partner_os_bridge.sql  운영 OS customer_events 연결 (전달 · 상태 역동기화)
  migrations/20260922000003_partner_cases_research_seed.sql  리서치 PDF 기반 실제 사례 371건 시드 (mixed 자금유형 · source_url · review_required)
  migrations/20260922000004_partner_companies_pinned_cases.sql  업체별 "미팅에 사용할 사례"
  tests/partner_os_contract.sql                    순수 SQL 계약 테스트 (권한 격리 · 중복 방지 · 역동기화)
e2e/       Playwright 핵심 흐름
```

## V1 에서 하지 않은 것

전체 CRM 재구축 · 전자계약 · 수금관리 · 일정관리 · 메일 · 카카오톡 자동발송 · 완전 자동 견적 · 완전 자동 3년 Value Map · 완전 자동 정책자금 판정 — 모두 기존 운영 OS 의 몫이다.
