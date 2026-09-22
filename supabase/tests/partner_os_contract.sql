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
  select count(*) into n from public.partner_cases where verification_status = 'draft'; assert n = 0, '파트너는 초안을 못 본다: ' || n;
  select count(*) into n from public.partner_cases where id = 'case_ok'; assert n = 1, '파트너는 검수 사례를 본다';
  -- 0003 리서치 시드: 파트너에게 보이고, 실제 금액과 제도 한도가 같은 행이 없고, 기존 고객사가 없다
  select count(*) into n from public.partner_cases where id like 'rc-%'; assert n >= 300, '리서치 시드가 파트너에게 보인다: ' || n;
  select count(*) into n from public.partner_cases where funding_amount_disclosed is not null and funding_program_max is not null and funding_amount_disclosed = funding_program_max;
  assert n = 0, '실제 공개금액과 제도상 한도가 같은 행: ' || n;
  select count(*) into n from public.partner_cases where company_name ~ '(비원미래|정통대왕쑥뜸원|KPJK|태강지엘텍|하나인사이트|선진산업)'; assert n = 0, '기존 고객사가 사례 DB 에 있다: ' || n;
  select count(*) into n from public.partner_cases where funding_type = 'mixed'; assert n > 0, '혼합조달 유형이 허용된다';
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


-- ---------------------------------------------------------------------
-- 8. (0005) 고객 lifecycle — 직접 DELETE 금지 · 보관 → 복구 · 전달 이력 있으면 영구삭제 차단 · 회사명 확인
-- ---------------------------------------------------------------------
do $$ declare cid uuid := (select v from ids where k='company'); n int; prev jsonb; c2 uuid; begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  -- 직접 DELETE 는 RLS 가 0행으로 막는다
  delete from public.partner_companies where id = cid;
  select count(*) into n from public.partner_companies where id = cid; assert n = 1, '직접 DELETE 가 막혀야 한다';
  -- 보관 → 목록에서 빠짐(archived_at) → 복구
  perform public.partner_archive_company(cid);
  assert (select archived_at from public.partner_companies where id = cid) is not null, '보관됨';
  perform public.partner_restore_company(cid);
  assert (select archived_at from public.partner_companies where id = cid) is null, '복구됨';
  -- 전달 이력(proposal_ready)이 있는 고객은 영구삭제 차단 (보관 후에도)
  perform public.partner_archive_company(cid);
  prev := public.partner_company_delete_preview(cid);
  assert (prev ->> 'can_delete') = 'false' and (prev ->> 'active_handoffs')::int = 1, '전달 요청이 있으면 삭제 불가: ' || prev::text;
  begin
    perform public.partner_delete_company_safe(cid, 'ABC산업');
    raise exception '전달 이력이 있는 고객이 삭제되면 안 된다';
  exception when others then
    if sqlerrm like '%삭제되면 안 된다%' then raise; end if;
  end;
  select count(*) into n from public.partner_companies where id = cid; assert n = 1, '고객이 남아 있다';
  perform public.partner_restore_company(cid);
  -- 전달 이력이 없는 고객: 보관 전 삭제 불가 → 보관 → 회사명 불일치 거부 → 일치 시 삭제 (cascade) + 감사 기록
  insert into public.partner_companies (consultant_id, name, industry) values ((select v from fx where k='partner1'), '삭제테스트', 'service') returning id into c2;
  insert into public.partner_meetings (company_id, consultant_id, status, question_ids) values (c2, (select v from fx where k='partner1'), 'draft', array['ceo_dependency']);
  begin
    perform public.partner_delete_company_safe(c2, '삭제테스트');
    raise exception '보관 전 삭제가 되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  perform public.partner_archive_company(c2);
  begin
    perform public.partner_delete_company_safe(c2, '다른이름');
    raise exception '회사명 불일치인데 삭제되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  prev := public.partner_delete_company_safe(c2, '삭제테스트');
  select count(*) into n from public.partner_companies where id = c2; assert n = 0, '영구 삭제됨';
  select count(*) into n from public.partner_meetings where company_id = c2; assert n = 0, '미팅도 함께 삭제됨';
  perform pg_temp.as_super();
  select count(*) into n from public.partner_audit_events where action in ('company_archived','company_restored','company_deleted'); assert n >= 4, '감사 기록: ' || n;
  raise notice 'T8 고객 lifecycle OK';
end $$;

