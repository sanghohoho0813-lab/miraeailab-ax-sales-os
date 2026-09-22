# AX Partner OS — 운영 안정화(CRUD · Responsive · Field-Reliability) 보고 (2026-09-22)

브랜치: `claude/festive-babbage-uj6ugd` · 운영 OS 패치: `AX-MVP-Factory-OS` `claude/partner-os-handoff-v1` (withdrawn 라벨 커밋 추가) · main 은 두 저장소 모두 건드리지 않음 · migration 0001~0004 수정 없음(0005 추가만).

## 1. 코드 Audit 에서 발견한 문제

| # | 발견 | 위험 | 조치 |
|---|---|---|---|
| 1 | RLS `Partners delete own companies` 가 파트너의 직접 `DELETE` 를 허용. cascade 로 미팅·전달까지 지워지지만 운영 OS `customer_events` 는 남아 서로 다른 진실이 됨 | 데이터 유실 · Cross-System 불일치 | 0005: 직접 DELETE 정책을 `using (false)` 로 교체. 삭제는 `partner_delete_company_safe` RPC 만(권한·보관 여부·회사명·활성 요청·전달 이력·운영 OS 상태 확인) |
| 2 | `archiveCompany()` 가 있지만 UI 에서 쓰지 않음. 휴지통·복구 없음 | 실수 복구 불가 | 보관 → 휴지통 → 복구/영구삭제 lifecycle + Undo 토스트 |
| 3 | 전달 요청(handoff)에 취소·철회 개념 없음. `Masters update handoffs` 만 있어 파트너는 아무것도 못 바꿈 | "보낸 상담을 지우고 싶다" 요구를 DELETE 로 풀 위험 | `withdrawn` 상태 + `partner_withdraw_handoff` RPC. 운영 OS 이벤트를 `ignored`(+사유) 로, 재전달 시 같은 이벤트를 `new` 로 다시 연다. 역방향 트리거도 `ignored ↔ withdrawn` |
| 4 | 미팅 삭제 경로 없음, `cancelled` 상태 없음 | 실수로 시작한 미팅이 영구히 남음 | 상태별 규칙(draft/cancelled 삭제, live 취소 후, analyzed 마스터, submitted 불가) RPC |
| 5 | 파트너 관리에 등록·활성/비활성만. `partner_members.title` 없음. `setMemberActive` 가 직접 update | 마지막 마스터를 비활성화하면 아무도 관리 못 함 | `title` 컬럼 · `partner_update_member` RPC(본인 비활성화/강등 금지) · DB 트리거로 마지막 활성 마스터 보호 |
| 6 | Auth 부트스트랩이 `profiles.name` 을 읽어 파트너 이름을 만들었음 → 마스터가 `partner_members.display_name` 을 바꿔도 인사말에 반영 안 됨 | 운영 혼선 | `partner_current_profile()` 가 Partner OS 안 이름·호칭·역할의 원천. Auth 이메일·홈페이지 profiles 는 그대로 |
| 7 | 1024px 부터 272px 사이드바 + `lg:grid-cols-3` 테마 그리드 → 1024~1200 에서 스와치·텍스트가 눌림 | 중간폭 깨짐 | 1024~1279 아이콘 레일(72px), ≥1280 전체 사이드바. 테마 그리드 `repeat(auto-fit, minmax(260px,1fr))`, 스와치 68px 고정 |
| 8 | PC+Mobile 듀얼 뷰의 PC pane(67%)이 브라우저 viewport 기준 breakpoint 를 그대로 씀 | pane 보다 큰 화면이라고 착각 | 두 pane 모두 가상 뷰포트 iframe(PC 1280px · Mobile 390px)을 scale. 1440px 미만은 PC 로 fallback + 안내 |
| 9 | LIVE 저장이 250ms debounce → `updateMeeting` 직행. 요청이 겹치면 늦은 응답이 최신 상태를 덮을 수 있고, 실패 시 toast 뿐 | 현장 데이터 유실 | latest-write 직렬 저장기 + 기기 임시 저장본 + online 재시도 + 저장 상태 표시 + 이탈 가드 |
| 10 | 동일 회사 중복 등록 가능, 감사 로그 없음, 사용 이벤트를 보는 화면 없음 | 운영 품질 | 중복 안내 시트, `partner_audit_events`, 사용 데이터/변경 기록 화면 |

## 2. 변경 파일 (핵심)

