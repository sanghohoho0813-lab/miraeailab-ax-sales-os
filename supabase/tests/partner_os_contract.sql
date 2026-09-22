-- =====================================================================
-- AX Partner OS · 계약 테스트 (순수 SQL, pgTAP 불필요)
-- ---------------------------------------------------------------------
-- 실행: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/partner_os_contract.sql
--       (홈페이지 SQL + 운영 OS 브릿지 + Partner OS 마이그레이션이 적용된 DB. 트랜잭션 안에서 돌고 ROLLBACK)
-- 검증:
--   1. 역할 판정 — 파트너/마스터/무권한
--   2. 파트너 격리 — 다른 파트너의 업체·미팅을 한 줄도 못 본다, anon 은 아무것도 못 한다
--   3. 홈페이지 사전진단 조회 — 회사명+연락처 일치 시 답변 신호만, 불일치 시 null
--   4. 2차 제안 요청 — 버튼 두 번 = customer_events 1건 (idempotent), 이벤트함 payload 에 내부 메모 없음
--   5. 남의 미팅은 전달할 수 없다
--   6. 역동기화 — 운영 OS 가 이벤트를 처리하면 파트너 handoff 상태가 따라온다
--   7. 사례 DB — 초안은 마스터만, 파트너 등록은 마스터만
-- =====================================================================
begin;

create temp table fx (k text primary key, v uuid);
grant select on fx to anon, authenticated;
insert into fx values ('master1', gen_random_uuid()), ('partner1', gen_random_uuid()), ('partner2', gen_random_uuid()), ('cust', gen_random_uuid()), ('ws1', gen_random_uuid());

-- 계정 (트리거는 잠시 끄고 넣는다 — 프로필 자동생성 트리거가 환경마다 달라서)
create or replace function pg_temp.make_user(u uuid, mail text) returns void language plpgsql as $$
declare cols text := 'id, email'; vals text := quote_literal(u::text) || '::uuid, ' || quote_literal(mail);
begin
  begin execute 'set local session_replication_role = replica'; exception when others then null; end;
  insert into auth.users (id, email) values (u, mail) on conflict (id) do nothing;
  begin execute 'set local session_replication_role = origin'; exception when others then null; end;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='name') then
    cols := cols || ', name'; vals := vals || ', ' || quote_literal(split_part(mail, '@', 1));
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='display_name') then
    cols := cols || ', display_name'; vals := vals || ', ' || quote_literal(split_part(mail, '@', 1));
  end if;
  execute format('insert into public.profiles (%s) values (%s) on conflict (id) do update set email = excluded.email', cols, vals);
end $$;
select pg_temp.make_user(v, k || '@example.com') from fx where k in ('master1','partner1','partner2','cust');

-- 운영 OS 워크스페이스 (master1 = owner) + 유입 라우팅 + 고객사 1개
insert into public.workspaces (id, name, owner_id) values ((select v from fx where k='ws1'), 'MIRAE', (select v from fx where k='master1'));
insert into public.workspace_members (workspace_id, user_id, role) values ((select v from fx where k='ws1'), (select v from fx where k='master1'), 'owner');
delete from public.customer_intake_routing;
insert into public.customer_intake_routing (workspace_id, is_default) values ((select v from fx where k='ws1'), true);
insert into public.operations_clients (id, workspace_id, company_name) values ('cli_abc', (select v from fx where k='ws1'), 'ABC산업');

-- 파트너 등록 (partner1, partner2). master1 은 workspace owner 라서 partner_members 없이도 마스터
insert into public.partner_members (profile_id, email, display_name, role) values
  ((select v from fx where k='partner1'), 'partner1@example.com', '곽주환', 'partner'),
  ((select v from fx where k='partner2'), 'partner2@example.com', '다른파트너', 'partner');

-- 홈페이지 3분 AX Fit 리드 픽스처 (ABC산업 · 010-1234-5678)
insert into public.business_diagnosis_leads (id, company_name, representative_name, phone, privacy_consent, lead_score, lead_grade, flags)
values ('11111111-1111-1111-1111-111111111111', 'ABC 산업', '김대표', '01012345678', true, 80, 'A', '["hot","ax_high_priority"]'::jsonb);
insert into public.business_diagnosis_sessions (session_token, lead_id, status, answers, submitted_at)
values ('tok-abc', '11111111-1111-1111-1111-111111111111', 'submitted',
        '{"repeatInput":"always","askProgress":"always","toolGaps":"often","internalOwner":"partTime"}'::jsonb, now());

-- 역할 전환 도우미
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;
create or replace function pg_temp.as_super() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 1. 역할 판정
-- ---------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  assert public.partner_current_role() = 'partner', '파트너 역할';
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='master1'));
  assert public.partner_current_role() = 'master', '워크스페이스 owner 는 마스터';
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='cust'));
  assert public.partner_current_role() is null, '등록되지 않은 계정은 권한 없음';
  perform pg_temp.as_super();
  raise notice 'T1 역할 판정 OK';
end $$;

