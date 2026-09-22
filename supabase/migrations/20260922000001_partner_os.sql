-- =====================================================================
-- 미래AI랩 AX Partner OS · V1 — 파트너 테이블 · RLS · RPC
-- ---------------------------------------------------------------------
-- 대상: 미래AI랩 공용 Supabase 프로젝트(mirae-ai-lab). 홈페이지(miraeailab.com)와
--       내부 운영 OS(AX-MVP-Factory-OS)가 이미 같은 프로젝트를 쓴다.
--
-- 원칙 (운영 OS 브릿지 마이그레이션과 동일)
--   * additive only — 기존 테이블/컬럼/정책을 DROP·RENAME·TRUNCATE 하지 않는다
--   * 멱등 — if not exists / create or replace / drop policy if exists
--   * 파트너는 본인 행만 (consultant_id = auth.uid()); 마스터는 전체
--   * 운영 OS 기본 테이블(operations_clients, customer_events…)은 파트너가 직접 읽지 않는다.
--     운영 OS 전달은 SECURITY DEFINER RPC(partner_submit_handoff) 만 한다 (…0002 에서 정의)
--   * anon 은 아무것도 못 한다. service_role 에 의존하는 프런트 기능 없음
--   * 주민등록번호·계좌·비밀번호를 넣는 컬럼 없음
--
-- 적용 순서: 이 파일 → 20260922000002_partner_os_bridge.sql
-- =====================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------
-- 0. 공통 트리거 — updated_at
-- ---------------------------------------------------------------------
create or replace function public.partner_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.partner_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. partner_members — 누가 파트너/마스터인가 (마스터가 등록)
-- ---------------------------------------------------------------------
create table if not exists public.partner_members (
  profile_id   uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text not null default '',
  role         text not null default 'partner' check (role in ('partner', 'master')),
  active       boolean not null default true,
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.partner_members is 'AX Partner OS 사용자. 파트너(컨설턴트)는 본인 업체만, 마스터(미래AI랩)는 전체를 본다. 계정 자체는 홈페이지 회원가입(auth.users)을 재사용한다.';

drop trigger if exists trg_partner_members_updated on public.partner_members;
create trigger trg_partner_members_updated
  before update on public.partner_members
  for each row execute function public.partner_touch_updated_at();

-- 마스터 판정 — 아래 중 하나
--   (a) partner_members.role = 'master' (active)
--   (b) 운영 OS 워크스페이스 owner/admin (workspace_members)
--   (c) 홈페이지 profiles.role = 'admin' (컬럼이 있는 환경에서만 — 동적 확인)
create or replace function public.partner_is_master()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v boolean := false;
begin
  if uid is null then return false; end if;

  if exists (select 1 from public.partner_members m where m.profile_id = uid and m.role = 'master' and m.active) then
    return true;
  end if;

  if to_regclass('public.workspace_members') is not null then
    execute 'select exists (select 1 from public.workspace_members wm where wm.user_id = $1 and wm.role in (''owner'',''admin''))'
      into v using uid;
    if v then return true; end if;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
    execute 'select exists (select 1 from public.profiles p where p.id = $1 and p.role = ''admin'')' into v using uid;
    if v then return true; end if;
  end if;

  return false;
end;
$$;
revoke all on function public.partner_is_master() from public, anon;
grant execute on function public.partner_is_master() to authenticated;

-- 활성 파트너(또는 마스터) 인가
create or replace function public.partner_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.partner_is_master()
      or exists (select 1 from public.partner_members m where m.profile_id = auth.uid() and m.active);
$$;
revoke all on function public.partner_is_active() from public, anon;
grant execute on function public.partner_is_active() to authenticated;

-- 앱 부트스트랩용 — 'master' | 'partner' | null
create or replace function public.partner_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.partner_is_master() then 'master'
    when exists (select 1 from public.partner_members m where m.profile_id = auth.uid() and m.active) then 'partner'
    else null
  end;
$$;
revoke all on function public.partner_current_role() from public, anon;
grant execute on function public.partner_current_role() to authenticated;

alter table public.partner_members enable row level security;
revoke all on public.partner_members from anon;

drop policy if exists "Partners can read own membership" on public.partner_members;
create policy "Partners can read own membership"
  on public.partner_members for select to authenticated
  using (profile_id = auth.uid() or public.partner_is_master());

drop policy if exists "Masters manage memberships" on public.partner_members;
create policy "Masters manage memberships"
  on public.partner_members for all to authenticated
  using (public.partner_is_master())
  with check (public.partner_is_master());

-- 마스터가 이메일로 파트너 등록 (홈페이지 회원이어야 한다)
create or replace function public.partner_add_member(p_email text, p_display_name text, p_role text default 'partner')
returns public.partner_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.partner_members;
begin
  if not public.partner_is_master() then
    raise exception '마스터만 파트너를 등록할 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('partner', 'master') then
    raise exception '역할은 partner 또는 master 여야 합니다.' using errcode = '22023';
  end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_id is null then
    raise exception '이 이메일로 가입한 계정이 없습니다. miraeailab.com 에서 먼저 가입해야 합니다.' using errcode = 'P0002';
  end if;
  insert into public.partner_members (profile_id, email, display_name, role, active, invited_by)
  values (v_id, lower(btrim(p_email)), coalesce(nullif(btrim(p_display_name), ''), split_part(p_email, '@', 1)), p_role, true, auth.uid())
  on conflict (profile_id) do update
    set display_name = excluded.display_name, role = excluded.role, active = true, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.partner_add_member(text, text, text) from public, anon;
grant execute on function public.partner_add_member(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. partner_companies — 파트너가 등록한 업체 (클릭형 기본정보 + 사전진단 스냅샷)
-- ---------------------------------------------------------------------
create table if not exists public.partner_companies (
  id                  uuid primary key default gen_random_uuid(),
  consultant_id       uuid not null references auth.users (id) on delete cascade,
  name                text not null check (char_length(btrim(name)) > 0),
  industry            text not null default 'other'
                      check (industry in ('manufacturing','distribution','construction','service','food','logistics','medical','environment','other')),
  industry_note       text not null default '',
  headcount           text not null default 'unknown' check (headcount in ('1-5','6-10','11-20','21-30','30+','unknown')),
  trade_type          text not null default 'unknown' check (trade_type in ('b2b','b2c','both','unknown')),
  interests           text[] not null default '{}',
  representative_name text not null default '',
  phone               text not null default '',
  meeting_at          timestamptz,
  -- 홈페이지 3분 AX Fit 스냅샷 {leadId, grade, score, answers, submittedAt, matchedBy} — 개인정보 없음
  diagnosis           jsonb,
  memo                text not null default '',
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists partner_companies_consultant_idx on public.partner_companies (consultant_id, updated_at desc);

drop trigger if exists trg_partner_companies_updated on public.partner_companies;
create trigger trg_partner_companies_updated
  before update on public.partner_companies
  for each row execute function public.partner_touch_updated_at();

alter table public.partner_companies enable row level security;
revoke all on public.partner_companies from anon;

drop policy if exists "Partners read own companies" on public.partner_companies;
create policy "Partners read own companies"
  on public.partner_companies for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

drop policy if exists "Partners insert own companies" on public.partner_companies;
create policy "Partners insert own companies"
  on public.partner_companies for insert to authenticated
  with check (public.partner_is_active() and consultant_id = auth.uid());

drop policy if exists "Partners update own companies" on public.partner_companies;
create policy "Partners update own companies"
  on public.partner_companies for update to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()))
  with check (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

drop policy if exists "Partners delete own companies" on public.partner_companies;
create policy "Partners delete own companies"
  on public.partner_companies for delete to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

-- ---------------------------------------------------------------------
-- 3. partner_meetings — 1차 미팅 원본 (answers 는 AI 가 덮어쓰지 않는다; analysis 는 별도)
-- ---------------------------------------------------------------------
create table if not exists public.partner_meetings (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.partner_companies (id) on delete cascade,
  consultant_id        uuid not null references auth.users (id) on delete cascade,
  status               text not null default 'draft' check (status in ('draft','live','analyzed','submitted')),
  question_ids         text[] not null default '{}',
  answers              jsonb not null default '{}'::jsonb,
  skipped_question_ids text[] not null default '{}',
  hard_question_ids    text[] not null default '{}',
  key_quote            text not null default '',
  memo                 text not null default '',
  analysis             jsonb,
  handoff_id           uuid,
  started_at           timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists partner_meetings_company_idx on public.partner_meetings (company_id, updated_at desc);
create index if not exists partner_meetings_consultant_idx on public.partner_meetings (consultant_id, updated_at desc);

drop trigger if exists trg_partner_meetings_updated on public.partner_meetings;
create trigger trg_partner_meetings_updated
  before update on public.partner_meetings
  for each row execute function public.partner_touch_updated_at();

alter table public.partner_meetings enable row level security;
revoke all on public.partner_meetings from anon;

drop policy if exists "Partners read own meetings" on public.partner_meetings;
create policy "Partners read own meetings"
  on public.partner_meetings for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

drop policy if exists "Partners insert own meetings" on public.partner_meetings;
create policy "Partners insert own meetings"
  on public.partner_meetings for insert to authenticated
  with check (public.partner_is_active() and consultant_id = auth.uid()
              and exists (select 1 from public.partner_companies c where c.id = company_id and c.consultant_id = auth.uid()));

drop policy if exists "Partners update own meetings" on public.partner_meetings;
create policy "Partners update own meetings"
  on public.partner_meetings for update to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()))
  with check (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

-- ---------------------------------------------------------------------
-- 4. partner_handoffs — 운영 OS 전달 패킷 (meeting_id 로 1건만 = idempotent)
--    쓰기는 RPC(partner_submit_handoff, …0002)와 브릿지 트리거만 한다. 파트너 직접 insert 정책 없음.
-- ---------------------------------------------------------------------
create table if not exists public.partner_handoffs (
  id                    uuid primary key default gen_random_uuid(),
  meeting_id            uuid not null unique references public.partner_meetings (id) on delete cascade,
  company_id            uuid not null references public.partner_companies (id) on delete cascade,
  consultant_id         uuid not null references auth.users (id) on delete cascade,
  status                text not null default 'draft'
                        check (status in ('draft','submitted','received','reviewing','proposal_ready')),
  -- 구조화 패킷 전체 (INTERNAL 포함 — 파트너 본인과 마스터만 읽는다)
  payload               jsonb not null default '{}'::jsonb,
  -- 운영 OS 이벤트함에 보여 줄 값만 (내부 메모 제외)
  customer_safe_payload jsonb not null default '{}'::jsonb,
  customer_event_id     uuid,
  operations_client_id  text,
  submitted_at          timestamptz,
  received_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists partner_handoffs_consultant_idx on public.partner_handoffs (consultant_id, updated_at desc);
create index if not exists partner_handoffs_event_idx on public.partner_handoffs (customer_event_id);

drop trigger if exists trg_partner_handoffs_updated on public.partner_handoffs;
create trigger trg_partner_handoffs_updated
  before update on public.partner_handoffs
  for each row execute function public.partner_touch_updated_at();

alter table public.partner_handoffs enable row level security;
revoke all on public.partner_handoffs from anon;

drop policy if exists "Partners read own handoffs" on public.partner_handoffs;
create policy "Partners read own handoffs"
  on public.partner_handoffs for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

drop policy if exists "Masters update handoffs" on public.partner_handoffs;
create policy "Masters update handoffs"
  on public.partner_handoffs for update to authenticated
  using (public.partner_is_master())
  with check (public.partner_is_master());

-- ---------------------------------------------------------------------
-- 5. partner_meeting_events — 사용률 분석용 최소 이벤트
-- ---------------------------------------------------------------------
create table if not exists public.partner_meeting_events (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid references public.partner_meetings (id) on delete cascade,
  consultant_id uuid not null references auth.users (id) on delete cascade,
  event_type    text not null check (event_type in (
                  'meeting_started','question_answered','question_skipped','question_hard','tip_opened',
                  'case_opened','playbook_opened','meeting_ended','analysis_generated','handoff_submitted','pdf_printed')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists partner_meeting_events_meeting_idx on public.partner_meeting_events (meeting_id, created_at desc);
create index if not exists partner_meeting_events_consultant_idx on public.partner_meeting_events (consultant_id, created_at desc);

alter table public.partner_meeting_events enable row level security;
revoke all on public.partner_meeting_events from anon;

drop policy if exists "Partners read own events" on public.partner_meeting_events;
create policy "Partners read own events"
  on public.partner_meeting_events for select to authenticated
  using (public.partner_is_active() and (consultant_id = auth.uid() or public.partner_is_master()));

drop policy if exists "Partners insert own events" on public.partner_meeting_events;
create policy "Partners insert own events"
  on public.partner_meeting_events for insert to authenticated
  with check (public.partner_is_active() and consultant_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. partner_cases — 사례 DB (마스터 검수 후 공개). 금액과 한도 컬럼을 분리한다.
-- ---------------------------------------------------------------------
create table if not exists public.partner_cases (
  id                       text primary key,
  company_name             text not null default '',
  industry                 text not null default 'other'
                           check (industry in ('manufacturing','distribution','construction','service','food','logistics','medical','environment','other')),
  sub_industry             text not null default '',
  business_model           text not null default 'b2b' check (business_model in ('b2b','b2c','both')),
  ax_path                  text not null default 'internal_ax' check (ax_path in ('internal_ax','customer_portal','hybrid','simple_automation')),
  growth_stage             text not null default 'stable' check (growth_stage in ('early','growing','stable','scaling')),
  funding_type             text not null default 'unknown'
                           check (funding_type in ('private_investment','guarantee','policy_loan','gov_rnd','commercialization','employment_subsidy','none','unknown')),
  funding_amount_disclosed bigint,   -- 실제 공개금액(원)
  funding_program_max      bigint,   -- 제도상 최대한도(원) — 실제 금액과 반드시 구분
  year                     text not null default '',
  source                   text not null default '',
  source_date              text not null default '',
  verification_status      text not null default 'draft' check (verification_status in ('verified','needs_review','draft')),
  keywords                 text[] not null default '{}',
  problem_areas            text[] not null default '{}',
  -- 문안(problem, beforeProcess, axTransition, internalAx, customerPortal, aiFunction, validation, talkingPoints, caveats, fundingNote)
  payload                  jsonb not null default '{}'::jsonb,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists partner_cases_industry_idx on public.partner_cases (industry, verification_status);

drop trigger if exists trg_partner_cases_updated on public.partner_cases;
create trigger trg_partner_cases_updated
  before update on public.partner_cases
  for each row execute function public.partner_touch_updated_at();

alter table public.partner_cases enable row level security;
revoke all on public.partner_cases from anon;

drop policy if exists "Partners read approved cases" on public.partner_cases;
create policy "Partners read approved cases"
  on public.partner_cases for select to authenticated
  using (public.partner_is_active() and (verification_status <> 'draft' or public.partner_is_master()));

drop policy if exists "Masters manage cases" on public.partner_cases;
create policy "Masters manage cases"
  on public.partner_cases for all to authenticated
  using (public.partner_is_master())
  with check (public.partner_is_master());

-- ---------------------------------------------------------------------
-- 7. 홈페이지 3분 AX Fit 사전진단 조회 — 개인정보 없이 신호만 돌려준다
--    조건: (a) 마스터가 이 파트너에게 배정(business_diagnosis_leads.assigned_to = auth.uid())
--       또는 (b) 회사명 + 휴대폰 번호(숫자만)가 모두 일치
--    홈페이지 테이블이 없는 환경(운영 OS 단독)에서는 null.
-- ---------------------------------------------------------------------
create or replace function public.partner_lookup_diagnosis(p_company_name text, p_phone text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name   text := regexp_replace(coalesce(p_company_name, ''), '\s', '', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_out    jsonb;
begin
  if not public.partner_is_active() then
    raise exception '파트너 권한이 필요합니다.' using errcode = '42501';
  end if;
  if to_regclass('public.business_diagnosis_leads') is null or to_regclass('public.business_diagnosis_sessions') is null then
    return null;
  end if;
  if v_name = '' then
    return null;
  end if;

  execute $q$
    select jsonb_build_object(
      'lead_id',      l.id,
      'grade',        case
                        when l.flags ? 'ax_high_priority' then 'HIGH'
                        when l.flags ? 'ax_full_candidate' then 'FULL'
                        when l.flags ? 'ax_lite' then 'LITE'
                        when l.flags ? 'ax_no_go' then 'NO_GO'
                        else null end,
      'score',        l.lead_score,
      'answers',      coalesce(s.answers, '{}'::jsonb),
      'submitted_at', coalesce(s.submitted_at, l.created_at),
      'matched_by',   case when l.assigned_to = $3 then 'assigned' else 'matched' end
    )
    from public.business_diagnosis_leads l
    left join lateral (
      select bs.answers, bs.submitted_at
      from public.business_diagnosis_sessions bs
      where bs.lead_id = l.id
      order by bs.submitted_at desc nulls last, bs.created_at desc
      limit 1
    ) s on true
    where (l.assigned_to = $3 and regexp_replace(l.company_name, '\s', '', 'g') = $1)
       or ($2 <> '' and regexp_replace(l.company_name, '\s', '', 'g') = $1 and regexp_replace(l.phone, '\D', '', 'g') = $2)
    order by l.created_at desc
    limit 1
  $q$ into v_out using v_name, v_digits, auth.uid();

  return v_out;
end;
$$;
revoke all on function public.partner_lookup_diagnosis(text, text) from public, anon;
grant execute on function public.partner_lookup_diagnosis(text, text) to authenticated;
