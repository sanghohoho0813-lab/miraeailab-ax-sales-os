# INTEGRATION — 홈페이지 → Partner OS → 운영 OS 데이터 계약

정본 SQL: `supabase/migrations/20260922000001_partner_os.sql`, `20260922000002_partner_os_bridge.sql` · 계약 테스트: `supabase/tests/partner_os_contract.sql`

## 1. 테이블 (모두 `public`, RLS on, anon 차단)

| 테이블 | 키 | 누가 쓰나 | 비고 |
|---|---|---|---|
| `partner_members` | `profile_id` | 마스터(RPC `partner_add_member`) | role partner/master · active |
| `partner_companies` | `id` | 파트너 본인 | 클릭형 기본정보 · `diagnosis` jsonb(사전진단 스냅샷, 개인정보 없음) |
| `partner_meetings` | `id` | 파트너 본인 | `answers` 원본 · `analysis` 버전 · `handoff_id` |
| `partner_handoffs` | `id`, `meeting_id` unique | RPC/트리거만 | `payload`(INTERNAL 포함) · `customer_safe_payload` · `customer_event_id` · `status` |
| `partner_meeting_events` | `id` | 파트너 본인 insert | 사용률 이벤트 11종 |
| `partner_cases` | `id` text | 마스터 | `verification_status` draft/needs_review/verified · 금액/한도 분리 |

## 2. RPC

| 함수 | 권한 | 역할 |
|---|---|---|
| `partner_current_role()` | authenticated | `'master' \| 'partner' \| null` — 앱 부트스트랩 |
| `partner_is_master()` / `partner_is_active()` | authenticated | RLS 정책이 쓰는 헬퍼 (SECURITY DEFINER) |
| `partner_add_member(email, name, role)` | 마스터만 | 홈페이지 회원 이메일로 파트너 등록 |
| `partner_lookup_diagnosis(company_name, phone)` | 활성 파트너 | 회사명(공백 제거)+휴대폰(숫자) 일치 또는 `assigned_to = auth.uid()` 인 리드의 `{lead_id, grade, score, answers, submitted_at, matched_by}` 만 반환 |
| **`partner_submit_handoff(meeting_id, payload, customer_safe)`** | 미팅 소유자/마스터 | 아래 §3 |

## 3. 전달(Handoff) 계약

```
partner_submit_handoff(p_meeting_id, p_payload, p_customer_safe)
  1. 미팅 소유 확인, status ∈ {analyzed, submitted}
  2. partner_handoffs upsert (meeting_id unique) — 이미 customer_event_id 가 있으면 {created:false} 로 즉시 반환
  3. bridge_emit_customer_event('ax_proposal_requested', 'partner_handoff', <handoff id>,
        customer_safe ∪ {handoff_id, meeting_id}, 'high')
       → customer_events (dedupe_key = 'partner_handoff:<handoff id>:ax_proposal_requested', 라우팅 = default_intake_workspace())
  4. handoff.status = 'received', customer_event_id 저장 · meeting.status = 'submitted'
  반환: { handoff: <row>, created: bool }
```

- `customer_safe_payload` 에는 `internal_notes/internalNotes/memo` 키를 서버가 제거한다. 내부 판단·수임 메모는 이벤트함에 가지 않는다.
- 운영 OS 브릿지 함수가 없는 환경에서는 handoff 만 `submitted` 로 저장하고 실패하지 않는다.

`payload`(jsonb, `HandoffPayload` v1): `company · consultant · meetingDate · diagnosis · answers[] · keyQuotes[] · confirmedFacts[] · assumptions[] · unknownItems[] · painPoints[] · recommendedAxScope{axNeed, scopeLevel A~D, validationPotential, fundingReadiness, structure[]} · similarCases[] · valuePotential{7} · fundingInterest · followupQuestions(≤3) · internalNotes · clientSafeSummary[] · usage`

### 상태 (파트너 화면에 그대로 보인다)

| `partner_handoffs.status` | 언제 |
|---|---|
| `submitted` | RPC 가 handoff 를 만들었다 (이벤트 미등록 환경) |
| `received` | `customer_events` 행이 생겼다 = 운영 OS 이벤트함에 들어갔다 |
| `reviewing` | 운영 OS 가 이벤트를 `linked` / `in_progress` 로 바꿨다 (트리거 `partner_on_customer_event_update`) — `operations_client_id` 도 복사 |
| `proposal_ready` | 운영 OS 가 `resolved` 로 바꿨다 |

## 4. 운영 OS 앱이 알아야 하는 것

- `customer_events.event_type` 에 **`ax_proposal_requested`** 가 추가된다 (…0002 가 check 제약을 확장).
- `customer_safe_payload` 예: `{company_name, representative_name?, phone?, industry, headcount, trade_type, consultant_name, meeting_date, ax_need, scope_level, scope_label, top_problems, followup_count, key_quote, source:'AX Partner OS', handoff_id, meeting_id}`
- 상세 패킷은 `partner_handoffs`(workspace 멤버 = 마스터 → `partner_is_master()` 로 select 가능) 의 `payload` 에 있다.
- 이벤트를 고객사와 연결(`operations_client_id`)하고 상태를 바꾸면 파트너 쪽 상태가 자동으로 따라온다. 별도 호출 없음.

운영 OS 패치(브랜치 `claude/partner-os-handoff-v1`, 저장소 `AX-MVP-Factory-OS`)는 `docs/SETUP.md §3` 참고.

## 5. 홈페이지가 알아야 하는 것

없음. 홈페이지 코드·스키마 변경 0. Partner OS 는 홈페이지 리드를 RPC 로만 읽는다(개인정보는 반환하지 않음). 마스터가 특정 파트너에게 리드를 배정하려면 홈페이지 관리자 화면이 이미 갖고 있는 `business_diagnosis_leads.assigned_to` 를 파트너 `auth.users.id` 로 채우면 된다(회사명 일치 시 연락처 없이도 연결).