-- ---------------------------------------------------------------------
-- 2. 파트너 격리 — partner1 이 업체·미팅을 만들고, partner2 는 못 본다
-- ---------------------------------------------------------------------
create temp table ids (k text primary key, v uuid);
grant select, insert on ids to anon, authenticated;
do $$
declare cid uuid; mid uuid; n int;
begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  insert into public.partner_companies (consultant_id, name, industry, headcount, trade_type, interests, phone)
  values ((select v from fx where k='partner1'), 'ABC산업', 'manufacturing', '11-20', 'b2b', array['efficiency','policy_fund'], '010-1234-5678')
  returning id into cid;
  insert into ids values ('company', cid);
  insert into public.partner_meetings (company_id, consultant_id, status, question_ids, answers, key_quote, memo, analysis, started_at, ended_at)
  values (cid, (select v from fx where k='partner1'), 'analyzed', array['ceo_dependency'],
          '{"ceo_dependency":{"questionId":"ceo_dependency","value":"very_high","source":"consultant","at":"2026-09-22T01:00:00Z"}}'::jsonb,
          '내가 하루만 빠져도 직원들이 계속 전화해요.', '수임료 협상 여지 — 내부', '{"version":1,"scopeLevel":"C"}'::jsonb, now() - interval '30 min', now())
  returning id into mid;
  insert into ids values ('meeting', mid);
  perform pg_temp.as_super();

  perform pg_temp.as_user((select v from fx where k='partner2'));
  select count(*) into n from public.partner_companies; assert n = 0, '다른 파트너의 업체가 보이면 안 된다: ' || n;
  select count(*) into n from public.partner_meetings; assert n = 0, '다른 파트너의 미팅이 보이면 안 된다';
  perform pg_temp.as_super();

  perform pg_temp.as_user((select v from fx where k='master1'));
  select count(*) into n from public.partner_companies; assert n = 1, '마스터는 전체를 본다';
  perform pg_temp.as_super();

  -- 다른 파트너 이름으로 업체를 만들 수 없다
  perform pg_temp.as_user((select v from fx where k='partner2'));
  begin
    insert into public.partner_companies (consultant_id, name) values ((select v from fx where k='partner1'), '가짜');
    raise exception '남의 consultant_id 로 insert 가 되면 안 된다';
  exception when insufficient_privilege or check_violation then null;
  end;
  perform pg_temp.as_super();
  raise notice 'T2 파트너 격리 OK';
end $$;

-- anon 은 아무것도 못 한다
do $$ declare n int; begin
  perform pg_temp.as_anon();
  begin
    select count(*) into n from public.partner_companies;
    assert n = 0, 'anon 이 업체를 보면 안 된다';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.partner_current_role();
    raise exception 'anon 이 RPC 를 실행하면 안 된다';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_super();
  raise notice 'T2b anon 차단 OK';
end $$;

-- ---------------------------------------------------------------------
-- 3. 홈페이지 사전진단 조회
-- ---------------------------------------------------------------------
do $$ declare d jsonb; begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  d := public.partner_lookup_diagnosis('ABC산업', '010-1234-5678');
  assert d is not null, '회사명+연락처 일치 시 진단을 돌려준다';
  assert d ->> 'grade' = 'HIGH', '등급 매핑: ' || (d ->> 'grade');
  assert (d -> 'answers' ->> 'askProgress') = 'always', '답변 신호 포함';
  assert d ->> 'matched_by' = 'matched', 'matched_by';
  assert not (d ? 'phone') and not (d ? 'representative_name'), '개인정보 미포함';
  assert public.partner_lookup_diagnosis('ABC산업', '010-9999-9999') is null, '연락처 불일치 시 null';
  assert public.partner_lookup_diagnosis('ABC산업', '') is null, '연락처 없이 회사명만으로는 조회 불가';
  perform pg_temp.as_super();
  raise notice 'T3 사전진단 조회 OK';
end $$;

-- ---------------------------------------------------------------------
-- 4. 2차 제안 요청 — 두 번 눌러도 1건
-- ---------------------------------------------------------------------
do $$
declare r1 jsonb; r2 jsonb; n int; h public.partner_handoffs; e public.customer_events; mid uuid := (select v from ids where k='meeting');
begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  r1 := public.partner_submit_handoff(mid, '{"version":1,"internalNotes":"수임료 협상 여지 — 내부","company":{"name":"ABC산업"}}'::jsonb,
                                     '{"company_name":"ABC산업","scope_level":"C","internal_notes":"지워져야 함"}'::jsonb);
  r2 := public.partner_submit_handoff(mid, '{"version":1}'::jsonb, '{"company_name":"ABC산업"}'::jsonb);
  assert (r1 -> 'handoff' ->> 'id') = (r2 -> 'handoff' ->> 'id'), '같은 미팅은 같은 handoff';
  assert (r1 ->> 'created') = 'true' and (r2 ->> 'created') = 'false', '두 번째는 created=false';
  perform pg_temp.as_super();

  select count(*) into n from public.partner_handoffs where meeting_id = mid; assert n = 1, 'handoff 1건';
  select count(*) into n from public.customer_events where source_type = 'partner_handoff'; assert n = 1, 'customer_events 1건 (dedupe): ' || n;
  select * into h from public.partner_handoffs where meeting_id = mid;
  assert h.status = 'received' and h.customer_event_id is not null, '이벤트 등록 후 received';
  select * into e from public.customer_events where id = h.customer_event_id;
  assert e.event_type = 'ax_proposal_requested', 'event_type';
  assert e.workspace_id = (select v from fx where k='ws1'), '유입 워크스페이스로 라우팅';
  assert e.priority = 'high' and e.status = 'new', 'priority/status';
  assert e.customer_safe_payload ->> 'company_name' = 'ABC산업', 'safe payload';
  assert not (e.customer_safe_payload ? 'internal_notes'), '이벤트함 payload 에 내부 메모 없음';
  assert e.customer_safe_payload ->> 'handoff_id' = h.id::text, 'handoff_id 링크';
  assert (select status from public.partner_meetings where id = mid) = 'submitted', '미팅 상태 submitted';
  assert (select handoff_id from public.partner_meetings where id = mid) = h.id, '미팅 handoff_id';
  raise notice 'T4 2차 제안 요청(idempotent) OK';