-- ---------------------------------------------------------------------
-- 9. (0005) 전달 요청 철회 ↔ 운영 OS ignored · 재전달 ↔ new · 운영 OS 보류 → 파트너 withdrawn (양방향)
-- ---------------------------------------------------------------------
do $$ declare c2 uuid; m2 uuid; r jsonb; h public.partner_handoffs; e public.customer_events; n int; begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  insert into public.partner_companies (consultant_id, name, industry) values ((select v from fx where k='partner1'), '철회테스트', 'service') returning id into c2;
  insert into public.partner_meetings (company_id, consultant_id, status, question_ids, key_quote, analysis) values (c2, (select v from fx where k='partner1'), 'analyzed', array['ceo_dependency'], '말', '{"version":1}'::jsonb) returning id into m2;
  r := public.partner_submit_handoff(m2, '{"version":1}'::jsonb, '{"company_name":"철회테스트"}'::jsonb);
  select * into h from public.partner_handoffs where meeting_id = m2;
  assert h.status = 'received' and h.customer_event_id is not null, '전달됨';
  -- 전달된 미팅은 직접 삭제 불가
  begin
    perform public.partner_delete_meeting(m2);
    raise exception '전달된 미팅이 삭제되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  -- 철회
  perform public.partner_withdraw_handoff(h.id, '대표가 보류 요청');
  select * into h from public.partner_handoffs where id = h.id;
  assert h.status = 'withdrawn' and h.withdrawn_at is not null, '철회됨';
  assert (select status from public.partner_meetings where id = m2) = 'analyzed', '미팅은 분석 상태로';
  perform pg_temp.as_super();
  select * into e from public.customer_events where id = h.customer_event_id;
  assert e.status = 'ignored' and (e.customer_safe_payload ->> 'withdrawn') = 'true', '운영 OS 이벤트도 ignored: ' || e.status;
  select count(*) into n from public.customer_events where source_type = 'partner_handoff' and source_id = h.id::text; assert n = 1, '새 이벤트를 만들지 않는다';
  -- 재전달 → 같은 이벤트가 new 로 다시 열린다
  perform pg_temp.as_user((select v from fx where k='partner1'));
  r := public.partner_submit_handoff(m2, '{"version":1}'::jsonb, '{"company_name":"철회테스트"}'::jsonb);
  assert (r ->> 'created') = 'true', '재전달 created';
  select * into h from public.partner_handoffs where id = h.id;
  assert h.status = 'received' and h.withdrawn_at is null, '재전달 후 received: ' || h.status;
  perform pg_temp.as_super();
  select * into e from public.customer_events where id = h.customer_event_id;
  assert e.status = 'new' and not (e.customer_safe_payload ? 'withdrawn') and (e.customer_safe_payload ->> 'resubmitted') = 'true', '이벤트 다시 new';
  select count(*) into n from public.customer_events where source_type = 'partner_handoff' and source_id = h.id::text; assert n = 1, '여전히 1건';
  -- 반대 방향: 운영 OS 가 보류(ignored) → 파트너 withdrawn
  perform pg_temp.as_user((select v from fx where k='master1'));
  update public.customer_events set status = 'ignored' where id = h.customer_event_id;
  perform pg_temp.as_super();
  select * into h from public.partner_handoffs where id = h.id;
  assert h.status = 'withdrawn' and h.withdraw_reason <> '', '운영 OS 보류 → 파트너 withdrawn: ' || h.status;
  -- 다른 파트너는 철회할 수 없다
  perform pg_temp.as_user((select v from fx where k='partner2'));
  begin
    perform public.partner_withdraw_handoff(h.id, 'x');
    raise exception '남의 요청을 철회하면 안 된다';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_super();
  raise notice 'T9 전달 철회 양방향 OK';
end $$;

-- ---------------------------------------------------------------------
-- 10. (0005) 파트너 수정 · 호칭 · 프로필 원천 · 마지막 마스터 보호 (DB) · 파트너는 수정 불가
-- ---------------------------------------------------------------------
do $$ declare m public.partner_members; p jsonb; begin
  -- master1 은 workspace owner 라서 partner_members 없이 마스터. 회원 마스터 1명을 만든다
  insert into public.partner_members (profile_id, email, display_name, role) values ((select v from fx where k='cust'), 'cust@example.com', '회원마스터', 'master')
    on conflict (profile_id) do update set role = 'master', active = true;
  perform pg_temp.as_user((select v from fx where k='master1'));
  m := public.partner_update_member((select v from fx where k='partner1'), '곽주환', '팀장', 'partner', true);
  assert m.title = '팀장' and m.display_name = '곽주환', '호칭 저장';
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='partner1'));
  p := public.partner_current_profile();
  assert p ->> 'display_name' = '곽주환' and p ->> 'title' = '팀장' and p ->> 'role' = 'partner', '프로필 원천 = partner_members: ' || p::text;
  begin
    perform public.partner_update_member((select v from fx where k='partner2'), '해킹', '', 'master', true);
    raise exception '파트너가 파트너를 수정하면 안 된다';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_super();
  -- 마지막 활성 회원 마스터(cust)는 강등/비활성화 불가 — DB 트리거
  begin
    update public.partner_members set active = false where profile_id = (select v from fx where k='cust');
    raise exception '마지막 마스터 비활성화가 되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  begin
    update public.partner_members set role = 'partner' where profile_id = (select v from fx where k='cust');
    raise exception '마지막 마스터 강등이 되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  assert (select role from public.partner_members where profile_id = (select v from fx where k='cust')) = 'master', '마스터 유지';
  -- 마스터가 한 명 더 생기면 강등 가능 (그리고 원상복구)
  update public.partner_members set role = 'master' where profile_id = (select v from fx where k='partner2');
  update public.partner_members set role = 'partner' where profile_id = (select v from fx where k='cust');
  update public.partner_members set role = 'master' where profile_id = (select v from fx where k='cust');
  update public.partner_members set role = 'partner' where profile_id = (select v from fx where k='partner2');
  -- 본인 비활성화 금지 (RPC)
  perform pg_temp.as_user((select v from fx where k='cust'));
  begin
    perform public.partner_update_member((select v from fx where k='cust'), '회원마스터', '', 'master', false);
    raise exception '본인 비활성화가 되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  perform pg_temp.as_super();
  raise notice 'T10 파트너 수정·마지막 마스터 보호 OK';
