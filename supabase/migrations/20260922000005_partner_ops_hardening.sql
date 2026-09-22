-- =====================================================================
-- 미래AI랩 AX Partner OS · 0005 — 운영 안정화 (additive only)
-- ---------------------------------------------------------------------
-- 목적: 실수해도 데이터가 사라지지 않고, Partner OS 와 운영 OS 가 서로 다른 진실을 갖지 않게 한다.
--   1. partner_members.title (호칭) · 마지막 활성 마스터 보호(DB 트리거) · 마스터 전용 회원 수정 RPC
--   2. 고객 lifecycle: ACTIVE → ARCHIVED(휴지통) → RESTORE / PERMANENT DELETE(안전 RPC). 직접 DELETE 금지(RLS).
--   3. 담당 재배정(assigned_to) — 과거 작성자(consultant_id)는 덮어쓰지 않는다.
--   4. 미팅 'cancelled' · 미팅 삭제/취소 RPC (상태별 규칙)
--   5. 전달 요청 'withdrawn' ↔ 운영 OS customer_events 'ignored' (양방향 동일 진실) · 보관(archived_at) · 철회 후 재전달
--   6. partner_audit_events — 누가·언제·무엇을 바꿨는지 (마스터 조회)
--   7. partner_cases.last_verified_at · 검수 RPC
-- 기존 0001~0004 파일은 수정하지 않는다. 기존 데이터를 DROP/TRUNCATE 하지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 감사 로그
-- ---------------------------------------------------------------------
create table if not exists public.partner_audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_name  text not null default '',
  action      text not null,
  target_type text not null default '',
  target_id   text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists partner_audit_events_created_idx on public.partner_audit_events (created_at desc);
create index if not exists partner_audit_events_target_idx on public.partner_audit_events (target_type, target_id);
alter table public.partner_audit_events enable row level security;
revoke all on public.partner_audit_events from anon;
drop policy if exists "Masters read audit" on public.partner_audit_events;
create policy "Masters read audit"
  on public.partner_audit_events for select to authenticated
  using (public.partner_is_master());
-- insert/update/delete 정책 없음 = 클라이언트는 쓸 수 없다. 아래 SECURITY DEFINER 함수만 기록한다.

