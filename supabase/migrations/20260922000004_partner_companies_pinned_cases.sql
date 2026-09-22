-- =====================================================================
-- Partner OS · 0004 — 업체별 "미팅에 사용할 사례" (추가 컬럼만, 기존 migration 수정 없음)
-- =====================================================================
alter table public.partner_companies add column if not exists pinned_case_ids text[] not null default '{}';
