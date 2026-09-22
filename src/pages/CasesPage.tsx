/** 실제 사례 검색 — 업종·키워드로 찾고, 카드는 금액을 맨 아래에 둔다. 마스터는 검수 상태를 바꾸고 문안을 고칠 수 있다. */
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Industry } from '../types/domain'
import { Badge, Button, Field, PageTitle, Spinner, TextArea, TextInput, useToast } from '../components/ui'
import { CaseCard } from '../components/CaseCard'
import { INDUSTRY_LABEL, INDUSTRY_ORDER } from '../content/labels'
import { newId, nowIso } from '../lib/util'

const STATUS_LABEL: Record<CaseStudy['verificationStatus'], string> = { verified: '검수 완료', needs_review: '검수 필요', draft: '초안(비공개)' }

function CaseEditor({ initial, onSave, onCancel }: { initial: CaseStudy; onSave: (c: CaseStudy) => Promise<void>; onCancel: () => void }) {
  const [c, setC] = useState<CaseStudy>(initial)
  const [busy, setBusy] = useState(false)
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  return (
    <form
      className="space-y-3 rounded-(--radius-card) border border-accent-200 bg-accent-50/40 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await onSave(c)
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="t-section">사례 편집 (마스터)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="회사명(공개 표기)">
          <TextInput value={c.companyName} onChange={(e) => setC({ ...c, companyName: e.target.value })} required />
        </Field>
        <Field label="검수 상태">
          <select value={c.verificationStatus} onChange={(e) => setC({ ...c, verificationStatus: e.target.value as CaseStudy['verificationStatus'] })} className="w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1.05rem]">
            {(Object.keys(STATUS_LABEL) as CaseStudy['verificationStatus'][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="업종">
          <select value={c.industry} onChange={(e) => setC({ ...c, industry: e.target.value as Industry })} className="w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1.05rem]">
            {INDUSTRY_ORDER.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_LABEL[i]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="출처">
          <TextInput value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} />
        </Field>
      </div>
      <Field label="문제가 무엇이었나">
        <TextArea value={c.problem} onChange={(e) => setC({ ...c, problem: e.target.value })} />
      </Field>
      <Field label="어떻게 바뀌었나">
        <TextArea value={c.axTransition} onChange={(e) => setC({ ...c, axTransition: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="설명 포인트 (줄바꿈으로 구분)">
          <TextArea value={c.talkingPoints.join('\n')} onChange={(e) => setC({ ...c, talkingPoints: lines(e.target.value) })} />
        </Field>
        <Field label="다른 점 / 주의사항 (줄바꿈)">
          <TextArea value={c.caveats.join('\n')} onChange={(e) => setC({ ...c, caveats: lines(e.target.value) })} />
        </Field>
        <Field label="실제 공개금액 (원, 비우면 비공개)">
          <TextInput inputMode="numeric" value={c.fundingAmountDisclosed ?? ''} onChange={(e) => setC({ ...c, fundingAmountDisclosed: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
        </Field>
        <Field label="제도상 최대한도 (원, 비우면 별도 확인)">
          <TextInput inputMode="numeric" value={c.fundingProgramMax ?? ''} onChange={(e) => setC({ ...c, fundingProgramMax: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
        </Field>
      </div>
      <Field label="자금 메모">
        <TextInput value={c.fundingNote} onChange={(e) => setC({ ...c, fundingNote: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>취소</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  )
}

export default function CasesPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [cases, setCases] = useState<CaseStudy[] | null>(null)
  const [industry, setIndustry] = useState<Industry | 'all'>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<CaseStudy | null>(null)

  useEffect(() => {
    document.title = '실제 사례 · AX 미팅 가이드'
    repo.listCases(user).then(setCases)
  }, [repo, user])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (cases ?? []).filter((c) => (industry === 'all' || c.industry === industry) && (!s || [c.companyName, c.subIndustry, c.problem, c.axTransition, ...c.keywords].join(' ').toLowerCase().includes(s)))
  }, [cases, industry, q])

  if (!cases) return <Spinner />

  const save = async (c: CaseStudy) => {
    const saved = await repo.saveCase(user, c)
    setCases((cur) => (cur ? (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]) : [saved]))
    setEditing(null)
    toast.show('사례를 저장했습니다.', 'ok')
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="실제 사례"
        sub="업종만 보지 말고 문제 구조가 비슷한 사례를 찾으세요. 금액은 카드 맨 아래에 있습니다."
        action={
          user.role === 'master' ? (
            <Button
              onClick={() =>
                setEditing({
                  id: `case_${newId().slice(0, 8)}`,
                  companyName: '',
                  industry: 'manufacturing',
                  subIndustry: '',
                  businessModel: 'b2b',
                  problem: '',
                  beforeProcess: '',
                  axTransition: '',
                  internalAx: '',
                  customerPortal: '',
                  aiFunction: '',
                  validation: '',
                  axPath: 'internal_ax',
                  growthStage: 'stable',
                  talkingPoints: [],
                  caveats: [],
                  fundingType: 'unknown',
                  fundingAmountDisclosed: null,
                  fundingProgramMax: null,
                  fundingNote: '',
                  year: String(new Date().getFullYear()),
                  source: '',
                  sourceDate: nowIso().slice(0, 10),
                  verificationStatus: 'draft',
                  keywords: [],
                  problemAreas: [],
                  updatedAt: nowIso(),
                })
              }
            >
              사례 추가 (초안)
            </Button>
          ) : undefined
        }
      />
      {editing && <CaseEditor key={editing.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      <div className="relative">
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="키워드로 찾기 (예: 주문, 재구매, 정산)" aria-label="사례 검색" className="pl-12" />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {(['all', ...INDUSTRY_ORDER] as const).map((i) => (
          <button key={i} type="button" aria-pressed={industry === i} onClick={() => setIndustry(i)} className={`tap shrink-0 rounded-full px-3.5 py-2 text-[0.95rem] font-bold ${industry === i ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 border border-line'}`}>
            {i === 'all' ? '전체' : INDUSTRY_LABEL[i]}
          </button>
        ))}
      </div>
      <p className="t-sub text-ink-500">
        {list.length}건 <Badge tone="warn">업종 패턴</Badge> 은 실제 기업이 아닌 홈페이지 공개 시나리오입니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => (
          <CaseCard
            key={c.id}
            caseStudy={c}
            compact
            onOpen={() => void repo.track(user, 'case_opened', null, { caseId: c.id, from: 'cases' })}
            footer={
              user.role === 'master' ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                  편집 · {STATUS_LABEL[c.verificationStatus]}
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