create or replace function public.partner_audit(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  select m.display_name into v_name from public.partner_members m where m.profile_id = auth.uid();
  insert into public.partner_audit_events (actor_id, actor_name, action, target_type, target_id, detail)
  values (auth.uid(), coalesce(v_name, ''), p_action, coalesce(p_target_type, ''), coalesce(p_target_id, ''), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.partner_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. 파트너: 호칭 · 프로필 원천 · 수정 RPC · 마지막 마스터 보호
-- ---------------------------------------------------------------------
alter table public.partner_members add column if not exists title text not null default '';

-- Partner OS 안의 이름·호칭·역할은 partner_members 가 원천이다 (auth.users 이메일은 그대로, 홈페이지 profiles 는 건드리지 않는다)
create or replace function public.partner_current_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m public.partner_members;
begin
  if auth.uid() is null then return null; end if;
  select * into m from public.partner_members where profile_id = auth.uid();
  if m.profile_id is not null then
    if not m.active then return null; end if;
    return jsonb_build_object('display_name', m.display_name, 'title', m.title, 'role', m.role, 'active', m.active, 'email', m.email);
  end if;
  if public.partner_is_master() then
    return jsonb_build_object('display_name', '', 'title', '', 'role', 'master', 'active', true, 'email', '');
  end if;
  return null;
end;
$$;
revoke all on function public.partner_current_profile() from public, anon;
grant execute on function public.partner_current_profile() to authenticated;

-- 마지막 활성 마스터는 비활성화·강등·삭제할 수 없다 (UI 가드가 아니라 DB 가 막는다)
create or replace function public.partner_members_guard()
returns trigger
language plpgsql
as $$
declare others int;
begin
  if old.role = 'master' and old.active
     and (tg_op = 'DELETE' or new.role <> 'master' or new.active = false) then
    select count(*) into others from public.partner_members m
     where m.role = 'master' and m.active and m.profile_id <> old.profile_id;
    if others = 0 then
      raise exception '마지막 활성 마스터는 비활성화하거나 강등할 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_partner_members_guard on public.partner_members;
create trigger trg_partner_members_guard
  before update or delete on public.partner_members
  for each row execute function public.partner_members_guard();

create or replace function public.partner_update_member(p_profile_id uuid, p_display_name text, p_title text, p_role text, p_active boolean)
returns public.partner_members
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.partner_members; v_old public.partner_members;
begin
  if not public.partner_is_master() then
    raise exception '마스터만 파트너 정보를 수정할 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('partner', 'master') then
    raise exception '역할은 partner 또는 master 여야 합니다.' using errcode = '22023';
  end if;
  select * into v_old from public.partner_members where profile_id = p_profile_id;
  if v_old.profile_id is null then
    raise exception '파트너를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if p_profile_id = auth.uid() and (p_active = false or (v_old.role = 'master' and p_role <> 'master')) then
    raise exception '본인 계정은 비활성화하거나 강등할 수 없습니다.' using errcode = 'P0001';
  end if;
  update public.partner_members
     set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         title = coalesce(btrim(p_title), ''),
         role = p_role,
         active = p_active
   where profile_id = p_profile_id
  returning * into v_row;
  perform public.partner_audit(case when v_old.active and not p_active then 'partner_deactivated' when not v_old.active and p_active then 'partner_activated' else 'partner_updated' end,
                               'partner', p_profile_id::text,
                               jsonb_build_object('before', jsonb_build_object('display_name', v_old.display_name, 'title', v_old.title, 'role', v_old.role, 'active', v_old.active),
                                                  'after', jsonb_build_object('display_name', v_row.display_name, 'title', v_row.title, 'role', v_row.role, 'active', v_row.active)));
  return v_row;
end;
$$;
revoke all on function public.partner_update_member(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.partner_update_member(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. 고객: 담당 재배정 컬럼 · 직접 DELETE 금지 · 소유/배정 기준 접근
-- ---------------------------------------------------------------------
alter table public.partner_companies add column if not exists assigned_to uuid references auth.users (id) on delete set null;
create index if not exists partner_companies_assigned_idx on public.partner_companies (assigned_to);
comment on column public.partner_companies.assigned_to is '현재 담당 파트너(재배정). null 이면 consultant_id(원 작성자)가 담당. 과거 미팅·전달의 consultant_id 는 덮어쓰지 않는다.';

-- 파트너는 배정된 고객도 본다/고친다. 담당·작성자 변경은 파트너가 할 수 없다(트리거).
drop policy if exists "Partners read own companies" on public.partner_companies;
create policy "Partners read own companies"
  on public.partner_companies for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or assigned_to = auth.uid() or public.partner_is_master()));
drop policy if exists "Partners update own companies" on public.partner_companies;
create policy "Partners update own companies"
  on public.partner_companies for update to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or assigned_to = auth.uid() or public.partner_is_master()))
  with check (public.partner_is_active() and (consultant_id = auth.uid() or assigned_to = auth.uid() or public.partner_is_master()));
drop policy if exists "Partners delete own companies" on public.partner_companies;
create policy "No direct company delete"
  on public.partner_companies for delete to authenticated
  using (false);

create or replace function public.partner_companies_guard()
returns trigger
language plpgsql
as $$
begin
  if not public.partner_is_master() then
    if new.consultant_id is distinct from old.consultant_id or new.assigned_to is distinct from old.assigned_to then
      raise exception '담당 파트너 변경은 마스터만 할 수 있습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_partner_companies_guard on public.partner_companies;
create trigger trg_partner_companies_guard
  before update on public.partner_companies
  for each row execute function public.partner_companies_guard();

-- 배정된 파트너는 그 고객의 미팅·전달도 본다. 새 미팅은 본인 이름으로만 만든다.
drop policy if exists "Partners read own meetings" on public.partner_meetings;
create policy "Partners read own meetings"
  on public.partner_meetings for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()
         or exists (select 1 from public.partner_companies c where c.id = company_id and c.assigned_to = auth.uid())));
drop policy if exists "Partners insert own meetings" on public.partner_meetings;
create policy "Partners insert own meetings"
  on public.partner_meetings for insert to authenticated
  with check (public.partner_is_active() and consultant_id = auth.uid()
              and exists (select 1 from public.partner_companies c where c.id = company_id and (c.consultant_id = auth.uid() or c.assigned_to = auth.uid())));
