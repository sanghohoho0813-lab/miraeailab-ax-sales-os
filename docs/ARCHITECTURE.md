# ARCHITECTURE — 기존 구조 조사 결과와 Partner OS 가 들어가는 자리

> STEP 1~7 (코드베이스 조사 → 연동 분석 → 진입 방식 설계 → 스키마 조사 → 재사용 식별 → 아키텍처 → 최소 스키마) 의 기록.
> 조사 기준: `mirae-ai-lab-homepage@main(f82adca)` · `AX-MVP-Factory-OS@main(b56628d)` · 2026-09-22

## 1. 기존 시스템

| 시스템 | 저장소 | 스택 | 배포 | 역할 |
|---|---|---|---|---|
| 홈페이지 (miraeailab.com) | `mirae-ai-lab-homepage` | Vite 6 · React 19 · TS · Tailwind 4 · React Router 7 · Supabase(anon) · Vercel Functions(`api/*`, service_role) | Vercel `ai-business-lab` | 마케팅 · 3분 AX Fit 진단 · 회원/결제 · 고객 포털(My MIRAE) |
| 운영 OS (MIRAE AI LAB OS) | `AX-MVP-Factory-OS` | Vite 8 · React 19 · TS · Tailwind 4 · React Router 7 · Supabase(anon + RLS) · 워크스페이스 멤버십 | Vercel | 고객 이벤트함 · 고객 운영 · AX 제작 흐름 · 컨설팅 작업실 · 자금·사례 |
| **Partner OS (이 저장소)** | `miraeailab-ax-sales-os` | 위와 동일 (Vite 8 · React 19 · TS · Tailwind 4 · React Router 7 · Supabase anon) | Vercel (별도 앱) | 컨설턴트용 AX 미팅 가이드 |

세 앱은 **하나의 Supabase 프로젝트(`mirae-ai-lab`)** 를 공유한다(운영 OS `docs/CUSTOMER_PLATFORM_AUDIT.md §3`, 홈페이지 `docs/CUSTOMER_DATA_CONTRACT.md`). 인증도 같은 Supabase Auth 다.

## 2. 홈페이지 ↔ 운영 OS 기존 연동 (이미 동작 중)

```
홈페이지 3분 AX Fit 완료 ─ api/business-diagnosis(service_role) ─▶ business_diagnosis_leads INSERT
                                                                        │ trigger bridge_on_diagnosis_lead (운영 OS …0006)
                                                                        ▼
                                                             customer_events(diagnosis_completed) ─▶ 운영 OS 고객 이벤트함(/ops/inbox)
                                                                                                        └ LinkCustomerModal → operations_clients 연결
운영 OS "고객에게 업데이트" ─▶ portal_updates / portal_documents ─ portal_* RPC ─▶ 홈페이지 My MIRAE
```

핵심 객체(운영 OS `supabase/migrations/20260903000006_customer_bridge.sql`):
- `customer_events` — `workspace_id` RLS · `event_type` check · `dedupe_key` unique · `customer_safe_payload`(고객 제출 값만)
- `bridge_emit_customer_event(...)` — SECURITY DEFINER, `default_intake_workspace()` 로 라우팅, dedupe 충돌 시 null
- `portal_client_links` — 고객 계정 ↔ `operations_clients` 명시적 연결(사람이 확정)
- 운영 OS 앱은 `customerBridgeService.listEvents()` 로 읽고 `EventCard` 로 그린다. `eventSummary()` 는 `event_type` switch 라 **모르는 타입은 렌더링이 깨진다** → 운영 OS 패치가 필요한 이유(§5).

## 3. 재사용한 것 / 재사용하지 않은 것

