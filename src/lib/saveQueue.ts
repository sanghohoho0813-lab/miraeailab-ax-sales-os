/**
 * 현장 저장 안정성 — 마지막 상태가 반드시 남게 하는 직렬 저장기.
 *  · 저장 요청이 겹쳐도 한 번에 하나만 보내고, 그동안 들어온 최신 상태만 다음에 보낸다(latest-write).
 *  · 실패하면 상태를 'offline' 으로 두고, 기기(localStorage) 임시 저장본을 유지한 채 online 이벤트/주기 재시도.
 *  · 페이지를 떠나기 전 flush() 로 남은 저장을 밀어 넣고, 안 되면 임시 저장본이 남아 있다.
 */
export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error'

export interface SaveQueueOptions<T> {
  save: (state: T) => Promise<T | void>
  /** 기기 임시 저장 (실패·대기 중 상태 보존) */
  draftKey: string
  debounceMs?: number
  retryMs?: number
  onStatus?: (s: SaveStatus, info: { pending: boolean; lastSavedAt: string | null; error?: string }) => void
}

export function readDraft<T>(draftKey: string): { state: T; savedAt: string; synced: boolean } | null {
  try {
    const raw = localStorage.getItem(draftKey)
    return raw ? (JSON.parse(raw) as { state: T; savedAt: string; synced: boolean }) : null
  } catch {
    return null
  }
}
export function clearDraft(draftKey: string): void {
  try {
    localStorage.removeItem(draftKey)
  } catch {
    /* noop */
  }
}

export class SaveQueue<T> {
  private latest: T | null = null
  private inFlight = false
  private timer: number | null = null
  private retryTimer: number | null = null
  private status: SaveStatus = 'saved'
  private lastSavedAt: string | null = null
  private disposed = false
  private readonly onOnline = () => void this.flush()
  private readonly opts: SaveQueueOptions<T>

  constructor(opts: SaveQueueOptions<T>) {
    this.opts = opts
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline)
  }

  get pending(): boolean {
    return this.latest !== null || this.inFlight
  }
  get currentStatus(): SaveStatus {
    return this.status
  }

  /** 상태 변경 — 즉시 기기에 임시 저장하고, debounce 후 서버 저장 */
  push(state: T): void {
    this.latest = state
    this.writeDraft(state, false)
    this.setStatus(this.status === 'offline' ? 'offline' : 'saving')
    if (this.timer) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void this.run(), this.opts.debounceMs ?? 250)
  }

  /** 대기 중인 저장을 즉시 밀어 넣는다 (나가기·언로드 전) */
  async flush(): Promise<boolean> {
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    await this.run()
    return !this.pending && this.status === 'saved'
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) window.clearTimeout(this.timer)
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline)
  }

  private async run(): Promise<void> {
    if (this.inFlight || this.latest === null || this.disposed) return
    const state = this.latest
    this.latest = null
    this.inFlight = true
    this.setStatus('saving')
    try {
      await this.opts.save(state)
      this.lastSavedAt = new Date().toISOString()
      // 그동안 새 상태가 들어왔으면 곧바로 이어서 저장, 아니면 동기화 완료 표시
      if (this.latest === null) {
        this.writeDraft(state, true)
        this.setStatus('saved')
      }
    } catch (cause) {
      // 실패 — 최신 상태를 다시 대기열에 올리고(더 새 상태가 없을 때만) 재시도
      if (this.latest === null) this.latest = state
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      this.setStatus(offline ? 'offline' : 'error', cause instanceof Error ? cause.message : String(cause))
      if (this.retryTimer) window.clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => void this.run(), this.opts.retryMs ?? 8000)
    } finally {
      this.inFlight = false
      if (this.latest !== null && !this.disposed && this.status !== 'offline' && this.status !== 'error') void this.run()
    }
  }

  private writeDraft(state: T, synced: boolean): void {
    try {
      localStorage.setItem(this.opts.draftKey, JSON.stringify({ state, savedAt: new Date().toISOString(), synced }))
    } catch {
      /* 저장 공간 부족 등 — 서버 저장은 계속 시도 */
    }
  }
  private setStatus(s: SaveStatus, error?: string): void {
    this.status = s
    this.opts.onStatus?.(s, { pending: this.pending, lastSavedAt: this.lastSavedAt, error })
  }
}
