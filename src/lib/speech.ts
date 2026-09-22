/**
 * 브라우저 SpeechRecognition 공용 도우미 — LIVE 핵심말 기록과 빠른 등록 음성 입력이 같이 쓴다 (중복 구현 없음).
 * 지원되지 않는 브라우저(iOS 일부·Firefox)에서는 supported=false 로 조용히 숨긴다. 텍스트 입력이 항상 대안이다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return getSpeechRecognition() !== null
}

export function transcriptOf(e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }): string {
  return Array.from(e.results)
    .map((r) => r[0]?.transcript ?? '')
    .join(' ')
    .trim()
}

/** 한 번 듣고 끝나는 캡처 — 결과는 onResult 로. 실패·미지원이면 onUnavailable */
export function useSpeechCapture(opts: { lang?: string; onResult: (transcript: string) => void; onUnavailable?: () => void }): { listening: boolean; supported: boolean; start: () => void; stop: () => void } {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })
  const supported = speechSupported()

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      optsRef.current.onUnavailable?.()
      return
    }
    if (recRef.current) {
      stop()
      return
    }
    const rec = new Ctor()
    rec.lang = optsRef.current.lang ?? 'ko-KR'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      const t = transcriptOf(e)
      if (t) optsRef.current.onResult(t)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }
    rec.onerror = () => {
      recRef.current = null
      setListening(false)
      optsRef.current.onUnavailable?.()
    }
    recRef.current = rec
    setListening(true)
    try {
      rec.start()
    } catch {
      recRef.current = null
      setListening(false)
      optsRef.current.onUnavailable?.()
    }
  }, [stop])

  useEffect(() => () => recRef.current?.stop(), [])
  return { listening, supported, start, stop }
}
