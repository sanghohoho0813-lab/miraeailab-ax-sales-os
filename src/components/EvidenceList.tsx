/**
 * 추출 근거 목록 — 항목이 많아도 화면은 단순하게: 기본 정보 · 규모·인증 · 재무(연도 표) · 추정 4묶음.
 * 각 값은 [수정] [사용 안 함] [되돌리기]. 재무는 항목(매출액…)별로 제외하고, 셀을 눌러 값을 고친다.
 * PDF 검토 화면과 기업자료 시트가 같이 쓴다.
 */
import { useState } from 'react'
import { Pencil, RotateCcw, X } from 'lucide-react'
import type { EvidenceField } from '../types/domain'
import { Button, EvidenceBadge, TextInput } from './ui'
import { formatWon, formatWonShort } from '../engine/docParser/korean'

export interface EvidenceListProps {
  evidence: EvidenceField[]
  /** 없으면 읽기 전용 */
  onEdit?: (key: string, value: string) => void
  onRemove?: (key: string) => void
  onRestore?: (key: string) => void
  compact?: boolean
}

const GROUPS: { id: string; label: string; keys: string[] }[] = [
  { id: 'basic', label: '기본 정보', keys: ['companyName', 'representativeName', 'phone', 'address', 'foundedAt', 'yearsInBusiness', 'industryText', 'industryCode', 'industry'] },
  { id: 'scale', label: '규모 · 인증 · 제품', keys: ['headcount', 'products', 'certifications', 'patents', 'creditNote'] },
  { id: 'assumed', label: '추정 (문서 문구로 추론)', keys: ['tradeType', 'revenueTrend'] },
]
const FIN_ITEMS: [string, string][] = [
  ['revenue', '매출액'],
  ['operatingProfit', '영업이익'],
  ['netIncome', '당기순이익'],
  ['assets', '자산총계'],
  ['liabilities', '부채총계'],
  ['equity', '자본총계'],
]
const FIN_RE = /^fin_(revenue|operatingProfit|netIncome|assets|liabilities|equity)_(\d{4})$/

function whereOf(e: EvidenceField): string {
  return e.source === 'pdf' ? `PDF${e.sourcePage ? ` ${e.sourcePage}p` : ''}` : e.source === 'voice' ? '음성' : e.source === 'manual' ? '직접 수정' : e.source === 'website_diagnosis' ? '사전진단' : '마스터 수정'
}