end $$;

-- ---------------------------------------------------------------------
-- 11. (0005) 담당 재배정 — 배정된 파트너가 고객·미팅을 본다, 작성자는 유지, 파트너는 재배정 불가
-- ---------------------------------------------------------------------
do $$ declare cid uuid := (select v from ids where k='company'); n int; begin
  perform pg_temp.as_user((select v from fx where k='partner2'));
  select count(*) into n from public.partner_companies where id = cid; assert n = 0, '배정 전에는 안 보인다';
  begin
    perform public.partner_assign_company(cid, (select v from fx where k='partner2'));
    raise exception '파트너가 재배정하면 안 된다';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='master1'));
  perform public.partner_assign_company(cid, (select v from fx where k='partner2'));
  perform pg_temp.as_super();
  assert (select consultant_id from public.partner_companies where id = cid) = (select v from fx where k='partner1'), '작성자 유지';
  perform pg_temp.as_user((select v from fx where k='partner2'));
  select count(*) into n from public.partner_companies where id = cid; assert n = 1, '배정된 파트너가 본다';
  select count(*) into n from public.partner_meetings where company_id = cid; assert n >= 1, '배정된 파트너가 미팅도 본다';
  -- 배정된 파트너가 assigned_to 를 바꿔치기할 수 없다
  begin
    update public.partner_companies set assigned_to = (select v from fx where k='partner1') where id = cid;
    raise exception '파트너가 담당을 바꾸면 안 된다';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='master1'));
  perform public.partner_assign_company(cid, null);
  perform pg_temp.as_super();
  raise notice 'T11 담당 재배정 OK';
end $$;

-- ---------------------------------------------------------------------
-- 12. (0005) 미팅 삭제 규칙 · 사례 검수 RPC · 감사 로그는 마스터만
-- ---------------------------------------------------------------------
do $$ declare cid uuid := (select v from ids where k='company'); m1 uuid; m2 uuid; n int; c public.partner_cases; begin
  perform pg_temp.as_user((select v from fx where k='partner1'));
  insert into public.partner_meetings (company_id, consultant_id, status, question_ids) values (cid, (select v from fx where k='partner1'), 'draft', array['x']) returning id into m1;
  insert into public.partner_meetings (company_id, consultant_id, status, question_ids) values (cid, (select v from fx where k='partner1'), 'live', array['x']) returning id into m2;
  perform public.partner_delete_meeting(m1);
  select count(*) into n from public.partner_meetings where id = m1; assert n = 0, 'draft 삭제';
  begin
    perform public.partner_delete_meeting(m2);
    raise exception 'live 는 취소 전 삭제되면 안 된다';
  exception when others then if sqlerrm like '%되면 안 된다%' then raise; end if; end;
  perform public.partner_cancel_meeting(m2);
  assert (select status from public.partner_meetings where id = m2) = 'cancelled', '취소됨';
  perform public.partner_delete_meeting(m2);
  select count(*) into n from public.partner_meetings where id = m2; assert n = 0, '취소 후 삭제';
  -- 사례 검수는 마스터만, 감사 로그는 마스터만 읽는다
  begin
    perform public.partner_review_case((select id from public.partner_cases where verification_status = 'needs_review' limit 1), 'verified', 'x');
    raise exception '파트너가 사례를 승인하면 안 된다';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.partner_audit_events; assert n = 0, '파트너는 감사 로그를 못 본다';
  perform pg_temp.as_super();
  perform pg_temp.as_user((select v from fx where k='master1'));
  c := public.partner_review_case((select id from public.partner_cases where verification_status = 'needs_review' limit 1), 'verified', '원문 확인');
  assert c.verification_status = 'verified' and c.review_required = false and c.last_verified_at is not null, '검수 완료';
  select count(*) into n from public.partner_audit_events; assert n > 5, '마스터는 감사 로그를 본다: ' || n;
  perform pg_temp.as_super();
  raise notice 'T12 미팅 삭제·사례 검수·감사 OK';
end $$;

select 'PARTNER OS CONTRACT: ALL ASSERTIONS PASSED' as result;
rollback;
