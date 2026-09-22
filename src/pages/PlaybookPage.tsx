/**
 * AX 플레이북 — 탭 하나에 [영업 원칙] [상황별 답변] [주의 표현]. 검색은 세 탭을 가로지른다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useSession } from '../lib/auth'
import { PageTitle, Section, TextArea, TextInput } from '../components/ui'
import { PLAYBOOK } from '../content/playbook'
import { OBJECTIONS } from '../content/objections'
import { FORBIDDEN, guardText } from '../content/forbidden'
import { PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE } from '../content/pricing'

type Tab = 'principles' | 'objections' | 'forbidden'
const TABS: { id: Tab; label: string }[] = [
  { id: 'principles', label: '영업 원칙' },
  { id: 'objections', label: '상황별 답변' },
  { id: 'forbidden', label: '주의 표현' },
]

export default function PlaybookPage() {
  const { user, repo } = useSession()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'objections' || tabParam === 'forbidden' ? tabParam : 'principles'
  const [open, setOpen] = useState<string | null>(PLAYBOOK[0].id)
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  useEffect(() => {
    document.title = 'AX 플레이북 · AX Partner OS'
  }, [])
  const setTab = (t: Tab) =>
    setParams((p) => {
      p.set('tab', t)
      return p
    })
  const toggle = (id: string) => {
    setOpen((cur) => (cur === id ? null : id))
    if (open !== id) void repo.track(user, 'playbook_opened', null, { sectionId: id })
  }
  const s = q.trim().toLowerCase()
  const sections = useMemo(() => PLAYBOOK.filter((sec) => !s || `${sec.title} ${sec.summary} ${sec.points.map((p) => `${p.head} ${p.body}`).join(' ')}`.toLowerCase().includes(s)), [s])
  const objections = useMemo(() => OBJECTIONS.filter((o) => !s || `${o.customerSays} ${o.answer} ${o.nextQuestion}`.toLowerCase().includes(s)), [s])
  const forbidden = useMemo(() => FORBIDDEN.filter((f) => !s || `${f.phrase} ${f.why} ${f.alternative}`.toLowerCase().includes(s)), [s])
  const hits = useMemo(() => guardText(text), [text])
  const counts: Record<Tab, number> = { principles: sections.length, objections: objections.length, forbidden: forbidden.length }

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageTitle title="AX 플레이북" sub="처음부터 다 읽지 않아도 됩니다. 미팅 전에 한 꼭지, 미팅 중에 한 문장." />
      <div className="relative">
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색 (예: ERP, 후불, 얼마, 정책자금)" aria-label="플레이북 검색" className="pl-12" data-testid="playbook-search" />
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`playbook-tab-${t.id}`} className={`nav-item tap -mb-px border-b-[3px] px-3 py-2 text-[1.05rem] font-bold ${tab === t.id ? 'border-accent-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
            {t.label}
            {s && <span className="tnum ml-1.5 t-meta text-ink-500">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {tab === 'principles' && (
        <div className="space-y-6">
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {sections.map((sec) => (
              <li key={sec.id}>
                <button type="button" aria-expanded={open === sec.id || Boolean(s)} onClick={() => toggle(sec.id)} className="nav-item tap flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-paper-2">
                  <span>
                    <span className="block text-[1.12rem] font-bold">{sec.title}</span>
                    <span className="t-sub block text-ink-500">{sec.summary}</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-300">
                    {open === sec.id || s ? '▾' : '▸'}
                  </span>
                </button>
                {(open === sec.id || Boolean(s)) && (
                  <div className="rise space-y-2.5 px-4 pb-5">
                    {sec.points.map((p) => (
                      <div key={p.head} className="rounded-r-(--radius-control) border-l-4 border-know-600 bg-know-50/50 px-4 py-3">
                        <p className="font-bold">{p.head}</p>
                        <p className="t-body mt-0.5 text-ink-700">{p.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {sections.length === 0 && <li className="px-4 py-6 t-body text-ink-500">검색 결과가 없습니다.</li>}
          </ul>
          {!s && (
            <Section title="바로 꺼내 쓰는 문장">
              <div className="grid gap-3 md:grid-cols-3">
                {[PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE].map((g) => (
                  <div key={g.title} className="rounded-(--radius-control) bg-paper-2 p-4">
                    <p className="font-bold">{g.title}</p>
                    <p className="t-sub mt-1 text-ink-700">{g.script}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-(--radius-control) border border-line p-4">
                <p className="font-bold">공개 프로그램 참고선 (VAT 별도)</p>
                <ul className="t-sub mt-1 space-y-1 text-ink-700">
                  {PRICING_GUIDE.referencePrograms.map((p) => (
                    <li key={p.name}>
                      <b>{p.name}</b> {p.price} — {p.fit} <span className="text-ink-500">({p.note})</span>
                    </li>
                  ))}
                </ul>
                <p className="t-meta mt-2 text-ink-500">{PRICING_GUIDE.referenceNote}</p>
              </div>
              <div className="mt-4 rounded-(--radius-control) border border-line p-4">
                <p className="font-bold">2026 정책 방향 — 공식 출처가 있는 사실만</p>
                <ul className="t-sub mt-1 list-disc space-y-0.5 pl-5 text-ink-700">
                  {FUNDING_GUIDE.evidence2026.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="t-meta mt-2 text-ink-500">{FUNDING_GUIDE.disclaimer}</p>
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === 'objections' && (
        <ul className="grid gap-3 md:grid-cols-2">
          {objections.map((o) => (
            <li key={o.id} className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
              <p className="t-meta font-bold tracking-wide text-ink-500">고객</p>
              <p className="text-[1.15rem] font-bold">“{o.customerSays}”</p>
              <p className="t-meta mt-3 font-bold tracking-wide text-accent-800">답변</p>
              <p className="t-body font-semibold">{o.answer}</p>
              <p className="t-meta mt-3 font-bold tracking-wide text-accent-800">다음 질문</p>
              <p className="t-body">{o.nextQuestion}</p>
            </li>
          ))}
          {objections.length === 0 && <li className="t-body text-ink-500">검색 결과가 없습니다.</li>}
        </ul>
      )}

      {tab === 'forbidden' && (
        <div className="space-y-5">
          <ul className="grid gap-3 md:grid-cols-2">
            {forbidden.map((f) => (
              <li key={f.id} className="rounded-(--radius-card) border border-danger-600/30 bg-white p-4 sm:p-5">
                <p className="text-[1.1rem] font-bold text-danger-700">✕ “{f.phrase}”</p>
                <p className="t-meta mt-2 font-bold tracking-wide text-ink-500">왜 위험한가</p>
                <p className="t-body text-ink-700">{f.why}</p>
                <p className="t-meta mt-2 font-bold tracking-wide text-ok-700">대체 문장</p>
                <p className="t-body font-semibold">“{f.alternative}”</p>
              </li>
            ))}
            {forbidden.length === 0 && <li className="t-body text-ink-500">검색 결과가 없습니다.</li>}
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
      )}
    </div>
  )
}