end $$;

-- ---------------------------------------------------------------------
-- 5. 남의 미팅은 전달할 수 없다
-- ---------------------------------------------------------------------
do $$ declare mid uuid := (select v from ids where k='meeting'); begin
  perform pg_temp.as_user((select v from fx where k='partner2'));
  begin
    perform public.partner_submit_handoff(mid, '{}'::jsonb, '{}'::jsonb);
    raise exception '남의 미팅 전달이 되면 안 된다';
  exception when insufficient_privilege or no_data_found then null;
  end;
  perform pg_temp.as_super();
  raise notice 'T5 남의 미팅 전달 차단 OK';
end $$;

-- ---------------------------------------------------------------------
-- 6. 역동기화 — 운영 OS(워크스페이스 writer)가 이벤트를 처리하면 handoff 상태가 따라온다
-- ---------------------------------------------------------------------
do $$ declare h public.partner_handoffs; mid uuid := (select v from ids where k='meeting'); begin
  select * into h from public.partner_handoffs where meeting_id = mid;
  perform pg_temp.as_user((select v from fx where k='master1'));
  update public.customer_events set status = 'in_progress', operations_client_id = 'cli_abc' where id = h.customer_event_id;
  perform pg_temp.as_super();
  select * into h from public.partner_handoffs where meeting_id = mid;
  assert h.status = 'reviewing' and h.operations_client_id = 'cli_abc', '처리 중 → reviewing: ' || h.status;

  perform pg_temp.as_user((select v from fx where k='master1'));
  update public.customer_events set status = 'resolved' where id = h.customer_event_id;
  perform pg_temp.as_super();
  select * into h from public.partner_handoffs where meeting_id = mid;
  assert h.status = 'proposal_ready', '처리 완료 → proposal_ready';

  -- 파트너는 자기 handoff 의 상태를 읽을 수 있다
  perform pg_temp.as_user((select v from fx where k='partner1'));
  assert (select status from public.partner_handoffs where meeting_id = mid) = 'proposal_ready', '파트너가 상태를 본다';
  perform pg_temp.as_super();
  raise notice 'T6 역동기화 OK';
end $$;

-- ---------------------------------------------------------------------
-- 7. 사례 DB · 파트너 등록 권한
-- ---------------------------------------------------------------------
do $$ declare n int; m public.partner_members; begin
  perform pg_temp.as_user((select v from fx where k='master1'));
  insert into public.partner_cases (id, company_name, industry, verification_status) values ('case_draft', '초안 사례', 'food', 'draft');
  insert into public.partner_cases (id, company_name, industry, verification_status) values ('case_ok', '검수 사례', 'food', 'verified');
  m := public.partner_add_member('cust@example.com', '신규 파트너', 'partner');
  assert m.profile_id = (select v from fx where k='cust'), '이메일로 계정을 찾아 등록';
  perform pg_temp.as_super();

  perform pg_temp.as_user((select v from fx where k='partner1'));
  select count(*) into n from public.partner_cases; assert n = 1, '파트너는 초안을 못 본다: ' || n;
  begin
    perform public.partner_add_member('partner2@example.com', 'x', 'partner');
    raise exception '파트너가 파트너를 등록하면 안 된다';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.partner_cases (id, company_name) values ('case_by_partner', 'x');
    raise exception '파트너가 사례를 쓰면 안 된다';
  exception when insufficient_privilege then null;
  end;
  insert into public.partner_meeting_events (meeting_id, consultant_id, event_type, payload)
  values ((select v from ids where k='meeting'), (select v from fx where k='partner1'), 'pdf_printed', '{}'::jsonb);
  perform pg_temp.as_super();

  perform pg_temp.as_user((select v from fx where k='cust'));
  assert public.partner_current_role() = 'partner', '등록 직후 파트너 권한';
  perform pg_temp.as_super();
  raise notice 'T7 사례 DB · 파트너 등록 OK';
end $$;

select 'PARTNER OS CONTRACT: ALL ASSERTIONS PASSED' as result;
rollback;
