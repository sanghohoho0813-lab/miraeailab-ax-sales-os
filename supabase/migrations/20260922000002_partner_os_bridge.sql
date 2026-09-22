-- =====================================================================
-- 미래AI랩 AX Partner OS · V1 — 운영 OS 브릿지
-- ---------------------------------------------------------------------
-- "곽주환 팀장님이 미팅을 마치고 버튼 한 번 누르면, 김상호 대표의 운영 OS 에
--  해당 기업의 2차 제안 요청이 즉시 들어오는가?" — 이 파일이 그 길이다.
--
-- 경로: partner_submit_handoff(RPC, SECURITY DEFINER)
--        → partner_handoffs upsert (meeting_id 유니크 = 중복 방지)
--        → bridge_emit_customer_event('ax_proposal_requested', 'partner_handoff', <handoff id>, …)
--          (운영 OS 브릿지 …0006/0008 의 함수 재사용. dedupe_key 유니크 = 두 번째 방어)
--        → customer_events 행 → 운영 OS 고객 이벤트함 / 오늘 Top 3
--   역방향: 운영 OS 가 이벤트를 linked/in_progress/resolved 로 바꾸면 트리거가
--          partner_handoffs.status 를 reviewing / proposal_ready 로 올린다.
--
-- 전제: 운영 OS 브릿지 마이그레이션(20260903000006 ~ 0008)이 적용돼 있어야
--       customer_events / bridge_emit_customer_event / default_intake_workspace 가 있다.
--       없는 환경에서는 RPC 가 handoff 만 저장하고 status='submitted' 로 두며 실패하지 않는다.
--
-- ⚠ 운영 OS 앱 배포 순서: 이 파일은 customer_events.event_type 에 'ax_proposal_requested' 를
--   추가한다. 운영 OS 앱(AX-MVP-Factory-OS)이 이 타입을 렌더링하도록 먼저 배포한 뒤 적용한다
--   (docs/INTEGRATION.md). 원칙: additive · 멱등 · RLS 유지.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. customer_events.event_type 에 'ax_proposal_requested' 추가 (check 제약 확장)
-- ---------------------------------------------------------------------
do $$
declare
  v_con text;
  v_def text;
begin
  if to_regclass('public.customer_events') is null then
    return; -- 운영 OS 브릿지 미적용 환경 — 아래 트리거도 건너뛴다
  end if;

  select c.conname, pg_get_constraintdef(c.oid)
    into v_con, v_def
  from pg_constraint c
  where c.conrelid = 'public.customer_events'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%'
  limit 1;

  if v_con is not null and v_def not ilike '%ax_proposal_requested%' then
    execute format('alter table public.customer_events drop constraint %I', v_con);
    execute $c$alter table public.customer_events add constraint customer_events_event_type_check
      check (event_type in (
        'diagnosis_completed', 'consultation_requested', 'service_order_created',
        'document_uploaded', 'customer_request_created', 'customer_action_completed',
        'customer_reply', 'profile_updated', 'ax_proposal_requested'))$c$;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. partner_submit_handoff — 버튼 한 번 = 운영 OS 등록 1건 (idempotent)
