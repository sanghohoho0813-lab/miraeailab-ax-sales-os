import { useEffect, useMemo, useState } from 'react'
import { PageTitle, Section, TextArea } from '../components/ui'
import { FORBIDDEN, guardText } from '../content/forbidden'

export default function ForbiddenPage() {
  const [text, setText] = useState('')
  useEffect(() => {
    document.title = '주의 표현 · AX 미팅 가이드'
  }, [])
  const hits = useMemo(() => guardText(text), [text])
  return (
    <div className="space-y-4">
      <PageTitle title="주의 표현" sub="절대 하지 말아야 할 말. 왜 위험한지와 대체 문장을 함께 둡니다." />
      <ul className="space-y-3">
        {FORBIDDEN.map((f) => (
          <li key={f.id} className="rounded-(--radius-card) border border-danger-600/30 bg-white p-4">
            <p className="text-[1.1rem] font-bold text-danger-700">✕ “{f.phrase}”</p>
            <p className="t-meta mt-2 font-bold tracking-wide text-ink-500">왜 위험한가</p>
            <p className="t-body text-ink-700">{f.why}</p>
            <p className="t-meta mt-2 font-bold tracking-wide text-ok-700">대체 문장</p>
            <p className="t-body font-semibold">“{f.alternative}”</p>
          </li>
        ))}
      </ul>
      <Section title="문장 검사" sub="말하려는 문장이나 메모를 붙여 넣으면 위험 표현을 찾아 ⚠ 표시합니다.">
        <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 정책자금 나오면 개발비 주시면 됩니다" data-testid="guard-input" />
        {text.trim() &&
          (hits.length === 0 ? (
            <p className="t-body mt-2 font-semibold text-ok-700">위험 표현이 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-2" data-testid="guard-hits">
              {hits.map((h) => (
                <li key={h.id} className="rounded-(--radius-control) bg-danger-50 px-3 py-2">
                  <p className="font-bold text-danger-700">⚠ 표현 수정 권장 — “{h.phrase}”</p>
                  <p className="t-sub text-ink-700">대체: {h.alternative}</p>
                </li>
              ))}
            </ul>
          ))}
      </Section>
    </div>
  )
}