export function EvidenceList({ evidence, onEdit, onRemove, onRestore, compact = false }: EvidenceListProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editable = Boolean(onEdit || onRemove)
  const byKey = new Map(evidence.map((e) => [e.key, e]))
  const fin = evidence.filter((e) => FIN_RE.test(e.key))
  const years = [...new Set(fin.map((e) => Number(e.key.match(FIN_RE)![2])))].sort()
  const known = new Set([...GROUPS.flatMap((g) => g.keys), ...fin.map((e) => e.key)])
  const others = evidence.filter((e) => !known.has(e.key))

  const begin = (e: EvidenceField) => {
    setEditingKey(e.key)
    setEditValue(e.value === null ? '' : String(e.value))
  }
  const commit = () => {
    if (editingKey && onEdit) onEdit(editingKey, editValue.trim())
    setEditingKey(null)
  }

  // 폰(390px)에서는 라벨·상태·출처 한 줄, 값 한 줄, 버튼은 아이콘만 — 값이 세로로 쪼개지지 않게
  const row = (e: EvidenceField) => (
    <li key={e.key} className={`px-4 py-2.5 ${e.removed ? 'bg-paper opacity-70' : ''}`} data-testid="evidence-row" data-key={e.key} data-removed={e.removed ? 'true' : 'false'}>
      <div className="flex items-center gap-2">
        <span className="t-sub shrink-0 font-bold text-ink-500">{e.label}</span>
        {!e.removed && <EvidenceBadge status={e.status} />}
        <span className="t-meta shrink-0 text-ink-500">{whereOf(e)}</span>
        {editable && (
          <span className="ml-auto flex shrink-0 gap-0.5">
            {e.removed ? (
              onRestore && (
                <Button size="sm" variant="ghost" onClick={() => onRestore(e.key)} aria-label={`${e.label} 되돌리기`} data-testid="evidence-restore">
                  <RotateCcw aria-hidden="true" className="size-4" /> <span className="hidden sm:inline">되돌리기</span>
                </Button>
              )
            ) : (
              <>
                {onEdit && (
                  <Button size="sm" variant="ghost" onClick={() => begin(e)} aria-label={`${e.label} 수정`} data-testid="evidence-edit">
                    <Pencil aria-hidden="true" className="size-4" /> <span className="hidden sm:inline">수정</span>
                  </Button>
                )}
                {onRemove && (
                  <Button size="sm" variant="ghost" onClick={() => onRemove(e.key)} aria-label={`${e.label} 사용 안 함`} data-testid="evidence-remove">
                    <X aria-hidden="true" className="size-4" /> <span className="hidden sm:inline">사용 안 함</span>
                  </Button>
                )}
              </>
            )}
          </span>
        )}
      </div>
      {editingKey === e.key ? (
        <div className="mt-1.5 flex gap-2">
          <TextInput value={editValue} onChange={(ev) => setEditValue(ev.target.value)} autoFocus aria-label={`${e.label} 수정`} data-testid="evidence-edit-input" onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), commit())} />
          <Button size="sm" variant="primary" onClick={commit} data-testid="evidence-edit-save">
            저장
          </Button>
          <Button size="sm" onClick={() => setEditingKey(null)}>
            취소
          </Button>
        </div>
      ) : (
        <p className={`mt-0.5 break-words text-[1.05rem] font-bold ${e.removed ? 'line-through text-ink-300' : ''}`} data-testid="evidence-value">
          {e.display || '-'}
        </p>
      )}
      {!compact && !e.removed && e.sourceText && <p className="t-meta mt-0.5 truncate text-ink-500">"{e.sourceText}"</p>}
    </li>
  )

  return (
    <div className="space-y-4" data-testid="evidence-list">
      {GROUPS.map((g) => {
        const items = g.keys.map((k) => byKey.get(k)).filter((e): e is EvidenceField => Boolean(e))
        if (!items.length) return null
        return (
          <section key={g.id}>
            <p className="t-meta mb-1.5 font-black tracking-wide text-ink-500">{g.label}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">{items.map(row)}</ul>
          </section>
        )
      })}

      {fin.length > 0 && (
        <section data-testid="evidence-financials">
          <p className="t-meta mb-1.5 font-black tracking-wide text-ink-500">
            재무 ({years[0]}{years.length > 1 ? `~${years[years.length - 1]}` : ''}) · {whereOf(fin[0])}
          </p>
          <div className="overflow-x-auto rounded-(--radius-card) border border-line bg-white">
            <table className="w-full min-w-[360px] text-[0.95rem]">
              <thead>
                <tr className="bg-paper-2 text-ink-500">
                  <th className="px-3 py-2 text-left t-meta font-bold">항목</th>
                  {years.map((y) => (
                    <th key={y} className="tnum px-3 py-2 text-right t-meta font-bold">
                      {y}
                    </th>
                  ))}
                  {editable && <th className="w-24" />}
                </tr>
              </thead>
              <tbody>
                {FIN_ITEMS.map(([item, label]) => {
                  const cells = years.map((y) => byKey.get(`fin_${item}_${y}`))
                  if (cells.every((c) => !c)) return null
                  const removed = cells.filter(Boolean).every((c) => c!.removed)
                  return (
                    <tr key={item} className={`border-t border-line ${removed ? 'bg-paper opacity-70' : ''}`} data-testid="fin-row" data-item={item} data-removed={removed ? 'true' : 'false'}>
                      <td className="px-3 py-2 font-bold">{label}</td>
                      {cells.map((c, i) => (
                        <td key={years[i]} className="tnum px-3 py-1.5 text-right">
                          {!c ? (
                            <span className="text-ink-300">-</span>
                          ) : editingKey === c.key ? (
                            <span className="flex justify-end gap-1">
                              <input value={editValue} onChange={(ev) => setEditValue(ev.target.value)} autoFocus aria-label={`${c.label} 수정 (원)`} className="w-32 rounded border border-line-strong px-2 py-1 text-right" data-testid="evidence-edit-input" onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), commit())} />
                              <button type="button" onClick={commit} className="rounded bg-accent-600 px-2 py-1 t-meta font-bold text-white" data-testid="evidence-edit-save">
                                저장
                              </button>
                            </span>
                          ) : (
                            <button type="button" disabled={!onEdit || c.removed} onClick={() => begin(c)} title={typeof c.value === 'number' ? `${formatWon(c.value)}${onEdit ? ' — 눌러서 수정 (원 단위)' : ''}` : undefined} className={`whitespace-nowrap rounded px-1.5 py-1 ${c.removed ? 'line-through text-ink-300' : onEdit ? 'hover:bg-accent-50' : ''}`} data-testid="fin-cell" data-key={c.key}>
                              {typeof c.value === 'number' ? formatWonShort(c.value) : c.display}
                            </button>
                          )}
                        </td>
                      ))}
                      {editable && (
                        <td className="px-2 py-1 text-right">
                          {removed
                            ? onRestore && (
                                <Button size="sm" variant="ghost" onClick={() => cells.forEach((c) => c && onRestore(c.key))} data-testid="fin-restore">
                                  되돌리기
                                </Button>
                              )
                            : onRemove && (
                                <Button size="sm" variant="ghost" onClick={() => cells.forEach((c) => c && !c.removed && onRemove(c.key))} data-testid="fin-remove">
                                  사용 안 함
                                </Button>
                              )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="t-meta mt-1 text-ink-500">단위는 문서의 "(단위: 백만원)" 표기를 적용해 원으로 환산했습니다. 셀을 눌러 원 단위로 고칠 수 있습니다.</p>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <p className="t-meta mb-1.5 font-black tracking-wide text-ink-500">기타</p>
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">{others.map(row)}</ul>
        </section>
      )}
    </div>
  )
}