- DB: `supabase/migrations/20260922000005_partner_ops_hardening.sql` (신규) · `supabase/tests/partner_os_contract.sql` (T8~T12 추가)
- 데이터: `src/types/domain.ts` · `src/data/repository.ts` · `src/data/localRepository.ts` · `src/data/supabaseRepository.ts` · `src/lib/auth.tsx` · `src/lib/saveQueue.ts`(신규)
- 셸·반응형: `src/components/AppShell.tsx` · `src/components/DeviceFrame.tsx` · `src/lib/deviceView.tsx` · `src/index.css` · `src/pages/SettingsPage.tsx`
- 위험 작업 UX: `src/components/ui.tsx`(DangerModal · SaveStatusPill · Toast action) · `src/pages/CompanyTrashPage.tsx`(신규) · `CompaniesPage` · `CompanyPage` · `CompanyNewPage` · `HandoffPage` · `MeetingResultPage` · `MeetingsPage` · `MeetingLivePage`
- 마스터: `MasterPartnersPage` · `MasterPartnerProfilePage`(신규) · `MasterInboxPage` · `MasterAuditPage`(신규) · `MasterUsagePage`(신규) · `CasesPage`(검수 큐·빠른 검수) · `src/content/caseText.ts`(출처 재확인)
- 테스트: `e2e/hardening.spec.ts`(신규) · `e2e/screens.spec.ts` · `playwright.config.ts`
- 운영 OS: `src/services/partnerHandoffService.ts` (`withdrawn` 타입·라벨)

## 3. 새 Migration — 0005 (additive only)

`partner_members.title` · `partner_companies.assigned_to` · `partner_meetings.status += cancelled` · `partner_handoffs.status += withdrawn`, `withdrawn_at`, `withdraw_reason`, `archived_at` · `partner_cases.last_verified_at` · `partner_audit_events` 테이블 · RPC: `partner_current_profile`, `partner_update_member`, `partner_assign_company`, `partner_archive_company`, `partner_restore_company`, `partner_company_delete_preview`, `partner_delete_company_safe`, `partner_cancel_meeting`, `partner_delete_meeting`, `partner_withdraw_handoff`, `partner_archive_handoff`, `partner_review_case` · `partner_submit_handoff` 재정의(철회 후 재전달) · 역동기화 트리거 재정의 · 트리거: `partner_members_guard`(마지막 마스터), `partner_companies_guard`(파트너의 담당 변경 금지) · RLS: 직접 DELETE 차단, 배정 파트너 읽기.

## 4. 고객 삭제 Lifecycle

ACTIVE → [휴지통으로 이동](1차 confirm · Undo 토스트) → ARCHIVED(목록·미팅에서 숨김, `/companies/trash`) → [복구] 또는 [영구 삭제](STEP1 영향 범위: 미팅/분석/요청/전달 이력/사용 이벤트 + "되돌릴 수 없습니다" → STEP2 회사명 입력 시에만 활성).
DB 규칙: 보관 전 삭제 불가 · 활성 요청(submitted/received/reviewing/proposal_ready) 있으면 불가 · 전달 이력(customer_event_id)이 있으면 마스터만 · 삭제 시 운영 OS 이벤트에 `partner_record_deleted` 표시. `window.confirm` 사용 0.

## 5. Handoff Withdraw 정책

| 상황 | 가능한 일 |
|---|---|
| 미전달 초안(분석 완료, 요청 전) | 미팅 삭제(마스터) / 그대로 둠 |
| 전달됨(submitted/received/reviewing) | **요청 철회** → Partner `withdrawn`, 운영 OS 이벤트 `ignored`(+withdrawn, 사유). 미팅은 분석 완료로 돌아가고 **다시 전달**하면 같은 이벤트가 `new` 로 다시 열린다(새 이벤트 없음) |
| 제안 준비완료(proposal_ready) | 철회 불가 — **보관**만(기록 보존) |
| 운영 OS 가 보류(`ignored`) | Partner 도 `withdrawn`(사유 '운영 OS 에서 보류'). 다시 `new` 로 열면 `received` |
계약 테스트 T9 가 양방향을 검증한다. 새 event_type 은 만들지 않았다(운영 OS 체크 제약·UI 변경 최소).

## 6. 파트너 수정 정책

마스터만 · 표시 이름/직책/역할/상태 한 번에 저장 · 이메일 읽기 전용(Auth 소유) · 본인 비활성화/강등 금지(RPC) · 마지막 활성 마스터 비활성화/강등/삭제 금지(DB 트리거 + UI 잠금) · 이름·호칭은 `partner_current_profile()` 로 인사말·헤더·PDF·전달 패킷에 반영 · 파트너 상세(`/master/partners/:id`)에서 담당 고객/미팅/요청/최근 활동 · 담당 재배정은 `assigned_to` 로만, 과거 작성자 유지.

## 7. Responsive Breakpoint 변경

