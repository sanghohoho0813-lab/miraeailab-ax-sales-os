/** 실시간 시계 — 브라우저 시간대(한국에서는 Asia/Seoul). 1초마다 갱신, 초 경계에 맞춘다. */
import { useEffect, useState } from 'react'

export interface ClockValue {
  date: string
  weekday: string
  /** 좁은 화면용 한 글자 요일 ('화') — 날짜를 숨기는 대신 줄여서 보여 준다 */
  weekdayShort: string
  time: string
  short: string
}
const WEEK = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(d: Date): ClockValue {
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return { date, weekday: WEEK[d.getDay()], weekdayShort: WEEK[d.getDay()].charAt(0), time, short: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

export function useClock(): ClockValue {
  const [now, setNow] = useState(() => formatClock(new Date()))
  useEffect(() => {
    let timer = 0
    const tick = () => {
      const d = new Date()
      setNow(formatClock(d))
      timer = window.setTimeout(tick, 1000 - d.getMilliseconds())
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [])
  return now
}
