import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageTitle, TextInput } from '../components/ui'
import { OBJECTIONS } from '../content/objections'

export default function ObjectionsPage() {
  const [q, setQ] = useState('')
  useEffect(() => {
    document.title = '상황별 답변 · AX 미팅 가이드'
  }, [])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return OBJECTIONS.filter((o) => !s || `${o.customerSays} ${o.answer} ${o.nextQuestion}`.toLowerCase().includes(s))
  }, [q])
  return (
    <div className="space-y-4">
      <PageTitle title="상황별 답변" sub="핵심 답변 1문장 + 다음 질문 1개. 교육자료를 처음부터 읽지 않아도 바로 찾을 수 있습니다." />
      <div className="relative">
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객이 한 말로 찾기 (예: ERP, 후불, 얼마)" aria-label="상황 검색" className="pl-12" />
      </div>
      <ul className="space-y-3">
        {list.map((o) => (
          <li key={o.id} className="rounded-(--radius-card) border border-line bg-white p-4">
            <p className="t-meta font-bold tracking-wide text-ink-500">고객</p>
            <p className="text-[1.15rem] font-bold">“{o.customerSays}”</p>
            <p className="t-meta mt-3 font-bold tracking-wide text-accent-800">답변</p>
            <p className="t-body font-semibold">{o.answer}</p>
            <p className="t-meta mt-3 font-bold tracking-wide text-accent-800">다음 질문</p>
            <p className="t-body">{o.nextQuestion}</p>
            {o.playbookId && (
              <Link to="/playbook" className="t-sub mt-2 inline-block font-semibold text-accent-700 hover:underline">
                플레이북에서 더 보기
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