| 폭 | 이전 | 이후 |
|---|---|---|
| <1024 | 모바일/태블릿 셸 | 동일 |
| 1024~1279 | 272px 전체 사이드바 (본문 급감) | **72px 아이콘 레일**(툴팁·그룹 구분선) |
| ≥1280 | 272px | 272px 전체 사이드바 |
| 헤더 | viewport 기준 | 컨테이너 쿼리: 제목 > 시간 > 사용자 유지, 날짜·Device 라벨·사용자 이름은 폭에 따라 축약 |
| 설정 테마 | `lg:grid-cols-3` | `repeat(auto-fit, minmax(260px,1fr))`, 스와치 68px 고정(테스트가 ≥66px·카드 ≥258px 검증) |
| PC+Mobile | 67%/33% 실제 렌더 | 1280px·390px 가상 뷰포트 iframe scale · ≥1440 만 허용, 미만은 PC fallback + 안내 |

## 8. LIVE 저장 안정성

`SaveQueue`(latest-write 직렬 실행기): 저장 중에 들어온 상태는 최신 하나만 다음에 보냄 · 모든 변경은 즉시 `localStorage` 임시 저장본(`axpartner.draft.meeting.<id>`, synced 플래그) · 실패 시 `offline`/`error` 상태 + 8초 재시도 + `online` 이벤트 재시도 · 헤더 상태 `저장됨 ✓ / 저장 중… / 끊김 · 임시저장됨` · 페이지 진입 시 서버보다 새 임시본이 있으면 복구 후 재저장 · `beforeunload` 에서 flush 시도 + 경고 · 마무리 전 flush 실패 시 진행 차단.

## 9. 추가한 E2E (hardening 프로젝트 5 + screens 3)

1. 고객 lifecycle: 생성 → 보관 → 목록에서 사라짐 → 휴지통 → 복구 → 목록 → 보관(Undo) → 영구삭제 모달(영향 범위·회사명 불일치 시 비활성) → 삭제
2. Handoff guard: 전달 → 보관 → 영구삭제 차단(사유 표시) → 복구 → 철회(사유) → 운영 OS 이벤트 `ignored`+withdrawn → 재전달 → 같은 이벤트 `new`(1건 유지)
3. 파트너 수정: 이름·직책 변경 → 파트너 인사말·헤더 반영 → 마지막 마스터 셀렉트 잠김 → 상세 페이지
4. 중복 등록 안내 시트 → 그래도 등록
5. LIVE 오프라인: 저장 실패 훅 + `context.setOffline` → 임시저장 표시·draft 파일 → 복구 시 자동 동기화 → 새로고침 후 답변 유지
6. screens: 900/1024/1100/1180/1200/1280 추가(테마 스와치·카드 최소폭 검증), dual 1280 fallback, rail/full 전환

## 10. SQL Contract

T1~T7(기존) + T8 고객 lifecycle · T9 철회 양방향 · T10 파트너 수정/마지막 마스터 · T11 담당 재배정 · T12 미팅 삭제/사례 검수/감사 — **ALL ASSERTIONS PASSED** (홈페이지 → 운영 OS → Partner OS 0001~0005 리플레이).

## 11~12. 스크린샷

`e2e/screenshots/qa/{900,1024,1100,1180,1200,1280}-{settings,partners,new-meeting,cases,inbox,trash,…}.png`, `dual-1440-*.png`, 모바일 `390/430-*.png`, hardening 흐름 `hardening-h01-trash.png`, `hardening-h02-delete-modal.png`. 대표 컷 29장은 `docs/screenshots/hardening/` 에 커밋 (1024/1100/1180/1280 × settings·partners·home·trash·inbox, 900·390 모바일 tier, dual-1440, 휴지통·삭제 모달).

## 13. 알려진 한계

- 재전달은 "같은 이벤트를 다시 연다" 계약이므로 운영 OS 이벤트함에서 처리 이력(handled_at)이 초기화된다. 운영 OS 쪽 처리 노트가 있었다면 그대로 남는다.
- 담당 재배정 후 새 미팅의 `consultant_id` 는 새 담당이고, 과거 미팅은 원 작성자(의도). 전달 패킷의 consultant 는 미팅 작성자 기준.
- 사용 데이터는 클라이언트 집계(최대 5,000 이벤트). 미팅 10건 미만이면 패턴을 숨긴다.
- 오프라인 E2E 는 local 모드의 저장 실패 훅으로 검증했다. 실제 Supabase 단절은 같은 코드 경로(`SaveQueue`)를 타지만 운영 환경에서 한 번 확인이 필요하다.
- Unified Design System v4.0 문서는 여전히 없다(디자인은 그대로 유지).

## 14. 다음 실제 미팅 10건에서 볼 지표

기존 7개(소요시간·건너뜀/어려움 비율·코치 열람·사례 사용 전환·2차 제안 전환·PDF 비율·사전진단 연결률)에 더해: 임시저장(offline/error) 발생 횟수와 복구 성공률, 철회율과 철회 사유, 휴지통 이동 후 복구 비율(실수 지표), 중복 안내 노출 후 "기존 고객 열기" 선택 비율, 검수 큐 처리 속도(건/일).
