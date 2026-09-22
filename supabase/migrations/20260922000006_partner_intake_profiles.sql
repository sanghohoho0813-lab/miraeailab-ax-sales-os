-- =====================================================================
-- 미래AI랩 AX Partner OS · 0006 — 지능형 등록 (PDF · 음성 · 30초 등록) 프로필 / 근거
-- ---------------------------------------------------------------------
-- 원칙
--   * additive only — 0001~0005 는 수정하지 않는다. DROP / TRUNCATE 없음
--   * PDF 원본은 저장하지 않는다. 브라우저에서 텍스트를 추출해 구조화한 값과 근거(페이지·원문 한 줄)만 저장한다
--   * 확인되지 않은 값은 confirmed 로 저장하지 않는다 (evidence_json 의 status 가 진실)
--   * 주민등록번호처럼 보이는 값은 DB 가 거부한다 (클라이언트 필터 + DB 트리거 이중)
--   * 이전 스냅샷은 덮어쓰지 않는다 — PDF 를 다시 올리면 새 행. 전략은 최신 행을 기본으로 쓴다
--   * 권한은 RLS 가 강제 — 파트너는 본인/담당 고객의 프로필만, 마스터는 전체
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 회사 — 항목별 입력 출처 (manual / pdf / voice / website_diagnosis / master_edit)
-- ---------------------------------------------------------------------
alter table public.partner_companies add column if not exists field_sources jsonb not null default '{}'::jsonb;
comment on column public.partner_companies.field_sources is '항목별 입력 출처 {name: pdf, phone: voice, interests: manual …} — 충돌 시 무엇이 원본인지';

-- ---------------------------------------------------------------------
-- 2. 회사 프로필 스냅샷 — 문서/음성/수동에서 구조화한 확장 정보 + 근거 (이력 보존)
-- ---------------------------------------------------------------------
create table if not exists public.partner_company_profiles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.partner_companies (id) on delete cascade,
  source_type      text not null check (source_type in ('manual','pdf','voice','website_diagnosis','master_edit')),
  source_name      text not null default '',
  source_file_name text not null default '',
  -- 파일 SHA-256 — 같은 문서 재업로드 확인용. 원본 파일은 저장하지 않는다
  source_hash      text not null default '',
  page_count       integer not null default 0 check (page_count >= 0),
  -- ProfileFacts: companyName, representativeName, phone, foundedAt, industryText, industryCode, headcount, financials[], certifications[], growth …
  profile_json     jsonb not null default '{}'::jsonb,
  -- EvidenceField[]: {key, label, value, display, status(confirmed|assumed|unknown), source, sourcePage, sourceText, removed}
  evidence_json    jsonb not null default '[]'::jsonb,
  -- {adapter, version, textChars, warnings[]}
  parser_json      jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.partner_company_profiles is 'PDF·음성·수동 입력에서 구조화한 회사 확장정보 스냅샷. 원본 PDF 는 저장하지 않는다. 재업로드는 새 행(이력).';
create index if not exists partner_company_profiles_company_idx on public.partner_company_profiles (company_id, created_at desc);

drop trigger if exists trg_partner_company_profiles_updated on public.partner_company_profiles;
create trigger trg_partner_company_profiles_updated
  before update on public.partner_company_profiles
  for each row execute function public.partner_touch_updated_at();

-- 개인정보 최소화 — 주민등록번호·외국인등록번호 패턴은 어떤 필드에도 저장할 수 없다
create or replace function public.partner_company_profiles_pii_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare v text;
begin
  v := new.profile_json::text || ' ' || new.evidence_json::text || ' ' || coalesce(new.source_name, '') || ' ' || coalesce(new.source_file_name, '');
  if v ~ '\d{6}\s*-\s*[1-8]\d{6}' then
    raise exception '주민등록번호로 보이는 값은 저장할 수 없습니다. 해당 항목을 제외하고 다시 저장하세요.' using errcode = '22023';
  end if;
  if new.source_type = 'pdf' and new.source_hash = '' then
    raise exception 'PDF 프로필에는 파일 해시가 필요합니다.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.partner_company_profiles_pii_guard() from public, anon, authenticated;
