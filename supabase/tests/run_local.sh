#!/usr/bin/env bash
# 로컬 PostgreSQL 에 [Supabase shim] → [홈페이지 SQL] → [운영 OS 마이그레이션] → [Partner OS 마이그레이션] 을
# 순서대로 적용하고 계약 테스트를 돌린다. 운영 DB 에는 사용하지 않는다.
#   사용: DATABASE_URL=postgres://... HOMEPAGE_DIR=... OPS_DIR=... bash supabase/tests/run_local.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL 필요}"
: "${HOMEPAGE_DIR:?HOMEPAGE_DIR(mirae-ai-lab-homepage 경로) 필요}"
: "${OPS_DIR:?OPS_DIR(ax-mvp-factory-os 경로) 필요}"
run() { echo "▶ $1"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

run "$HERE/_supabase_shim.sql"
# 홈페이지 (실제 프로젝트에 먼저 적용돼 있던 순서)
run "$HOMEPAGE_DIR/supabase/schema.sql"
run "$HOMEPAGE_DIR/supabase/payments-subscriptions.sql"
run "$HOMEPAGE_DIR/supabase/portone-one-time-payments.sql"
run "$HOMEPAGE_DIR/supabase/billing-policy-foundation.sql"
run "$HOMEPAGE_DIR/supabase/member-system.sql"
run "$HOMEPAGE_DIR/supabase/auth-identity-foundation.sql"
run "$HOMEPAGE_DIR/supabase/business-diagnosis.sql"
run "$HOMEPAGE_DIR/supabase/consult-leads.sql"
# 운영 OS
for f in "$OPS_DIR"/supabase/migrations/*.sql; do run "$f"; done
# Partner OS
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f"; done
# 계약 테스트
run "$HERE/partner_os_contract.sql"
