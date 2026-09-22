import json
D='./out'
cases=json.load(open(f'{D}/research_cases.json'))
COLS=['id','company_name','industry','sub_industry','business_model','ax_path','growth_stage','funding_type','funding_amount_disclosed','funding_program_max','year','source','source_date','verification_status','keywords','problem_areas','payload','source_url','review_required','research_ref']
COLSET={'id','companyName','industry','subIndustry','businessModel','axPath','growthStage','fundingType','fundingAmountDisclosed','fundingProgramMax','year','source','sourceDate','verificationStatus','keywords','problemAreas'}
def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
def arr(a):
    return "array[" + ",".join(q(x) for x in a) + "]::text[]" if a else "'{}'::text[]"
rows=[]
for c in cases:
    payload={k:v for k,v in c.items() if k not in COLSET}
    vals=[q(c['id']),q(c['companyName']),q(c['industry']),q(c['subIndustry']),q(c['businessModel']),q(c['axPath']),q(c['growthStage']),q(c['fundingType']),
          'null' if c['fundingAmountDisclosed'] is None else str(c['fundingAmountDisclosed']),
          'null' if c['fundingProgramMax'] is None else str(c['fundingProgramMax']),
          q(c['year']),q(c['source']),q(c['sourceDate']),q(c['verificationStatus']),arr(c['keywords']),arr(c['problemAreas']),
          q(json.dumps(payload,ensure_ascii=False))+'::jsonb', q(c['sourceUrl']), 'true' if c['reviewRequired'] else 'false', q('p%d' % c['researchPage'])]
    rows.append('  (' + ', '.join(vals) + ')')
nv=sum(1 for c in cases if c['verificationStatus']=='verified'); nr=len(cases)-nv
head = """-- =====================================================================
-- Partner OS · 0003 — 실제 사례 DB 시드 (리서치 PDF 기반)
-- 원천: 미래AI랩 AX·플랫폼 자금조달 사례 종합리서치 (50대 가독성 강화, 중진공 AX 정책 업데이트, 2026.09.04)
-- 생성: 스크립트 파싱(원문 보기 링크 포함) → 정규화. 사례를 임의 생성하지 않았다.
-- 규칙
--   · 기존 migration 은 수정하지 않는다. 이 파일은 순수 추가(additive)다.
--   · funding_amount_disclosed(실제 공개금액)와 funding_program_max(제도상 한도)는 분리한다.
--   · review_required = true(= verification_status 'needs_review') 는 파트너 기본 추천에서 제외한다.
--   · 기존 컨설팅 고객사(비원미래·정통대왕쑥뜸원·KPJK·태강지엘텍·하나인사이트·선진산업)는 포함하지 않는다.
--   · 이미 존재하는 id 는 건드리지 않는다(마스터 검수 결과 보존).
-- 건수: %d (verified %d, needs_review %d)
-- =====================================================================

-- 1) 혼합조달(mixed) 허용 — 컬럼 체크 제약을 새 제약으로 교체 (추가 확장)
alter table public.partner_cases drop constraint if exists partner_cases_funding_type_check;
alter table public.partner_cases add constraint partner_cases_funding_type_check
  check (funding_type in ('private_investment','guarantee','policy_loan','gov_rnd','commercialization','employment_subsidy','mixed','none','unknown'));

-- 2) 리서치 메타 컬럼 (추가)
alter table public.partner_cases add column if not exists source_url      text    not null default '';
alter table public.partner_cases add column if not exists review_required boolean not null default false;
alter table public.partner_cases add column if not exists research_ref    text    not null default '';
create index if not exists partner_cases_review_idx on public.partner_cases (review_required, industry);

-- 3) 홈페이지 시나리오·고객사 기반 구 시드(case_*)가 DB 에 들어가 있었다면 제거 (리서치 사례로 대체)
delete from public.partner_cases where id like 'case\\_%%' escape '\\';

-- 4) 리서치 사례 시드
insert into public.partner_cases (%s) values
""" % (len(cases), nv, nr, ', '.join(COLS))
sql = head + ',\n'.join(rows) + '\non conflict (id) do nothing;\n'
open('supabase/migrations/20260922000003_partner_cases_research_seed.sql','w').write(sql)
print('sql KB', len(sql.encode())//1024, 'rows', len(rows))
