/**
 * PDF로 1분 준비 — 파일 선택 → (브라우저에서) 텍스트 추출 → 구조화 → "PDF에서 이 내용을 찾았습니다" 검토 → 중복 확인 → 저장 → 전략.
 *   - 원본 PDF는 어디에도 업로드하지 않는다. 구조화된 값 + 근거(페이지·원문 한 줄)만 저장한다.
 *   - 읽은 값은 바로 저장하지 않는다. 각 항목을 [수정] [사용 안 함] 할 수 있다. 잘못된 값 하나 때문에 고객을 지울 필요가 없다.
 *   - 기존 고객과 비슷하면 자동 생성하지 않고 [기존 고객에 정보 추가](항목별 기존 유지/PDF 반영) 또는 [새 고객으로 등록] 을 고른다.
 *   - 저장을 막는 값은 회사명 하나뿐이다. 업종·인원·거래형태를 몰라도 진행할 수 있고, 모르는 값은 핵심 요약에서 바로 채울 수 있다.
 *     (화면에 없는 값을 요구하는 검증은 만들지 않는다 — 고칠 수 없는 오류 메시지는 벽이다)
 *   - 진행 단계 표시, 취소 가능, 실패해도 막히지 않는다(직접 30초 등록 / 다른 PDF).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, FileText, Pencil, Upload, X } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, CompanyFieldKey, CompanyProfile, EvidenceField, FieldSources, Headcount, Industry, Interest, ProfileFacts, TradeType } from '../types/domain'
import { Badge, Button, ChoiceGrid, EvidenceBadge, Sheet, TextInput, useToast } from '../components/ui'
import { EvidenceList } from '../components/EvidenceList'
import { CompanyCoreSummary, type CoreSlotKey } from '../components/CompanyCoreSummary'
import { formatWon } from '../engine/docParser/korean'
import { HEADCOUNT_LABEL, HEADCOUNT_ORDER, INDUSTRY_LABEL, INDUSTRY_ORDER, INTEREST_EXTRA, INTEREST_HINT, INTEREST_LABEL, INTEREST_PRIMARY, TRADE_HINT, TRADE_LABEL, TRADE_ORDER } from '../content/labels'
import { MeetingTimePicker, resolveMeetingTime, type MeetingTimeValue } from '../components/MeetingTimePicker'
import { extractPdfText, type PdfTextResult } from '../lib/pdfText'
import { parseCompanyDocument, factsToCompanyDraft, type ParsedDocument } from '../engine/docParser'
import { applyEvidence, headcountBand } from '../engine/profile'
import { buildStrategy } from '../engine/strategy'
import { formatDate } from '../lib/util'

type Phase = 'pick' | 'working' | 'failed' | 'review' | 'merge'
const STAGES = ['PDF 읽는 중', '기업정보 찾는 중', '실제 사례 371건과 비교 중', '미팅 전략 만드는 중'] as const
const CORE_KEYS: CompanyFieldKey[] = ['name', 'representativeName', 'phone', 'industry', 'headcount', 'tradeType']
const SLOT_TITLE: Record<CoreSlotKey | 'name', string> = { name: '회사명 입력', industry: '업종 선택', headcount: '근로자 수 선택', revenue: '최근 매출 입력', years: '업력 입력' }

function coreLabel(k: CompanyFieldKey): string {
  return { name: '회사명', representativeName: '대표자', phone: '대표 연락처', industry: '업종', headcount: '인원', tradeType: '거래형태', interests: '관심사', meetingAt: '미팅 일시', memo: '메모' }[k]
}

export default function PdfIntakePage() {
  const { user, repo } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState(0)
  const [pageDone, setPageDone] = useState<[number, number]>([0, 0])
  const [text, setText] = useState<PdfTextResult | null>(null)
  const [parsed, setParsed] = useState<ParsedDocument | null>(null)
  const [evidence, setEvidence] = useState<EvidenceField[]>([])
  const [failMsg, setFailMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 핵심 정보 (검토 화면에서 확정)
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [industryNote, setIndustryNote] = useState('')
  const [headcount, setHeadcount] = useState<Headcount | 'unknown' | null>(null)
  const [tradeType, setTradeType] = useState<TradeType | 'unknown' | null>(null)
  const [interests, setInterests] = useState<Interest[]>([])
  const [rep, setRep] = useState('')
  const [phone, setPhone] = useState('')
  const [meetingTime, setMeetingTime] = useState<MeetingTimeValue>({ mode: 'now' })
  const [pdfCore, setPdfCore] = useState<Set<CompanyFieldKey>>(new Set())
  const [busy, setBusy] = useState(false)
  /** 기본 화면은 핵심 4가지만. [수정] 과 [추출정보 전체보기] 를 눌러야 나머지가 보인다 */
  const [editing, setEditing] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  /** 핵심 요약에서 빈 칸 하나만 채우는 작은 시트 ('name' 은 회사명) */
  const [slot, setSlot] = useState<CoreSlotKey | 'name' | null>(null)
  const [revenueInput, setRevenueInput] = useState('')
  const [yearsInput, setYearsInput] = useState('')
  /** 업종은 Hard Block 이 아니라 Soft Confirm — 한 번 물어보고, 그대로 진행할 수 있다 */
  const [industryConfirm, setIndustryConfirm] = useState(false)

  // 중복 / 병합
  const [similar, setSimilar] = useState<Company[] | null>(null)
  const [target, setTarget] = useState<Company | null>(null)
  const [choice, setChoice] = useState<Partial<Record<CompanyFieldKey, 'keep' | 'pdf'>>>({})

  useEffect(() => {
    document.title = 'PDF로 1분 준비 · AX Partner OS'
    if (!companyId) return
    let alive = true
    repo.getCompany(user, companyId).then((c) => alive && c && setTarget(c))
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const facts: ProfileFacts | null = useMemo(() => (parsed ? applyEvidence(parsed.facts, evidence) : null), [parsed, evidence])
  /** 저장 전 미리보기용 프로필 — 핵심 요약 카드가 같은 규칙으로 값을 고른다 */
  const previewProfile: CompanyProfile | null = useMemo(
    () =>
      parsed && facts
        ? { id: 'preview', companyId: 'preview', sourceType: 'pdf', sourceName: parsed.docKind, sourceFileName: file?.name ?? '', sourceHash: text?.sha256 ?? '', pageCount: text?.pageCount ?? 0, facts, evidence, parser: { adapter: parsed.adapter, version: parsed.version, textChars: parsed.textChars, warnings: parsed.warnings }, createdBy: user.id, createdAt: new Date().toISOString() }
        : null,
    [parsed, facts, evidence, file, text, user.id],
  )

  function reset(keepFile = false) {
    abortRef.current?.abort()
    abortRef.current = null
    if (!keepFile) setFile(null)
    setText(null)
    setParsed(null)
    setEvidence([])
    setStage(0)
    setPageDone([0, 0])
    setFailMsg('')
    setPhase('pick')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function start(f: File) {
    if (!/pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast.show('PDF 파일만 올릴 수 있습니다.', 'danger')
    if (f.size > 40 * 1024 * 1024) return toast.show('40MB 이하의 PDF만 처리합니다.', 'danger')
    setFile(f)
    setPhase('working')
    setStage(0)
    const ac = new AbortController()
    abortRef.current = ac
    void repo.track(user, 'pdf_uploaded', null, { size: f.size })
    try {
      const t = await extractPdfText(f, { signal: ac.signal, onProgress: (done, total) => setPageDone([done, total]) })
      if (ac.signal.aborted) return
      setText(t)
      if (!t.hasTextLayer) {
        setFailMsg('PDF에서 텍스트를 충분히 읽지 못했습니다. 스캔 이미지 PDF 이거나 텍스트 레이어가 없는 문서일 수 있습니다.')
        setPhase('failed')
        void repo.track(user, 'pdf_failed', null, { reason: 'no_text_layer', pageCount: t.pageCount })
        return
      }
      setStage(1)
      await tick()
      const p = parseCompanyDocument(t)
      if (ac.signal.aborted) return
      setParsed(p)
      setEvidence(p.evidence)
      const draft = factsToCompanyDraft(p.facts)
      setName(draft.name)
      setIndustry(p.facts.industry ?? null)
      setIndustryNote(draft.industryNote ?? '')
      setHeadcount(p.facts.headcountBand ?? null)
      setTradeType(p.facts.tradeType ?? null)
      setInterests(draft.interests)
      setRep(draft.representativeName ?? '')
      setPhone(draft.phone ?? '')
      const fromPdf = new Set<CompanyFieldKey>()
      if (draft.name) fromPdf.add('name')
      if (draft.representativeName) fromPdf.add('representativeName')
      if (draft.phone) fromPdf.add('phone')
      if (p.facts.industry) fromPdf.add('industry')
      if (p.facts.headcountBand) fromPdf.add('headcount')
      if (p.facts.tradeType) fromPdf.add('tradeType')
      setPdfCore(fromPdf)
      void repo.track(user, 'pdf_parsed', null, { pageCount: t.pageCount, fields: p.evidence.length, adapter: p.adapter, textChars: t.textChars })
      setStage(2)
      const cs: CaseStudy[] = await repo.listCases(user)
      if (ac.signal.aborted) return
      setStage(3)
      await tick()
      if (ac.signal.aborted) return
      // 미리 한 번 만들어 본다 (결정적이라 즉시 끝난다) — 실패해도 검토는 진행
      try {
        buildStrategy({ company: previewCompany(draft.name || '(회사)', p.facts.industry ?? 'other', p.facts.headcountBand ?? 'unknown', p.facts.tradeType ?? 'unknown', draft.interests), profile: null, cases: cs })
      } catch {
        /* ignore */
      }
      if (p.evidence.length === 0) {
        setFailMsg('PDF를 읽었지만 회사명·대표자·직원수 같은 기업정보 항목을 찾지 못했습니다. 기업정보 보고서·회사소개서 형식이 아닐 수 있습니다.')
        setPhase('failed')
        void repo.track(user, 'pdf_failed', null, { reason: 'no_fields', pageCount: t.pageCount })
        return
      }
      setPhase('review')
      // 기존 고객과 비슷하면 먼저 알려 준다 (자동 생성 금지). 기존 고객에 추가하러 온 경우는 바로 병합 화면
      if (target) {
        setChoice({})
        setPhase('merge')
      } else if (draft.name || draft.phone) {
        const list = await repo.findSimilarCompanies(user, draft.name, draft.phone ?? '')
        if (list.length) {
          setSimilar(list)
          void repo.track(user, 'company_duplicate_detected', null, { count: list.length, from: 'pdf' })
        }
      }
    } catch (cause) {
      if ((cause as { name?: string })?.name === 'AbortError') return
      setFailMsg(cause instanceof Error ? `PDF를 처리하지 못했습니다: ${cause.message}` : 'PDF를 처리하지 못했습니다.')
      setPhase('failed')
      void repo.track(user, 'pdf_failed', null, { reason: 'error' })
    } finally {
      abortRef.current = null
    }
  }

  function cancel() {
    reset()
    toast.show('분석을 취소했습니다. 임시 데이터는 지웠습니다.')
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void start(f)
  }

  /* ---- 검토: 항목 수정/제외 ---- */
  function removeField(key: string) {
    setEvidence((cur) => cur.map((e) => (e.key === key ? { ...e, removed: true } : e)))
    syncCore(key, null)
    void repo.track(user, 'profile_corrected', null, { key, action: 'removed', from: 'review' })
  }
  function restoreField(key: string) {
    const e = evidence.find((x) => x.key === key)
    setEvidence((cur) => cur.map((x) => (x.key === key ? { ...x, removed: false } : x)))
    if (e) syncCore(key, e.value)
  }
  function editField(key: string, v: string) {
    setEvidence((cur) =>
      cur.map((e) => {
        if (e.key !== key) return e
        const numeric = typeof e.value === 'number' || e.key === 'headcount' || e.key === 'patents' || e.key.startsWith('fin_')
        const value: EvidenceField['value'] = v === '' ? null : numeric ? Number(v.replace(/[^\d.-]/g, '')) : v
        const display = e.key === 'headcount' ? `${value}명` : e.key === 'patents' ? `${value}건` : e.key.startsWith('fin_') && typeof value === 'number' ? formatWon(value) : v
        return { ...e, value, display, status: 'confirmed', source: 'manual', removed: v === '' }
      }),
    )
    syncCore(key, v === '' ? null : key === 'headcount' ? Number(v.replace(/\D/g, '')) : v)
    void repo.track(user, 'profile_corrected', null, { key, action: 'edited', from: 'review' })
  }
  /** 근거 항목 변경 → 핵심 폼 값도 따라간다 */
  function syncCore(key: string, value: EvidenceField['value']) {
    const drop = <K extends CompanyFieldKey>(k: K) => setPdfCore((s) => {
      const n = new Set(s)
      n.delete(k)
      return n
    })
    if (key === 'companyName') {
      setName(value ? String(value) : '')
      if (!value) drop('name')
    } else if (key === 'representativeName') {
      setRep(value ? String(value) : '')
      if (!value) drop('representativeName')
    } else if (key === 'phone') {
      setPhone(value ? String(value) : '')
      if (!value) drop('phone')
    } else if (key === 'headcount') {
      setHeadcount(headcountBand(typeof value === 'number' ? value : null) ?? 'unknown')
      if (value === null) drop('headcount')
    } else if (key === 'industry') {
      setIndustry(value ? (String(value) as Industry) : null)
      if (!value) drop('industry')
    } else if (key === 'tradeType') {
      setTradeType(value ? (String(value) as TradeType) : 'unknown')
      if (!value) drop('tradeType')
    }
  }

  /** 문서에 없던 값을 직접 채운다 — 근거(evidence)로 남겨야 facts·프로필에 그대로 들어간다 */
  function upsertEvidence(key: string, label: string, value: EvidenceField['value'], display: string) {
    setEvidence((cur) => {
      const next: EvidenceField = { key, label, value, display, status: 'confirmed', source: 'manual', sourcePage: null, sourceText: '컨설턴트 직접 입력', removed: false }
      const i = cur.findIndex((e) => e.key === key)
      if (i < 0) return [...cur, next]
      const copy = [...cur]
      copy[i] = next
      return copy
    })
    void repo.track(user, 'profile_corrected', null, { key, action: 'filled', from: 'core_summary' })
  }

  const REVENUE_YEAR = facts?.growth.latestYear ?? new Date().getFullYear() - 1

  function openSlot(k: CoreSlotKey | 'name') {
    if (k === 'revenue') setRevenueInput('')
    if (k === 'years') setYearsInput(facts?.yearsInBusiness ? String(facts.yearsInBusiness) : '')
    setSlot(k)
  }

  /** 시트의 [확인] — 업종·인원·회사명은 고르는 즉시 반영되므로 닫기만 하면 된다 */
  function applySlot() {
    if (slot === 'revenue') {
      const eok = Number(revenueInput.replace(/[^\d.]/g, ''))
      if (Number.isFinite(eok) && eok > 0) {
        const won = Math.round(eok * 100_000_000)
        upsertEvidence(`fin_revenue_${REVENUE_YEAR}`, `${REVENUE_YEAR}년 매출액`, won, formatWon(won))
      }
    } else if (slot === 'years') {
      const n = Number(yearsInput.replace(/\D/g, ''))
      if (Number.isFinite(n) && n > 0) upsertEvidence('yearsInBusiness', '업력', n, `${n}년`)
    }
    setSlot(null)
  }

  const toggleInterest = (v: Interest) =>
    setInterests((cur) => {
      if (v === 'unknown') return cur.includes('unknown') ? [] : ['unknown']
      const next = cur.filter((x) => x !== 'unknown')
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v]
    })

  function fieldSourcesFor(applied: CompanyFieldKey[]): FieldSources {
    const fs: FieldSources = {}
    for (const k of CORE_KEYS) fs[k] = pdfCore.has(k) && applied.includes(k) ? 'pdf' : 'manual'
    fs.interests = 'manual'
    return fs
  }

  /* ---- 저장: 새 고객 ---- */
  /**
   * [이대로 준비] 를 눌렀을 때.
   * 저장을 막는 값은 회사명 하나뿐이다. 없으면 오류만 띄우지 않고 그 자리에서 입력창을 연다.
   * 업종은 Soft Confirm — 한 번 물어보되 [업종 없이 준비] 로 그대로 넘어갈 수 있다. 인원·거래형태는 절대 막지 않는다.
   */
  function requestConfirm() {
    if (!parsed || !text || !file || !facts) return
    if (!name.trim()) return openSlot('name')
    if (!industry) return setIndustryConfirm(true)
    void save()
  }

  async function save(industryOverride?: Industry | null) {
    if (!parsed || !text || !file || !facts) return
    if (!name.trim()) return openSlot('name')
    setBusy(true)
    try {
      let company = await repo.createCompany(user, {
        name: name.trim(),
        industry: industryOverride ?? industry ?? 'other',
        industryNote,
        headcount: headcount ?? 'unknown',
        tradeType: tradeType ?? 'unknown',
        interests: interests.length ? interests : ['unknown'],
        representativeName: rep.trim(),
        phone: phone.trim(),
        meetingAt: resolveMeetingTime(meetingTime),
        memo: '',
        fieldSources: { ...fieldSourcesFor(CORE_KEYS), meetingAt: 'manual' },
      })
      await repo.createProfile(user, { companyId: company.id, sourceType: 'pdf', sourceName: parsed.docKind, sourceFileName: file.name, sourceHash: text.sha256, pageCount: text.pageCount, facts, evidence, parser: { adapter: parsed.adapter, version: parsed.version, textChars: parsed.textChars, warnings: parsed.warnings } })
      try {
        const diag = await repo.lookupDiagnosis(user, company.name, company.phone)
        if (diag) company = await repo.updateCompany(user, { ...company, diagnosis: diag })
      } catch {
        /* ignore */
      }
      void repo.track(user, 'pdf_confirmed', null, { companyId: company.id, fields: evidence.filter((e) => !e.removed).length, removed: evidence.filter((e) => e.removed).length, merge: false })
      toast.show('업체 정보를 저장하고 미팅 전략을 만들었습니다.', 'ok')
      navigate(`/companies/${company.id}`, { replace: true })
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '저장하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  /* ---- 저장: 기존 고객에 정보 추가 (항목별 기존 유지 / PDF 반영, 자동 덮어쓰기 없음) ---- */
  const diffs = useMemo(() => {
    if (!target || !facts) return []
    const pdfVal: Partial<Record<CompanyFieldKey, string>> = {}
    if (facts.companyName) pdfVal.name = facts.companyName
    if (facts.representativeName) pdfVal.representativeName = facts.representativeName
    if (facts.phone) pdfVal.phone = facts.phone
    if (facts.industry) pdfVal.industry = facts.industry
    if (facts.headcountBand) pdfVal.headcount = facts.headcountBand
    if (facts.tradeType) pdfVal.tradeType = facts.tradeType
    const cur: Record<CompanyFieldKey, string> = { name: target.name, representativeName: target.representativeName, phone: target.phone, industry: target.industry, headcount: target.headcount, tradeType: target.tradeType, interests: '', meetingAt: '', memo: '' }
    return CORE_KEYS.filter((k) => pdfVal[k] && pdfVal[k] !== cur[k]).map((k) => ({ key: k, current: cur[k], pdf: pdfVal[k]! }))
  }, [target, facts])
  const show = (k: CompanyFieldKey, v: string) => (k === 'industry' ? INDUSTRY_LABEL[v as Industry] : k === 'headcount' ? HEADCOUNT_LABEL[v as Headcount | 'unknown'] : k === 'tradeType' ? TRADE_LABEL[v as TradeType | 'unknown'] : v || '없음')

  async function confirmMerge() {
    if (!target || !parsed || !text || !file || !facts) return
    setBusy(true)
    try {
      const applied = diffs.filter((d) => choice[d.key] === 'pdf').map((d) => d.key)
      let next: Company = { ...target, fieldSources: { ...(target.fieldSources ?? {}) } }
      for (const d of diffs) {
        if (choice[d.key] !== 'pdf') continue
        if (d.key === 'name') next.name = d.pdf
        if (d.key === 'representativeName') next.representativeName = d.pdf
        if (d.key === 'phone') next.phone = d.pdf
        if (d.key === 'industry') next.industry = d.pdf as Industry
        if (d.key === 'headcount') next.headcount = d.pdf as Headcount
        if (d.key === 'tradeType') next.tradeType = d.pdf as TradeType
        next.fieldSources = { ...next.fieldSources, [d.key]: 'pdf' }
      }
      if (applied.length) next = await repo.updateCompany(user, next)
      await repo.createProfile(user, { companyId: target.id, sourceType: 'pdf', sourceName: parsed.docKind, sourceFileName: file.name, sourceHash: text.sha256, pageCount: text.pageCount, facts, evidence, parser: { adapter: parsed.adapter, version: parsed.version, textChars: parsed.textChars, warnings: parsed.warnings } })
      void repo.track(user, 'pdf_confirmed', null, { companyId: target.id, fields: evidence.filter((e) => !e.removed).length, merge: true, applied: applied.length })
      toast.show(`${target.name}에 기업자료를 추가했습니다.${applied.length ? ` (${applied.length}개 항목 PDF 반영)` : ''}`, 'ok')
      navigate(`/companies/${target.id}`, { replace: true })
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '저장하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const activeEvidence = evidence.filter((e) => !e.removed)
  const removedCount = evidence.length - activeEvidence.length

  return (
    <div className="mx-auto max-w-[860px] pb-6 sm:pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link to={target ? `/companies/${target.id}` : '/companies/new'} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
          <ArrowLeft aria-hidden="true" className="size-4" /> {target ? '미팅 전략으로' : '가져오기 방법'}
        </Link>
        {file && phase !== 'pick' && (
          <span className="t-meta inline-flex items-center gap-1 text-ink-500" data-testid="pdf-file-name">
            <FileText aria-hidden="true" className="size-4" /> {file.name}
            {text ? ` · ${text.pageCount}쪽` : ''}
          </span>
        )}
      </div>

      {/* 1) 파일 선택 */}
      {phase === 'pick' && (
        <section className="reveal mt-3">
          <h1 className="t-page">{target ? `${target.name}에 기업자료 추가` : 'PDF로 1분 준비'}</h1>
          <p className="t-body mt-2 text-ink-500">기업정보 · 크레탑 · 신용정보 · 회사소개서 PDF를 올리면 브라우저에서 바로 읽습니다. 원본 파일은 저장하지 않습니다.</p>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`mt-6 flex flex-col items-center justify-center rounded-(--radius-card) border-2 border-dashed px-6 py-10 text-center ${dragOver ? 'border-accent-600 bg-accent-50' : 'border-line-strong bg-white'}`}
            data-testid="pdf-drop"
          >
            <Upload aria-hidden="true" className="size-10 text-accent-600" />
            <p className="t-body mt-3 font-bold">파일을 여기에 끌어놓기</p>
            <p className="t-sub text-ink-500">또는</p>
            <label className="btn tap mt-3 inline-flex h-14 cursor-pointer items-center justify-center rounded-(--radius-control) border border-accent-600 bg-accent-600 px-6 text-[1.1rem] font-semibold text-white hover:bg-accent-700">
              PDF 선택
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && void start(e.target.files[0])} data-testid="pdf-input" />
            </label>
            <p className="t-meta mt-4 text-ink-500">텍스트가 있는 PDF만 읽습니다 (스캔 이미지 PDF는 아직 지원하지 않습니다). 40MB 이하.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/companies/new/quick" className="t-sub font-semibold text-accent-700 hover:underline">
              PDF가 없으면 30초 빠른 등록 →
            </Link>
          </div>
        </section>
      )}

      {/* 2) 진행 단계 */}
      {phase === 'working' && (
        <section className="reveal mt-3" data-testid="pdf-progress" aria-live="polite">
          <h1 className="t-page">읽는 중…</h1>
          <ol className="mt-6 space-y-3">
            {STAGES.map((s, i) => (
              <li key={s} className="flex items-center gap-3" data-stage={i} data-state={i < stage ? 'done' : i === stage ? 'active' : 'todo'}>
                <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-black ${i < stage ? 'bg-ok-50 text-ok-700' : i === stage ? 'bg-accent-600 text-white' : 'bg-paper-2 text-ink-300'}`} aria-hidden="true">
                  {i < stage ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`text-[1.05rem] ${i === stage ? 'font-black' : i < stage ? 'font-semibold text-ink-500' : 'text-ink-300'}`}>
                  {s}
                  {i === 0 && stage === 0 && pageDone[1] > 0 && <span className="tnum t-sub ml-2 text-ink-500">{pageDone[0]} / {pageDone[1]}쪽</span>}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <Button onClick={cancel} data-testid="pdf-cancel">
              <X aria-hidden="true" className="size-4" /> 취소
            </Button>
          </div>
        </section>
      )}

      {/* 실패 — 막히지 않는다 */}
      {phase === 'failed' && (
        <section className="reveal mt-3" data-testid="pdf-failed">
          <h1 className="t-page">읽지 못했습니다</h1>
          <p className="t-body mt-2 rounded-(--radius-control) bg-warn-50 px-4 py-3 font-semibold text-warn-700">{failMsg}</p>
          {text && text.textChars > 0 && <p className="t-sub mt-2 text-ink-500">읽은 글자 {text.textChars.toLocaleString('ko-KR')}자 · {text.pageCount}쪽. 값이 조금이라도 잡혔다면 아래에서 그대로 쓸 수 있습니다.</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={target ? `/companies/${target.id}/edit` : '/companies/new/quick'} className="btn inline-flex h-14 items-center justify-center rounded-(--radius-control) border border-accent-600 bg-accent-600 px-6 text-[1.1rem] font-semibold text-white hover:bg-accent-700" data-testid="fallback-quick">
              직접 30초 등록
            </Link>
            <Button size="lg" onClick={() => reset()} data-testid="pdf-retry">
              다른 PDF 선택
            </Button>
            {parsed && parsed.evidence.length > 0 && (
              <Button size="lg" onClick={() => setPhase('review')}>
                읽은 {parsed.evidence.length}개 항목으로 계속
              </Button>
            )}
          </div>
        </section>
      )}

      {/* 3) 검토 */}
      {(phase === 'review' || phase === 'merge') && parsed && text && (
        <section className="reveal mt-3" data-testid="pdf-review">
          <h1 className="t-page">이 회사가 맞나요?</h1>
          <p className="t-sub mt-1 text-ink-500">
            {parsed.docKind} {text.pageCount}쪽에서 읽었습니다. 원본 PDF는 저장하지 않고 브라우저에서만 처리했습니다.
          </p>

          {phase === 'review' && (
            <div className="mt-5 space-y-5">
              <CompanyCoreSummary
                company={{ name, industry: industry ?? 'other', industryNote, headcount: headcount ?? 'unknown', representativeName: rep }}
                profile={previewProfile}
                title={
                  name ? undefined : (
                    <button type="button" onClick={() => openSlot('name')} className="tap cursor-pointer rounded-(--radius-control) border-2 border-dashed border-accent-600 px-3 py-1 text-[1.2rem] font-bold text-accent-700 hover:bg-accent-50" data-testid="core-fill-name">
                      회사명 입력
                    </button>
                  )
                }
                onFill={openSlot}
                action={
                  <Button size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing} data-testid="core-edit">
                    <Pencil aria-hidden="true" className="size-4" /> {editing ? '닫기' : '수정'}
                  </Button>
                }
              />

              <div>
                <p className="t-section mb-2.5">미팅</p>
                <MeetingTimePicker value={meetingTime} onChange={setMeetingTime} />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setDetailOpen(true)} data-testid="open-evidence">
                  <FileText aria-hidden="true" className="size-4" /> 추출정보 전체보기 ({activeEvidence.length})
                </Button>
                {removedCount > 0 && <span className="t-meta text-ink-500">사용 안 함 {removedCount}개</span>}
              </div>

              {editing && (
                <div className="reveal space-y-6 rounded-(--radius-card) border border-line bg-paper px-4 py-5 sm:px-5" data-testid="core-edit-form">
                  <p className="t-sub text-ink-500">PDF에서 온 값은 그대로 두거나 바꿀 수 있습니다. 모르면 "잘 모르겠음"을 고르세요.</p>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-[1rem] font-bold">
                    회사명 {pdfCore.has('name') && <Badge tone="info">PDF</Badge>}
                  </span>
                  <TextInput value={name} onChange={(e) => {
                    setName(e.target.value)
                    setPdfCore((s) => {
                      const n = new Set(s)
                      n.delete('name')
                      return n
                    })
                  }} data-testid="company-name" className="text-[1.2rem]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-[1rem] font-bold">
                      대표자 <span className="t-meta font-medium text-ink-500">선택</span> {pdfCore.has('representativeName') && <Badge tone="info">PDF</Badge>}
                    </span>
                    <TextInput value={rep} onChange={(e) => setRep(e.target.value)} data-testid="company-rep" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-[1rem] font-bold">
                      대표 연락처 <span className="t-meta font-medium text-ink-500">선택</span> {pdfCore.has('phone') && <Badge tone="info">PDF</Badge>}
                    </span>
                    <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" data-testid="company-phone" />
                  </label>
                </div>
                <div>
                  <p className="t-section mb-2.5 flex items-center gap-2">
                    업종 {pdfCore.has('industry') && <EvidenceBadge status={evidence.find((e) => e.key === 'industry')?.status ?? 'assumed'} />}
                  </p>
                  <ChoiceGrid columns={3} ariaLabel="업종" options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))} value={industry} onChange={setIndustry} />
                  {industry === 'other' && <TextInput value={industryNote} onChange={(e) => setIndustryNote(e.target.value)} placeholder="업종을 한 줄로 (선택)" aria-label="업종 메모" className="mt-3" />}
                </div>
                <div>
                  <p className="t-section mb-2.5 flex items-center gap-2">
                    인원 {pdfCore.has('headcount') && <EvidenceBadge status={evidence.find((e) => e.key === 'headcount')?.status ?? 'confirmed'} />}
                  </p>
                  <ChoiceGrid columns={3} ariaLabel="인원" options={HEADCOUNT_ORDER.map((v) => ({ value: v, label: HEADCOUNT_LABEL[v] }))} value={headcount} onChange={setHeadcount} />
                </div>
                <div>
                  <p className="t-section mb-2.5 flex items-center gap-2">
                    거래형태 {pdfCore.has('tradeType') && <EvidenceBadge status="assumed" />}
                  </p>
                  <ChoiceGrid columns={2} ariaLabel="거래형태" options={TRADE_ORDER.map((v) => ({ value: v, label: TRADE_LABEL[v], hint: TRADE_HINT[v] }))} value={tradeType} onChange={setTradeType} />
                </div>
                <div>
                  <p className="t-section mb-2.5">대표님이 요즘 가장 신경 쓰는 것</p>
                  <ChoiceGrid columns={2} multi ariaLabel="대표 관심사" options={INTEREST_PRIMARY.map((v) => ({ value: v, label: INTEREST_LABEL[v], hint: INTEREST_HINT[v] }))} value={interests} onChange={toggleInterest} />
                  <details className="mt-3 group" data-testid="interest-more">
                    <summary className="tap t-sub inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
                      <span aria-hidden="true" className="transition-transform group-open:rotate-90">▸</span> 그 밖의 관심사 <span className="t-meta font-medium">선택</span>
                    </summary>
                    <div className="mt-2.5">
                      <ChoiceGrid columns={3} multi ariaLabel="그 밖의 관심사" options={INTEREST_EXTRA.map((v) => ({ value: v, label: INTEREST_LABEL[v], hint: INTEREST_HINT[v] }))} value={interests} onChange={toggleInterest} />
                    </div>
                  </details>
                </div>
                </div>
              )}
            </div>
          )}

          {phase === 'merge' && target && (
            <div className="mt-8" data-testid="merge-panel">
              <h2 className="t-section">
                기존 고객 <span className="text-accent-700">{target.name}</span> 에 정보 추가
              </h2>
              <p className="t-sub mt-1 text-ink-500">다른 값이 있는 항목만 보여 드립니다. 자동으로 덮어쓰지 않습니다 — 항목마다 고르세요.</p>
              {/* 기존 고객에 서류를 추가할 때도 무엇을 읽었는지 확인할 수 있어야 한다 (명부의 개인정보 경고도 여기 있다) */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button onClick={() => setDetailOpen(true)} data-testid="open-evidence">
                  <FileText aria-hidden="true" className="size-4" /> 추출정보 전체보기 ({activeEvidence.length})
                </Button>
                {removedCount > 0 && <span className="t-meta text-ink-500">사용 안 함 {removedCount}개</span>}
              </div>
              {diffs.length === 0 ? (
                <p className="t-body mt-3 rounded-(--radius-control) bg-paper-2 px-4 py-3 text-ink-700">기본 정보는 이미 같습니다. 기업자료(재무·인증·근거)만 추가됩니다.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                  {diffs.map((d) => (
                    <li key={d.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr_1fr]" data-testid="merge-row" data-key={d.key}>
                      <span className="t-sub font-bold text-ink-500">{coreLabel(d.key)}</span>
                      <button type="button" onClick={() => setChoice((c) => ({ ...c, [d.key]: 'keep' }))} aria-pressed={choice[d.key] !== 'pdf'} className={`tap rounded-(--radius-control) border-2 px-3 py-2 text-left ${choice[d.key] !== 'pdf' ? 'border-accent-600 bg-accent-50' : 'border-line bg-white'}`} data-testid="merge-keep">
                        <span className="t-meta block font-bold text-ink-500">기존 유지</span>
                        <span className="block font-bold">{show(d.key, d.current)}</span>
                      </button>
                      <button type="button" onClick={() => setChoice((c) => ({ ...c, [d.key]: 'pdf' }))} aria-pressed={choice[d.key] === 'pdf'} className={`tap rounded-(--radius-control) border-2 px-3 py-2 text-left ${choice[d.key] === 'pdf' ? 'border-accent-600 bg-accent-50' : 'border-line bg-white'}`} data-testid="merge-pdf">
                        <span className="t-meta block font-bold text-ink-500">PDF 반영</span>
                        <span className="block font-bold">{show(d.key, d.pdf)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/*
            하단 고정 CTA. sticky 는 자기 자리를 flow 에 남기고 떠오르기 때문에, 바로 아래에 여유가 없으면
            문서 끝까지 내려도 바가 마지막 내용을 덮는다(모바일에서 미팅 시각 줄이 가려지던 원인).
            아래 spacer 만큼 자리를 두면 끝까지 내렸을 때 바가 제자리에 앉아 아무것도 가리지 않는다.
          */}
          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-3 sm:border-t sm:border-line sm:pt-5">
              <Button onClick={() => reset()} disabled={busy} data-testid="pdf-retry">
                다른 PDF
              </Button>
              {phase === 'merge' ? (
                <div className="flex flex-1 justify-end gap-2">
                  {!companyId && (
                    <Button onClick={() => {
                      setTarget(null)
                      setPhase('review')
                    }} disabled={busy}>
                      새 고객으로 등록
                    </Button>
                  )}
                  <Button variant="primary" size="lg" onClick={() => void confirmMerge()} disabled={busy} data-testid="merge-confirm" className="flex-1 sm:flex-none">
                    {busy ? '저장 중…' : '정보 추가하고 전략 보기'}
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="lg" onClick={requestConfirm} disabled={busy} data-testid="pdf-confirm" className="flex-1 sm:flex-none">
                  {busy ? '저장 중…' : '이대로 준비'}
                </Button>
              )}
            </div>
          </div>
          <div aria-hidden="true" className="h-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:hidden" data-testid="cta-spacer" />
        </section>
      )}

      {/* 핵심 요약의 빈 칸 하나 채우기 — 기존 선택지(업종·인원)를 그대로 쓴다 */}
      <Sheet open={slot !== null} onClose={() => setSlot(null)} title={SLOT_TITLE[slot ?? 'name']} testId="core-fill-sheet">
        {slot === 'name' && (
          <label className="block">
            <span className="t-sub mb-2 block text-ink-500">PDF에서 회사명을 읽지 못했습니다. 미팅 자료에 적힌 이름 그대로 적어 주세요.</span>
            <TextInput
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setPdfCore((cur) => {
                  const n = new Set(cur)
                  n.delete('name')
                  return n
                })
              }}
              className="text-[1.2rem]"
              data-testid="slot-name"
              aria-label="회사명"
            />
          </label>
        )}
        {slot === 'industry' && (
          <>
            <p className="t-sub mb-3 text-ink-500">같은 업종 실제 사례를 찾는 데 씁니다. 정확한 분류가 아니어도 가장 가까운 것을 고르면 됩니다.</p>
            <ChoiceGrid columns={3} ariaLabel="업종" options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))} value={industry} onChange={setIndustry} />
            {industry === 'other' && <TextInput value={industryNote} onChange={(e) => setIndustryNote(e.target.value)} placeholder="업종을 한 줄로 (선택)" aria-label="업종 메모" className="mt-3" />}
          </>
        )}
        {slot === 'headcount' && (
          <>
            <p className="t-sub mb-3 text-ink-500">정규직 기준 대략이면 됩니다. 모르면 "잘 모르겠음" 그대로 두고 진행해도 됩니다.</p>
            <ChoiceGrid columns={3} ariaLabel="근로자 수" options={HEADCOUNT_ORDER.map((v) => ({ value: v, label: HEADCOUNT_LABEL[v] }))} value={headcount} onChange={setHeadcount} />
          </>
        )}
        {slot === 'revenue' && (
          <label className="block">
            <span className="t-sub mb-2 block text-ink-500">{REVENUE_YEAR}년 기준 연매출을 억원 단위로 적어 주세요. 예) 12.5</span>
            <TextInput value={revenueInput} onChange={(e) => setRevenueInput(e.target.value)} inputMode="decimal" placeholder="억원" aria-label="최근 연매출 (억원)" data-testid="slot-revenue" className="text-[1.2rem]" />
          </label>
        )}
        {slot === 'years' && (
          <label className="block">
            <span className="t-sub mb-2 block text-ink-500">설립 후 몇 년 되었는지 대략 적어 주세요.</span>
            <TextInput value={yearsInput} onChange={(e) => setYearsInput(e.target.value)} inputMode="numeric" placeholder="년" aria-label="업력 (년)" data-testid="slot-years" className="text-[1.2rem]" />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setSlot(null)}>닫기</Button>
          <Button variant="primary" onClick={applySlot} data-testid="slot-apply">
            확인
          </Button>
        </div>
      </Sheet>

      {/* 업종 Soft Confirm — 막지 않는다. 고르면 사례가 붙고, 그대로 진행해도 된다 */}
      <Sheet open={industryConfirm} onClose={() => setIndustryConfirm(false)} title="업종을 고르시겠어요?" testId="industry-confirm">
        <p className="t-body text-ink-700">업종을 알면 같은 업종에서 실제로 바뀐 사례를 추천할 수 있습니다. 지금 모르면 그대로 진행하세요 — 미팅 중에 확인한 뒤 고쳐도 늦지 않습니다.</p>
        <div className="mt-4">
          <ChoiceGrid
            columns={3}
            ariaLabel="업종"
            options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))}
            value={industry}
            onChange={(v) => {
              setIndustry(v)
              setIndustryConfirm(false)
              void save(v)
            }}
          />
        </div>
        <div className="mt-5">
          <Button
            size="lg"
            className="w-full sm:w-auto sm:float-right"
            onClick={() => {
              setIndustryConfirm(false)
              void save(null)
            }}
            disabled={busy}
            data-testid="industry-skip"
          >
            업종 없이 준비
          </Button>
        </div>
      </Sheet>

      {/* 추출정보 전체보기 — 기본 Journey 에서는 보이지 않는다 */}
      <Sheet open={detailOpen} onClose={() => setDetailOpen(false)} title="추출정보 전체보기" wide testId="evidence-sheet">
        <p className="t-sub text-ink-500">재무·기업인증·주소·제품·특허·신용정보까지 PDF에서 읽은 값 전체입니다. 값을 고치거나 [사용 안 함]으로 뺄 수 있습니다.</p>
        {parsed && parsed.warnings.length > 0 && (
          <ul className="t-sub mt-3 space-y-1 rounded-(--radius-control) bg-warn-50 px-4 py-3 text-warn-700" data-testid="pdf-warnings">
            {parsed.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <EvidenceList evidence={evidence} onEdit={editField} onRemove={removeField} onRestore={restoreField} />
        </div>
      </Sheet>

      {/* 중복 안내 — 자동 생성 금지 */}
      <Sheet open={Boolean(similar)} onClose={() => setSimilar(null)} title="이미 등록된 고객과 비슷합니다" testId="dup-sheet">
        <p className="t-body text-ink-700">
          PDF에서 찾은 <b>{name}</b> 와(과) 비슷한 고객이 있습니다. 같은 회사라면 기존 고객에 정보를 추가하세요.
        </p>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-control) border border-line">
          {(similar ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {c.name}
                  {c.archivedAt && <span className="ml-2 t-meta font-bold text-warn-700">휴지통</span>}
                </span>
                <span className="t-meta block text-ink-500">
                  {c.phone || '연락처 없음'} · 등록 {formatDate(c.createdAt)}
                  {c.meetingAt && ` · 미팅 ${formatDate(c.meetingAt)}`}
                </span>
              </span>
              {!c.archivedAt && (
                <Button size="sm" variant="primary" onClick={() => {
                  setTarget(c)
                  setChoice({})
                  setSimilar(null)
                  setPhase('merge')
                }} data-testid="merge-existing">
                  기존 고객에 정보 추가
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setSimilar(null)} data-testid="register-anyway">
            새 고객으로 등록
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 120))
}

function previewCompany(name: string, industry: Industry, headcount: Headcount | 'unknown', tradeType: TradeType | 'unknown', interests: Interest[]): Company {
  const now = new Date().toISOString()
  return { id: 'preview', consultantId: 'preview', name, industry, industryNote: '', headcount, tradeType, interests, representativeName: '', phone: '', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: now, updatedAt: now }
}