| 항목 | 결정 |
|---|---|
| Supabase 프로젝트·Auth | **재사용**. 파트너 계정 = 홈페이지 회원(`auth.users`/`profiles`). 별도 가입 없음 |
| 홈페이지 사전진단 데이터 | **재사용**. `business_diagnosis_leads/sessions` 를 SECURITY DEFINER RPC(`partner_lookup_diagnosis`)로 회사명+연락처 일치 시 신호만 투영. 파트너에게 리드 테이블 직접 권한 없음 |
| 운영 OS 이벤트함 | **재사용**. 새 `event_type='ax_proposal_requested'` 로 `customer_events` 에 넣는다. Inbox·오늘 Top 3·고객사 연결 UI 를 그대로 탄다 |
| 운영 OS 브릿지 함수 | **재사용**. `bridge_emit_customer_event` 를 RPC 안에서 호출(권한은 definer) |
| 운영 OS `operations_clients` | 직접 쓰지 않는다. 연결은 운영 OS 담당자가 이벤트함에서 확정(중복 고객사 방지 원칙 유지) |
| 홈페이지/운영 OS 공통 UI 컴포넌트 | 패키지로 분리돼 있지 않아 **패턴만 재사용**(Tailwind 토큰 · Button/Badge/Section 구조 · 반응형 셸 · `@media print` 리포트) |
| 새 기술스택 | **추가 없음**. 테스트용 vitest·playwright 만 devDependency |

## 4. Partner OS 진입 방식 (가장 안전한 형태)

- **같은 프로젝트에 `partner_*` 접두 테이블 6개만 추가** (additive). 기존 테이블·정책·트리거 변경은 `customer_events.event_type` check 확장(값 하나 추가) 뿐.
- 권한 축은 워크스페이스가 아니라 **`consultant_id = auth.uid()`** — 파트너는 본인 업체·미팅·전달만. 마스터 = 운영 OS 워크스페이스 owner/admin 또는 `profiles.role='admin'` 또는 `partner_members.role='master'` (`partner_is_master()`).
- 전달은 **RPC 한 개(`partner_submit_handoff`)**: 소유권 검증 → `partner_handoffs` upsert(`meeting_id` unique) → 이벤트 발행(dedupe) → 미팅 상태. 두 번 눌러도 1건.
- 역방향은 **트리거**(`customer_events` UPDATE → `partner_handoffs.status`)라 운영 OS 코드가 Partner OS 를 몰라도 상태가 돌아온다.
- 파트너 브라우저에는 anon 키만. service_role 없음. 서버리스 함수 없음(Vercel static + Supabase).

## 5. 운영 OS 쪽 최소 변경 (별도 저장소 · 별도 브랜치)

`AX-MVP-Factory-OS` 에 다음만 추가한다(`docs/INTEGRATION.md §4`):
1. `types/bridge.ts` `CustomerEventType` 에 `'ax_proposal_requested'`
2. `customerBridgeService.ts` 라벨·요약(모르는 타입도 깨지지 않는 default)
3. `EventCard.tsx` 필드 라벨 + "제안 요청 내용 보기" 링크
4. `/ops/inbox/handoff/:id` 페이지 — `partner_handoffs` 를 읽어 패킷을 보여주고 **[2차 제안 만들기]** 로 고객사 상세/컨설팅 작업실로 이동

## 6. 데이터 흐름 (끊기지 않는 한 줄)

```
회사정보(4단계 클릭) → 사전전략(briefing) → 1차미팅(Core 4~5 + Adaptive 2~4, 최대 9 · 사전진단 항목 건너뜀 · 세일즈 코치) → 유사사례(matcher: FILTER 같은 업종 → SCORE 세부업종·문제구조·B2B/B2C·전환방식·규모↔금액구간·자금유형, reviewRequired 제외 · 기본 추천 최대 5 = 10억 이내 ≥3 + 수십억 ≤2, 같은 업종 안에서만 조합) → AX 범위 가설(analysis A~D)
 → 미팅종료 → [김상호 대표에게 2차 제안 요청] → partner_handoffs + customer_events(ax_proposal_requested)
 → 운영 OS 이벤트함 → 고객사 연결 → 2차 Value Map · 맞춤 AX · 가격/정산 · 구축 · 실증 · 성장관리 (운영 OS)
```