drop policy if exists "Partners update own meetings" on public.partner_meetings;
create policy "Partners update own meetings"
  on public.partner_meetings for update to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()
         or exists (select 1 from public.partner_companies c where c.id = company_id and c.assigned_to = auth.uid())))
  with check (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()
         or exists (select 1 from public.partner_companies c where c.id = company_id and c.assigned_to = auth.uid())));
drop policy if exists "Partners read own handoffs" on public.partner_handoffs;
create policy "Partners read own handoffs"
  on public.partner_handoffs for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()
         or exists (select 1 from public.partner_companies c where c.id = company_id and c.assigned_to = auth.uid())));

-- 미팅·전달 삭제는 RPC 로만 (직접 DELETE 정책 없음 = 거부)

create or replace function public.partner_can_manage_company(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.partner_is_active() and exists (
    select 1 from public.partner_companies c
     where c.id = p_company_id and (c.consultant_id = auth.uid() or c.assigned_to = auth.uid() or public.partner_is_master()));
$$;
revoke all on function public.partner_can_manage_company(uuid) from public, anon;
grant execute on function public.partner_can_manage_company(uuid) to authenticated;

create or replace function public.partner_assign_company(p_company_id uuid, p_profile_id uuid)
returns public.partner_companies
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.partner_companies; v_old uuid;
begin
  if not public.partner_is_master() then
    raise exception '담당 재배정은 마스터만 할 수 있습니다.' using errcode = '42501';
  end if;
  if p_profile_id is not null and not exists (select 1 from public.partner_members m where m.profile_id = p_profile_id and m.active) then
    raise exception '활성 파트너가 아닙니다.' using errcode = 'P0002';
  end if;
  select coalesce(assigned_to, consultant_id) into v_old from public.partner_companies where id = p_company_id;
  update public.partner_companies set assigned_to = p_profile_id where id = p_company_id returning * into v_row;
  if v_row.id is null then raise exception '고객을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform public.partner_audit('company_reassigned', 'company', p_company_id::text, jsonb_build_object('from', v_old, 'to', p_profile_id, 'name', v_row.name));
  return v_row;
end;
$$;
revoke all on function public.partner_assign_company(uuid, uuid) from public, anon;
grant execute on function public.partner_assign_company(uuid, uuid) to authenticated;

create or replace function public.partner_archive_company(p_company_id uuid)
returns public.partner_companies
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.partner_companies;
begin
  if not public.partner_can_manage_company(p_company_id) then
    raise exception '이 고객을 보관할 권한이 없습니다.' using errcode = '42501';
  end if;
  update public.partner_companies set archived_at = coalesce(archived_at, now()) where id = p_company_id returning * into v_row;
  perform public.partner_audit('company_archived', 'company', p_company_id::text, jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;
revoke all on function public.partner_archive_company(uuid) from public, anon;
grant execute on function public.partner_archive_company(uuid) to authenticated;

create or replace function public.partner_restore_company(p_company_id uuid)
returns public.partner_companies
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.partner_companies;
begin
  if not public.partner_can_manage_company(p_company_id) then
    raise exception '이 고객을 복구할 권한이 없습니다.' using errcode = '42501';
  end if;
  update public.partner_companies set archived_at = null where id = p_company_id returning * into v_row;
  perform public.partner_audit('company_restored', 'company', p_company_id::text, jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;
revoke all on function public.partner_restore_company(uuid) from public, anon;
grant execute on function public.partner_restore_company(uuid) to authenticated;

-- 영구삭제 전 영향 범위 + 가능 여부 (UI 는 이것을 보여 주고, DB 가 최종 판정한다)
create or replace function public.partner_company_delete_preview(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.partner_companies;
  n_meetings int; n_analyzed int; n_handoffs int; n_active int; n_transmitted int; n_events int;
  v_reason text := null; v_ok boolean := true; v_master boolean := public.partner_is_master();
begin
  if not public.partner_can_manage_company(p_company_id) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select * into c from public.partner_companies where id = p_company_id;
  select count(*), count(*) filter (where status in ('analyzed', 'submitted')) into n_meetings, n_analyzed from public.partner_meetings where company_id = p_company_id;
  select count(*), count(*) filter (where status in ('submitted', 'received', 'reviewing', 'proposal_ready')), count(*) filter (where customer_event_id is not null)
    into n_handoffs, n_active, n_transmitted from public.partner_handoffs where company_id = p_company_id;
  select count(*) into n_events from public.partner_meeting_events e join public.partner_meetings m on m.id = e.meeting_id where m.company_id = p_company_id;
  if c.archived_at is null then v_ok := false; v_reason := '먼저 휴지통으로 이동해야 영구 삭제할 수 있습니다.'; end if;
  if n_active > 0 then v_ok := false; v_reason := '운영 OS 에 전달된 2차 제안 요청이 있습니다. 먼저 요청을 철회하거나 고객을 보관 상태로 두세요.'; end if;
  if v_ok and n_transmitted > 0 and not v_master then v_ok := false; v_reason := '운영 OS 에 전달된 이력이 있는 고객은 마스터만 영구 삭제할 수 있습니다.'; end if;
  return jsonb_build_object('name', c.name, 'meetings', n_meetings, 'analyzed', n_analyzed, 'handoffs', n_handoffs, 'active_handoffs', n_active,
                            'transmitted', n_transmitted, 'usage_events', n_events, 'can_delete', v_ok, 'reason', v_reason, 'requires_master', n_transmitted > 0);
end;
$$;
revoke all on function public.partner_company_delete_preview(uuid) from public, anon;
grant execute on function public.partner_company_delete_preview(uuid) to authenticated;

-- 영구삭제 — UI 가 실수해도 DB 가 막는다. 회사명을 그대로 입력해야 한다.
create or replace function public.partner_delete_company_safe(p_company_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c public.partner_companies; prev jsonb; h record;
begin
  if not public.partner_can_manage_company(p_company_id) then
    raise exception '이 고객을 삭제할 권한이 없습니다.' using errcode = '42501';
  end if;
  select * into c from public.partner_companies where id = p_company_id;
  if c.id is null then raise exception '고객을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if replace(coalesce(p_confirm_name, ''), ' ', '') <> replace(c.name, ' ', '') then
    raise exception '회사명이 일치하지 않습니다.' using errcode = 'P0001';
  end if;
  prev := public.partner_company_delete_preview(p_company_id);
  if not (prev ->> 'can_delete')::boolean then
    raise exception '%', coalesce(prev ->> 'reason', '영구 삭제할 수 없습니다.') using errcode = 'P0001';
  end if;
  -- 운영 OS 쪽에 남는 이벤트(철회된 것)에 삭제 사실을 남긴다 — 서로 다른 진실을 만들지 않는다
  if to_regclass('public.customer_events') is not null then
    for h in select customer_event_id from public.partner_handoffs where company_id = p_company_id and customer_event_id is not null loop
      execute 'update public.customer_events set status = ''ignored'', customer_safe_payload = customer_safe_payload || $2 where id = $1'
        using h.customer_event_id, jsonb_build_object('partner_record_deleted', true, 'deleted_at', now());
    end loop;
  end if;
  perform public.partner_audit('company_deleted', 'company', p_company_id::text, prev || jsonb_build_object('name', c.name));
  delete from public.partner_companies where id = p_company_id;
  return prev;
end;
$$;
revoke all on function public.partner_delete_company_safe(uuid, text) from public, anon;
grant execute on function public.partner_delete_company_safe(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 미팅: 'cancelled' 상태 · 삭제/취소 RPC
-- ---------------------------------------------------------------------
do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
   where c.conrelid = 'public.partner_meetings'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%status%' and pg_get_constraintdef(c.oid) ilike '%analyzed%' limit 1;
  if v_con is not null then execute format('alter table public.partner_meetings drop constraint %I', v_con); end if;
  alter table public.partner_meetings add constraint partner_meetings_status_check check (status in ('draft','live','analyzed','submitted','cancelled'));
end $$;

create or replace function public.partner_cancel_meeting(p_meeting_id uuid)
returns public.partner_meetings
language plpgsql
security definer
set search_path = public
as $$
declare m public.partner_meetings;
begin
  select * into m from public.partner_meetings where id = p_meeting_id;
  if m.id is null then raise exception '미팅을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not public.partner_can_manage_company(m.company_id) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  if m.status not in ('draft', 'live') then raise exception '진행 중인 미팅만 취소할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.partner_meetings set status = 'cancelled', ended_at = coalesce(ended_at, now()) where id = p_meeting_id returning * into m;
  perform public.partner_audit('meeting_cancelled', 'meeting', p_meeting_id::text, jsonb_build_object('company_id', m.company_id));
  return m;
end;
$$;
revoke all on function public.partner_cancel_meeting(uuid) from public, anon;
grant execute on function public.partner_cancel_meeting(uuid) to authenticated;

-- draft/cancelled: 담당자 삭제 가능 · live: 취소 후 삭제 · analyzed: 마스터만 · submitted: 삭제 금지(전달 lifecycle 을 따른다)
create or replace function public.partner_delete_meeting(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m public.partner_meetings; n_h int;
begin
  select * into m from public.partner_meetings where id = p_meeting_id;
  if m.id is null then raise exception '미팅을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not public.partner_can_manage_company(m.company_id) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  if m.status = 'submitted' then raise exception '운영 OS 에 전달된 미팅은 삭제할 수 없습니다. 전달 요청을 먼저 철회하세요.' using errcode = 'P0001'; end if;
  if m.status = 'live' then raise exception '진행 중인 미팅은 먼저 취소해야 삭제할 수 있습니다.' using errcode = 'P0001'; end if;
  if m.status = 'analyzed' and not public.partner_is_master() then raise exception '분석이 끝난 미팅 삭제는 마스터 확인이 필요합니다.' using errcode = '42501'; end if;
  select count(*) into n_h from public.partner_handoffs where meeting_id = p_meeting_id and (customer_event_id is not null or status in ('submitted','received','reviewing','proposal_ready'));
  if n_h > 0 then raise exception '운영 OS 에 전달된 이력이 있는 미팅은 삭제할 수 없습니다.' using errcode = 'P0001'; end if;
  perform public.partner_audit('meeting_deleted', 'meeting', p_meeting_id::text, jsonb_build_object('company_id', m.company_id, 'status', m.status));
  delete from public.partner_meetings where id = p_meeting_id;
  return jsonb_build_object('deleted', true, 'status', m.status);
end;
$$;
revoke all on function public.partner_delete_meeting(uuid) from public, anon;
grant execute on function public.partner_delete_meeting(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 전달 요청: 'withdrawn' · archived_at · 철회/보관 RPC · 양방향 동기화 · 철회 후 재전달
-- ---------------------------------------------------------------------
alter table public.partner_handoffs add column if not exists withdrawn_at timestamptz;
alter table public.partner_handoffs add column if not exists withdraw_reason text not null default '';
alter table public.partner_handoffs add column if not exists archived_at timestamptz;
do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
   where c.conrelid = 'public.partner_handoffs'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%status%' and pg_get_constraintdef(c.oid) ilike '%proposal_ready%' limit 1;
  if v_con is not null then execute format('alter table public.partner_handoffs drop constraint %I', v_con); end if;
  alter table public.partner_handoffs add constraint partner_handoffs_status_check check (status in ('draft','submitted','received','reviewing','proposal_ready','withdrawn'));
end $$;

-- 철회: Partner 상태 withdrawn + 운영 OS 이벤트 ignored(+ 사유). 제안 준비완료 건은 철회 대신 보관만.
create or replace function public.partner_withdraw_handoff(p_handoff_id uuid, p_reason text default '')
returns public.partner_handoffs
language plpgsql
security definer
set search_path = public
as $$
declare h public.partner_handoffs;
begin
  select * into h from public.partner_handoffs where id = p_handoff_id;
  if h.id is null then raise exception '전달 요청을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not public.partner_can_manage_company(h.company_id) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  if h.status = 'withdrawn' then return h; end if;
  if h.status = 'proposal_ready' then raise exception '2차 제안이 준비된 요청은 철회할 수 없습니다. 보관만 할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.partner_handoffs set status = 'withdrawn', withdrawn_at = now(), withdraw_reason = coalesce(p_reason, '') where id = p_handoff_id returning * into h;
  if h.customer_event_id is not null and to_regclass('public.customer_events') is not null then
    execute 'update public.customer_events set status = ''ignored'', handled_at = coalesce(handled_at, now()), customer_safe_payload = customer_safe_payload || $2 where id = $1'
      using h.customer_event_id, jsonb_build_object('withdrawn', true, 'withdrawn_at', now(), 'withdraw_reason', coalesce(p_reason, ''));
  end if;
  update public.partner_meetings set status = 'analyzed' where id = h.meeting_id and status = 'submitted';
  perform public.partner_audit('handoff_withdrawn', 'handoff', p_handoff_id::text, jsonb_build_object('company_id', h.company_id, 'reason', coalesce(p_reason, '')));
  return h;
end;
$$;
revoke all on function public.partner_withdraw_handoff(uuid, text) from public, anon;
grant execute on function public.partner_withdraw_handoff(uuid, text) to authenticated;

create or replace function public.partner_archive_handoff(p_handoff_id uuid, p_archived boolean default true)
returns public.partner_handoffs
language plpgsql
security definer
set search_path = public
as $$
declare h public.partner_handoffs;
begin
  select * into h from public.partner_handoffs where id = p_handoff_id;
  if h.id is null then raise exception '전달 요청을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not public.partner_can_manage_company(h.company_id) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  update public.partner_handoffs set archived_at = case when p_archived then coalesce(archived_at, now()) else null end where id = p_handoff_id returning * into h;
  perform public.partner_audit(case when p_archived then 'handoff_archived' else 'handoff_unarchived' end, 'handoff', p_handoff_id::text, jsonb_build_object('company_id', h.company_id));
  return h;
end;
$$;
revoke all on function public.partner_archive_handoff(uuid, boolean) from public, anon;
grant execute on function public.partner_archive_handoff(uuid, boolean) to authenticated;

-- 역동기화(0002 대체): 운영 OS 가 ignored 로 두면 파트너도 withdrawn, 다시 new 로 열면 received — 양쪽이 같은 진실
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
                    when new.status = 'ignored' then 'withdrawn'
                    else 'received'
                  end,
         withdrawn_at = case when new.status = 'ignored' then coalesce(h.withdrawn_at, now()) else null end,
         withdraw_reason = case when new.status = 'ignored' then coalesce(nullif(h.withdraw_reason, ''), '운영 OS 에서 보류') else '' end,
         operations_client_id = coalesce(new.operations_client_id, h.operations_client_id)
   where h.customer_event_id = new.id;
  update public.partner_meetings m
     set status = case when new.status = 'ignored' then 'analyzed' else 'submitted' end
   where m.id in (select meeting_id from public.partner_handoffs where customer_event_id = new.id)
     and m.status in ('analyzed', 'submitted');
  return new;
end;
$$;
revoke all on function public.partner_on_customer_event_update() from public, anon, authenticated;

-- 전달(0002 대체): 철회된 요청을 다시 보내면 같은 이벤트를 다시 연다(new) — 새 이벤트를 만들지 않는다
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
  if not public.partner_can_manage_company(v_meeting.company_id) then
    raise exception '이 미팅을 전달할 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_meeting.status not in ('analyzed', 'submitted') then
    raise exception '미팅 종료·분석을 먼저 해야 전달할 수 있습니다.' using errcode = 'P0001';
  end if;
  v_safe := coalesce(p_customer_safe, '{}'::jsonb) - 'internal_notes' - 'internalNotes' - 'memo';

  select * into v_handoff from public.partner_handoffs h where h.meeting_id = p_meeting_id;

  -- 철회된 요청의 재전달: 같은 이벤트를 다시 연다
  if v_handoff.id is not null and v_handoff.status = 'withdrawn' then
    update public.partner_handoffs
       set payload = coalesce(p_payload, payload), customer_safe_payload = v_safe, status = case when customer_event_id is null then 'submitted' else 'received' end,
           withdrawn_at = null, withdraw_reason = '', submitted_at = now(), received_at = case when customer_event_id is null then received_at else now() end
     where id = v_handoff.id
    returning * into v_handoff;
    if v_handoff.customer_event_id is not null and to_regclass('public.customer_events') is not null then
      execute 'update public.customer_events set status = ''new'', handled_at = null, occurred_at = now(), customer_safe_payload = ($2 - ''withdrawn'' - ''withdrawn_at'' - ''withdraw_reason'') || jsonb_build_object(''handoff_id'', $3, ''meeting_id'', $4, ''resubmitted'', true) where id = $1'
        using v_handoff.customer_event_id, v_safe, v_handoff.id::text, p_meeting_id::text;
    end if;
    update public.partner_meetings set status = 'submitted', handoff_id = v_handoff.id where id = p_meeting_id;
    perform public.partner_audit('handoff_resubmitted', 'handoff', v_handoff.id::text, jsonb_build_object('company_id', v_handoff.company_id));
    return jsonb_build_object('handoff', to_jsonb(v_handoff), 'created', true);
  end if;

  if v_handoff.id is not null and v_handoff.customer_event_id is not null then
    return jsonb_build_object('handoff', to_jsonb(v_handoff), 'created', false);
  end if;

  if v_handoff.id is null then
    insert into public.partner_handoffs (meeting_id, company_id, consultant_id, status, payload, customer_safe_payload, submitted_at)
    values (p_meeting_id, v_meeting.company_id, v_meeting.consultant_id, 'submitted', coalesce(p_payload, '{}'::jsonb), v_safe, now())
    returning * into v_handoff;
    v_created := true;
  else
    update public.partner_handoffs
       set payload = coalesce(p_payload, payload), customer_safe_payload = v_safe, status = 'submitted', submitted_at = coalesce(submitted_at, now())
     where id = v_handoff.id
    returning * into v_handoff;
  end if;

  if to_regprocedure('public.bridge_emit_customer_event(text,text,text,jsonb,text,uuid,uuid,timestamptz)') is not null then
    v_dedupe := 'partner_handoff:' || v_handoff.id::text || ':ax_proposal_requested';
    execute 'select public.bridge_emit_customer_event($1, $2, $3, $4, $5, null, null, now())'
      into v_event
      using 'ax_proposal_requested', 'partner_handoff', v_handoff.id::text,
            v_safe || jsonb_build_object('handoff_id', v_handoff.id::text, 'meeting_id', p_meeting_id::text),
            'high';
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

  update public.partner_meetings set status = 'submitted', handoff_id = v_handoff.id where id = p_meeting_id;
  perform public.partner_audit('handoff_submitted', 'handoff', v_handoff.id::text, jsonb_build_object('company_id', v_handoff.company_id, 'created', v_created));
  return jsonb_build_object('handoff', to_jsonb(v_handoff), 'created', v_created);
end;
$$;
revoke all on function public.partner_submit_handoff(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.partner_submit_handoff(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 사례 검수: last_verified_at · 검수 RPC (감사 기록)
-- ---------------------------------------------------------------------
alter table public.partner_cases add column if not exists last_verified_at timestamptz;
update public.partner_cases set last_verified_at = coalesce(nullif(source_date, '')::date, now())
 where last_verified_at is null and verification_status = 'verified';

create or replace function public.partner_review_case(p_case_id text, p_status text, p_note text default '')
returns public.partner_cases
language plpgsql
security definer
set search_path = public
as $$
declare c public.partner_cases;
begin
  if not public.partner_is_master() then raise exception '사례 검수는 마스터만 할 수 있습니다.' using errcode = '42501'; end if;
  if p_status not in ('verified', 'needs_review', 'draft') then raise exception '검수 상태가 올바르지 않습니다.' using errcode = '22023'; end if;
  update public.partner_cases
     set verification_status = p_status,
         review_required = (p_status <> 'verified'),
         last_verified_at = case when p_status = 'verified' then now() else last_verified_at end,
         payload = payload || jsonb_build_object('reviewRequired', p_status <> 'verified', 'reviewNote', coalesce(p_note, ''), 'lastVerifiedAt', case when p_status = 'verified' then now() else null end)
   where id = p_case_id
  returning * into c;
  if c.id is null then raise exception '사례를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform public.partner_audit('case_reviewed', 'case', p_case_id, jsonb_build_object('status', p_status, 'note', coalesce(p_note, ''), 'company', c.company_name));
  return c;
end;
$$;
revoke all on function public.partner_review_case(text, text, text) from public, anon;
grant execute on function public.partner_review_case(text, text, text) to authenticated;
