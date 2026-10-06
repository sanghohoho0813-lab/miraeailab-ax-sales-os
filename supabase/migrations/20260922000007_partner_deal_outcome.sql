-- =====================================================================
-- Partner OS · 0007 — 딜 결과(계약 · 보류 · 무산). 추가 컬럼 + 형식 검사만, 기존 migration 수정 없음
--
-- 왜: Partner OS 는 1차 미팅 → 2차 제안 요청까지만 기록했다. 2차 미팅 뒤 계약이 났는지, 보류인지, 무산인지가
--     어디에도 남지 않아 1차 미팅 → 계약 전환율을 볼 수 없었고, 거절한 고객이 할 일 목록을 계속 막았다.
--
-- outcome = { kind: won|hold|lost, at, followUpAt?, reason?, note?, by? }
--   * kind 는 세 값만
--   * 무산 사유(reason)는 고정 목록만 — 자유 입력이면 모아서 볼 수 없다
--   * 개인정보 최소화 — 주민등록번호 패턴은 저장할 수 없다 (0006 과 같은 규칙)
--   * 쓰기 권한은 기존 partner_companies update 정책(담당 파트너 · 마스터)을 그대로 따른다
-- =====================================================================
alter table public.partner_companies add column if not exists outcome jsonb;
comment on column public.partner_companies.outcome is '딜 결과 {kind: won|hold|lost, at, followUpAt?, reason?, note?, by?} — null 이면 진행 중';

alter table public.partner_companies drop constraint if exists partner_companies_outcome_check;
alter table public.partner_companies add constraint partner_companies_outcome_check check (
  outcome is null
  or (
    jsonb_typeof(outcome) = 'object'
    and outcome->>'kind' in ('won', 'hold', 'lost')
    and (outcome->>'reason' is null or outcome->>'reason' in ('budget', 'timing', 'no_need', 'competitor', 'no_response', 'other'))
    and outcome::text !~ '\d{6}\s*-\s*[1-8]\d{6}'
  )
);

-- 전환율 집계(마스터)용 — 결과가 있는 고객만 빠르게
create index if not exists partner_companies_outcome_kind_idx on public.partner_companies ((outcome->>'kind')) where outcome is not null;

-- 확인:
--   select column_name from information_schema.columns where table_name = 'partner_companies' and column_name = 'outcome';
