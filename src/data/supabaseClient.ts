import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDataModeConfig } from './dataMode'

/** 지연 생성 — local 모드 번들에는 포함되지 않도록 supabase 모드에서만 import 한다 */
let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (client) return client
  const cfg = getDataModeConfig()
  if (cfg.mode !== 'supabase' || cfg.configError || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error('Supabase 설정이 올바르지 않습니다.')
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  return client
}
