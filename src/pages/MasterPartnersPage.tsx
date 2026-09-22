/** MASTER — 파트너 등록·수정·활성화. 이메일은 Supabase Auth 소유(읽기 전용). 마지막 활성 마스터 보호는 DB 가 최종 판정한다. */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useAuth, useSession } from '../lib/auth'
import type { PartnerMember } from '../types/domain'
import { Badge, Button, Field, PageTitle, Section, Sheet, SkeletonList, TextInput, useToast } from '../components/ui'
import { formatDate } from '../lib/util'

const select = 'w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1rem]'

export default function MasterPartnersPage() {
  const { user, repo } = useSession()
  const { refreshProfile } = useAuth()
  const toast = useToast()
  const [members, setMembers] = useState<PartnerMember[] | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'partner' | 'master'>('partner')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<PartnerMember | null>(null)
  const [form, setForm] = useState({ displayName: '', title: '', role: 'partner' as 'partner' | 'master', active: true })

  useEffect(() => {
    document.title = '파트너 관리 · AX Partner OS'
    repo.listMembers(user).then(setMembers).catch((e) => toast.show(e instanceof Error ? e.message : '불러오지 못했습니다.', 'danger'))
  }, [repo, user, toast])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const m = await repo.addMember(user, email, name, role)
      setMembers((cur) => [...(cur ?? []), m])
      setEmail('')
      setName('')
      toast.show('파트너를 등록했습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '등록하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }
  function openEdit(m: PartnerMember) {
    setEditing(m)
    setForm({ displayName: m.displayName, title: m.title, role: m.role, active: m.active })
  }
  async function save() {
    if (!editing || busy) return
    setBusy(true)
    try {
      const next = await repo.updateMember(user, editing.profileId, form)
      setMembers((cur) => (cur ?? []).map((x) => (x.profileId === next.profileId ? next : x)))
      if (next.profileId === user.id) await refreshProfile()
      toast.show('저장했습니다. 이름·호칭은 인사말과 전달 패킷에 반영됩니다.', 'ok')
      setEditing(null)
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '저장하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }
  const activeMasters = (members ?? []).filter((m) => m.role === 'master' && m.active).length
  const isSelf = editing?.profileId === user.id
  const isLastMaster = editing?.role === 'master' && editing.active && activeMasters <= 1

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageTitle title="파트너 관리" sub="파트너는 본인·배정 고객만 봅니다. 이메일은 로그인 계정(Auth) 소유라 여기서 바꾸지 않습니다." />
      <Section title="파트너 등록" sub="miraeailab.com 에 가입한 이메일이어야 합니다.">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="이메일">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="표시 이름">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 곽주환" required />
          </Field>
          <Field label="역할">
            <select value={role} onChange={(e) => setRole(e.target.value as 'partner' | 'master')} className={select}>
              <option value="partner">파트너</option>
              <option value="master">마스터</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            등록
          </Button>
        </form>
      </Section>
      <Section title="등록된 파트너" sub={`활성 마스터 ${activeMasters}명 — 마지막 마스터는 비활성화·강등할 수 없습니다`}>
        {!members ? (
          <SkeletonList rows={2} />
        ) : (
          <ul className="divide-y divide-line" data-testid="member-list">
            {members.map((m) => (
              <li key={m.profileId} className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid="member-row">
                <span className="min-w-0">
                  <Link to={`/master/partners/${m.profileId}`} className="block font-bold hover:text-accent-700" data-testid="member-name">
                    {m.displayName}
                    {m.title ? ` ${m.title}` : ''} <Badge tone={m.role === 'master' ? 'dark' : 'accent'}>{m.role === 'master' ? '마스터' : '파트너'}</Badge> {!m.active && <Badge tone="danger">비활성</Badge>}
                    {m.profileId === user.id && <Badge>나</Badge>}
                  </Link>
                  <span className="t-sub text-ink-500">
                    {m.email} · {formatDate(m.createdAt)}
                  </span>
                </span>
                <Button size="sm" onClick={() => openEdit(m)} data-testid="edit-member">
                  <Pencil aria-hidden="true" className="size-4" /> 수정
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={`${editing?.displayName ?? ''} 수정`} testId="member-sheet">
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <Field label="이메일 (읽기 전용)">
              <TextInput value={editing.email} readOnly className="bg-paper-2 text-ink-500" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="표시 이름">
                <TextInput value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required data-testid="member-display-name" />
              </Field>
              <Field label="직책 · 호칭" hint="예: 팀장, 대표 — 인사말·PDF·전달 패킷에 붙습니다">
                <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="member-title" />
              </Field>
              <Field label="역할">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'partner' | 'master' })} className={select} disabled={(isSelf && editing.role === 'master') || isLastMaster} data-testid="member-role">
                  <option value="partner">파트너</option>
                  <option value="master">마스터</option>
                </select>
              </Field>
              <Field label="상태">
                <select value={form.active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })} className={select} disabled={isSelf || isLastMaster} data-testid="member-active">
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
              </Field>
            </div>
            {(isSelf || isLastMaster) && (
              <p className="t-sub rounded-(--radius-control) bg-warn-50 px-3 py-2 font-semibold text-warn-700" data-testid="member-guard">
                {isSelf ? '본인 계정은 비활성화하거나 강등할 수 없습니다.' : '마지막 활성 마스터는 비활성화하거나 강등할 수 없습니다. 먼저 다른 마스터를 지정하세요.'}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button onClick={() => setEditing(null)}>취소</Button>
              <Button type="submit" variant="primary" disabled={busy} data-testid="member-save">
                {busy ? '저장 중…' : '저장'}
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  )
}
