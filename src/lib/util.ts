/** 작은 공용 도우미 — 날짜·id·문자열 */

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // 폴백 (테스트 환경)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  if (!withTime) return date
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatKrw(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '비공개'
  if (amount >= 100_000_000) {
    const eok = Math.floor(amount / 100_000_000)
    const rest = Math.round((amount % 100_000_000) / 10_000)
    return rest > 0 ? `${eok}억 ${rest.toLocaleString('ko-KR')}만 원` : `${eok}억 원`
  }
  return `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만 원`
}

export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diff = Math.round((a - b) / 86_400_000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'
  if (diff > 1) return `${diff}일 후`
  return `${-diff}일 전`
}

export function normalizePhone(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** 로컬 날짜 입력값(YYYY-MM-DDTHH:mm) → ISO. 비어 있으면 null */
export function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