drop trigger if exists trg_partner_company_profiles_pii on public.partner_company_profiles;
create trigger trg_partner_company_profiles_pii
  before insert or update on public.partner_company_profiles
  for each row execute function public.partner_company_profiles_pii_guard();

-- 감사 — 프로필 추가/수정은 마스터 변경 기록에 남는다 (partner_audit 는 authenticated 에게 revoke 돼 있어 security definer 트리거로 호출)
create or replace function public.partner_company_profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.partner_audit('profile_added', 'company', new.company_id::text,
      jsonb_build_object('profileId', new.id, 'sourceType', new.source_type, 'sourceName', new.source_name, 'pageCount', new.page_count));
  else
    perform public.partner_audit('profile_corrected', 'company', new.company_id::text, jsonb_build_object('profileId', new.id));
  end if;
  return new;
end;
$$;
revoke all on function public.partner_company_profiles_audit() from public, anon, authenticated;
drop trigger if exists trg_partner_company_profiles_audit on public.partner_company_profiles;
create trigger trg_partner_company_profiles_audit
  after insert or update on public.partner_company_profiles
  for each row execute function public.partner_company_profiles_audit();

alter table public.partner_company_profiles enable row level security;
revoke all on public.partner_company_profiles from anon;

drop policy if exists "Partners read own company profiles" on public.partner_company_profiles;
create policy "Partners read own company profiles"
  on public.partner_company_profiles for select to authenticated
  using (public.partner_can_manage_company(company_id));

drop policy if exists "Partners insert own company profiles" on public.partner_company_profiles;
create policy "Partners insert own company profiles"
  on public.partner_company_profiles for insert to authenticated
  with check (public.partner_can_manage_company(company_id) and created_by = auth.uid());

-- 수정 = 잘못 추출된 값을 "사용 안 함" 으로 표시하거나 값을 고치는 것. 이력 행 자체는 지우지 않는다
drop policy if exists "Partners correct own company profiles" on public.partner_company_profiles;
create policy "Partners correct own company profiles"
  on public.partner_company_profiles for update to authenticated
  using (public.partner_can_manage_company(company_id))
  with check (public.partner_can_manage_company(company_id));

drop policy if exists "No direct profile delete" on public.partner_company_profiles;
create policy "No direct profile delete"
  on public.partner_company_profiles for delete to authenticated
  using (false);

-- 프로필 행의 company_id / created_by 는 바꿀 수 없다 (다른 회사로 옮기기 금지)
create or replace function public.partner_company_profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id <> old.company_id or coalesce(new.created_by::text, '') <> coalesce(old.created_by::text, '') then
    raise exception '프로필의 회사·작성자는 바꿀 수 없습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.partner_company_profiles_guard() from public, anon, authenticated;
drop trigger if exists trg_partner_company_profiles_guard on public.partner_company_profiles;
create trigger trg_partner_company_profiles_guard
  before update on public.partner_company_profiles
  for each row execute function public.partner_company_profiles_guard();

-- ---------------------------------------------------------------------
-- 3. 사용률 이벤트 — 지능형 등록 이벤트 추가 (check 제약 확장, 기존 값 유지)
-- ---------------------------------------------------------------------
do $$
declare v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.partner_meeting_events'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%event_type%';
  if v_name is not null then
    execute format('alter table public.partner_meeting_events drop constraint %I', v_name);
  end if;
  alter table public.partner_meeting_events add constraint partner_meeting_events_event_type_check
    check (event_type in (
      'meeting_started','question_answered','question_skipped','question_hard','tip_opened',
      'case_opened','playbook_opened','meeting_ended','analysis_generated','handoff_submitted','pdf_printed',
      'pdf_uploaded','pdf_parsed','pdf_confirmed','pdf_failed','voice_intake_used','strategy_generated',
      'case_auto_matched','company_duplicate_detected','profile_corrected'));
end $$;

-- ---------------------------------------------------------------------
-- 4. 검증 (적용 후 SQL Editor 에서)
--   select column_name from information_schema.columns where table_name = 'partner_companies' and column_name = 'field_sources';
--   select count(*) from public.partner_company_profiles;
-- ---------------------------------------------------------------------