--    반환: { handoff: <row jsonb>, created: bool }
-- ---------------------------------------------------------------------
create or replace function public.partner_submit_handoff(p_meeting_id uuid, p_payload jsonb, p_customer_safe jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_meeting  public.partner_meetings;
  v_handoff  public.partner_handoffs;
  v_created  boolean := false;
  v_event    uuid;
  v_dedupe   text;
  v_safe     jsonb;
begin
  if uid is null or not public.partner_is_active() then
    raise exception '파트너 권한이 필요합니다.' using errcode = '42501';
  end if;

  select * into v_meeting from public.partner_meetings m where m.id = p_meeting_id;
  if v_meeting.id is null then
    raise exception '미팅을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_meeting.consultant_id <> uid and not public.partner_is_master() then
    raise exception '이 미팅을 전달할 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_meeting.status not in ('analyzed', 'submitted') then
    raise exception '미팅 종료·분석을 먼저 해야 전달할 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 이벤트함에는 내부 메모를 넣지 않는다
  v_safe := coalesce(p_customer_safe, '{}'::jsonb) - 'internal_notes' - 'internalNotes' - 'memo';

  -- 1) handoff 는 meeting_id 당 1건 — 이미 있고 이벤트까지 등록돼 있으면 그대로 돌려준다
  select * into v_handoff from public.partner_handoffs h where h.meeting_id = p_meeting_id;
  if v_handoff.id is not null and v_handoff.customer_event_id is not null then
    return jsonb_build_object('handoff', to_jsonb(v_handoff), 'created', false);
  end if;

  if v_handoff.id is null then
    insert into public.partner_handoffs (meeting_id, company_id, consultant_id, status, payload, customer_safe_payload, submitted_at)
    values (p_meeting_id, v_meeting.company_id, v_meeting.consultant_id, 'submitted', coalesce(p_payload, '{}'::jsonb), v_safe, now())
    returning * into v_handoff;
    v_created := true;
  else
    -- 이전 시도가 이벤트 등록 전에 끊긴 경우 — 패킷을 갱신하고 다시 시도한다
    update public.partner_handoffs
       set payload = coalesce(p_payload, payload), customer_safe_payload = v_safe, status = 'submitted', submitted_at = coalesce(submitted_at, now())
     where id = v_handoff.id
    returning * into v_handoff;
  end if;

  -- 2) 운영 OS 이벤트함 등록 (브릿지 함수가 있을 때만)
  if to_regprocedure('public.bridge_emit_customer_event(text,text,text,jsonb,text,uuid,uuid,timestamptz)') is not null then
    v_dedupe := 'partner_handoff:' || v_handoff.id::text || ':ax_proposal_requested';
    execute 'select public.bridge_emit_customer_event($1, $2, $3, $4, $5, null, null, now())'
      into v_event
      using 'ax_proposal_requested', 'partner_handoff', v_handoff.id::text,
            v_safe || jsonb_build_object('handoff_id', v_handoff.id::text, 'meeting_id', p_meeting_id::text),
            'high';
    -- dedupe 충돌로 null 이 돌아오면 이미 있는 이벤트를 찾는다
    if v_event is null then
      execute 'select e.id from public.customer_events e where e.dedupe_key = $1 limit 1' into v_event using v_dedupe;
    end if;
    if v_event is not null then
      update public.partner_handoffs
         set customer_event_id = v_event, status = 'received', received_at = now()
       where id = v_handoff.id
      returning * into v_handoff;
      v_created := true;
    end if;
  end if;

  -- 3) 미팅 상태
  update public.partner_meetings
     set status = 'submitted', handoff_id = v_handoff.id
   where id = p_meeting_id;

  return jsonb_build_object('handoff', to_jsonb(v_handoff), 'created', v_created);
end;
$$;
revoke all on function public.partner_submit_handoff(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.partner_submit_handoff(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 역방향 — 운영 OS 가 이벤트를 처리하면 파트너 화면의 상태가 따라온다
-- ---------------------------------------------------------------------
create or replace function public.partner_on_customer_event_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type <> 'ax_proposal_requested' then
    return new;
  end if;
  update public.partner_handoffs h
     set status = case
                    when new.status = 'resolved' then 'proposal_ready'
                    when new.status in ('linked', 'in_progress') then 'reviewing'
                    when new.status = 'ignored' then h.status
                    else 'received'
                  end,
         operations_client_id = coalesce(new.operations_client_id, h.operations_client_id)
   where h.customer_event_id = new.id;
  return new;
end;
$$;
revoke all on function public.partner_on_customer_event_update() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.customer_events') is not null then
    execute 'drop trigger if exists trg_partner_on_customer_event_update on public.customer_events';
    execute 'create trigger trg_partner_on_customer_event_update
               after update of status, operations_client_id on public.customer_events
               for each row execute function public.partner_on_customer_event_update()';
  end if;
end
$$;

-- ------------------------------------------------------------------
-- 확인용
-- ------------------------------------------------------------------
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.customer_events'::regclass and conname = 'customer_events_event_type_check';
--   -- → 'ax_proposal_requested' 포함
--   select proname from pg_proc where proname in ('partner_submit_handoff','partner_on_customer_event_update');
