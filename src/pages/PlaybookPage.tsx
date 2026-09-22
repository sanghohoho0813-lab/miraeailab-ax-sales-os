import { useEffect, useState } from 'react'
import { useSession } from '../lib/auth'
import { PageTitle } from '../components/ui'
import { PLAYBOOK } from '../content/playbook'
import { PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE } from '../content/pricing'

export default function PlaybookPage() {
  const { user, repo } = useSession()
  const [open, setOpen] = useState<string | null>(PLAYBOOK[0].id)
  useEffect(() => {
    document.title = 'AX 영업 플레이북 · AX 미팅 가이드'
  }, [])
  const toggle = (id: string) => {
    setOpen((cur) => (cur === id ? null : id))
    if (open !== id) void repo.track(user, 'playbook_opened', null, { sectionId: id })
  }
  return (
    <div className="space-y-4">
      <PageTitle title="AX 영업 플레이북" sub="처음부터 다 읽지 않아도 됩니다. 미팅 전에 한 꼭지만 열어 보세요." />
      <ul className="divide-y divide-line rounded-(--radius-card) border border-line bg-white">
        {PLAYBOOK.map((s) => (
          <li key={s.id}>
            <button type="button" aria-expanded={open === s.id} onClick={() => toggle(s.id)} className="tap flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-paper-2">
              <span>
                <span className="block text-[1.1rem] font-bold">{s.title}</span>
                <span className="t-sub block text-ink-500">{s.summary}</span>
              </span>
              <span aria-hidden="true" className="text-ink-300">
                {open === s.id ? '▾' : '▸'}
              </span>
            </button>
            {open === s.id && (
              <div className="rise space-y-3 px-4 pb-5">
                {s.points.map((p) => (
                  <div key={p.head} className="rounded-(--radius-control) bg-paper-2 px-4 py-3">
                    <p className="font-bold">{p.head}</p>
                    <p className="t-body mt-0.5 text-ink-700">{p.body}</p>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <section className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
        <h2 className="t-section">바로 꺼내 쓰는 문장</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE].map((g) => (
            <div key={g.title} className="rounded-(--radius-control) bg-paper-2 p-3">
              <p className="font-bold">{g.title}</p>
              <p className="t-sub mt-1 text-ink-700">{g.script}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-(--radius-control) border border-line p-3">
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
        <div className="mt-4 rounded-(--radius-control) border border-line p-3">
          <p className="font-bold">2026 정책 방향 — 공식 출처가 있는 사실만</p>
          <ul className="t-sub mt-1 list-disc space-y-0.5 pl-5 text-ink-700">
            {FUNDING_GUIDE.evidence2026.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="t-meta mt-2 text-ink-500">{FUNDING_GUIDE.disclaimer}</p>
        </div>
      </section>
    </div>
  )
}