## 7. 원본 보존 · 감사 추적

- `partner_meetings.answers/key_quote/memo` = 현장 원본. 분석은 `analysis`(버전 번호)에만 쓴다. "분석 다시 하기" 는 원본을 건드리지 않는다.
- `partner_handoffs.payload` = 전달 시점 스냅샷(운영 OS 가 보는 것). 마스터 수정·최종 제안은 운영 OS 쪽 객체에 남는다.
- `partner_meeting_events` = 건너뛴 질문 · 어려워한 질문 · 열어본 팁/사례 · 소요시간 · 전달 — V1 이후 10건 검증용.


## 입력 검증 계약 (깨지 말 것)

> **Blocking Validation 이 있다면, 사용자가 그 값을 지금 보고 있는 화면에서 해결할 수 있어야 한다.**

값을 요구하는 오류를 띄우려면 같은 화면에 그 값을 넣는 UI 가 있어야 한다. 없으면 오류 대신 **입력 수단을 연다.**
화면을 단순화하면서 입력 UI 를 접거나 지울 때는 그 필드를 검증에서도 같이 내려야 한다(Request 5 → 6 에서 실제로 깨진 지점).

- 저장을 막는 값은 최소로 — PDF Quick Review 는 **회사명 하나**.
- 모르는 값은 기존 Domain 값(`'unknown'`, `'other'`)으로 안전 저장한다. 새 Enum 을 만들지 않는다.
- 꼭 물어야 하면 Hard Block 이 아니라 **Soft Confirm**: 한 번 묻되 버튼을 `disabled` 하지 않고, 그대로 진행할 길을 함께 둔다.
- 값이 비었다고 화면에서 필드를 숨기지 않는다. `미확인 + [선택]/[입력]` 로 무엇을 모르는지 보여 주고 그 자리에서 채우게 한다(`CompanyCoreSummary`).
- 모르는 값 때문에 엉뚱한 결과를 만들지 않는다 — 업종 미확인이면 사례 추천은 0개가 정답이다.

## UI 셸 · 테마 · Device View (2026-09 업그레이드)

- `src/index.css` — 토큰. 테마가 바꾸는 값은 `--th-*` 변수이고 `@theme inline` 으로 Tailwind 유틸리티(`bg-accent-600`, `bg-side` …)에 연결된다. 기본 Pure White, 나머지 6개는 `[data-theme=…]`.
- `src/lib/theme.tsx` · `src/lib/deviceView.tsx` · `src/lib/clock.ts` — 테마/Device View 는 localStorage 에 저장(브라우저별), 시계는 1초 틱(초 경계 정렬).
- `src/components/AppShell.tsx` — 그룹 사이드바(WORK/KNOWLEDGE/SYSTEM/MASTER, 272px) · 글로벌 헤더(라우트 제목 · 실시간 시계 · Device View · 사용자) · 하단 내비 5 · LIVE 포커스 모드(레일만).
  헤더 시계는 어떤 폭에서도 **날짜·요일·초 단위 시각**을 함께 보여 준다(좁으면 두 줄 `2026.09.22 화` / `13:31:08`, 넓으면 한 줄). 엘리먼트는 하나이고 폭에 따라 CSS 로 접는다 — 타이머는 `useClock()` 하나뿐.
- `src/components/DeviceFrame.tsx` — PC+Mobile 듀얼 뷰는 같은 앱을 390px iframe 으로 띄운다(`window.self !== window.top` 이면 프레임 모드 → 다시 프레임을 만들지 않음). 부모↔프레임 라우트는 postMessage 로 동기화하고 저장소(localStorage/Supabase 세션)는 같은 출처라 공유된다.
- 실제 사례 DB — `src/content/research-cases.json`(리서치 PDF 파싱 결과) → `src/content/cases.ts` 에서 `CaseStudy` 로 조립(설명 포인트·주의는 `caseText.ts` 가 사실 필드에서만 생성). 저장소는 이 청크를 필요할 때만 동적 import 한다.
