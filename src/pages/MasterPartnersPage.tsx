/** MASTER — 파트너 등록·활성화. 파트너 계정은 miraeailab.com 에서 먼저 가입돼 있어야 한다. */
import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '../lib/auth'
import type { PartnerMember } from '../types/domain'
import { Badge, Button, Field, PageTitle, Section, Spinner, TextInput, useToast } from '../components/ui'
import { formatDate } from '../lib/util'

export default function MasterPartnersPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [members, setMembers] = useState<PartnerMember[] | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'partner' | 'master'>('partner')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = '파트너 관리 · AX 미팅 가이드'
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
  async function toggle(m: PartnerMember) {
    await repo.setMemberActive(user, m.profileId, !m.active)
    setMembers((cur) => (cur ?? []).map((x) => (x.profileId === m.profileId ? { ...x, active: !m.active } : x)))
  }

  return (
    <div className="space-y-4">
      <PageTitle title="파트너 관리" sub="파트너는 본인 업체와 미팅만 봅니다. 운영 OS 전체 정보와 내부 가격 전략은 보이지 않습니다." />
      <Section title="파트너 등록" sub="miraeailab.com 에 가입한 이메일이어야 합니다.">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="이메일">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="표시 이름">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 곽주환" required />
          </Field>
          <Field label="역할">
            <select value={role} onChange={(e) => setRole(e.target.value as 'partner' | 'master')} className="w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1.05rem]">
              <option value="partner">파트너</option>
              <option value="master">마스터</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            등록
          </Button>
        </form>
      </Section>
      <Section title="등록된 파트너">
        {!members ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.profileId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block font-bold">
                    {m.displayName} <Badge tone={m.role === 'master' ? 'dark' : 'accent'}>{m.role === 'master' ? '마스터' : '파트너'}</Badge> {!m.active && <Badge tone="danger">비활성</Badge>}
                  </span>
                  <span className="t-sub text-ink-500">
                    {m.email} · {formatDate(m.createdAt)}
                  </span>
                </span>
                {m.profileId !== user.id && (
                  <Button size="sm" onClick={() => void toggle(m)}>
                    {m.active ? '비활성화' : '활성화'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
