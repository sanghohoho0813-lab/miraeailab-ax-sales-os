/**
 * 대표님께 문자 — 지금 단계에 맞는 문자를 골라, 필요하면 고치고, 휴대폰 문자 앱으로 보내거나 복사한다.
 *
 * - 문구는 앱이 가진 사실(대표 이름 · 일정 · 미팅에서 나온 문제 · 안 받은 서류)로 미리 채운다 (engine/messages)
 * - 고친 문장도 주의 표현 검사기를 거친다 — "무조건 됩니다" 같은 말이 들어가면 바로 알려 준다
 * - 폰에서는 [문자 앱으로 보내기]가 먼저, PC 에서는 [복사]가 먼저 (카카오톡 PC 에 붙여 넣는 경우가 많다)
 * - 문자는 저장하지 않는다
 */
import { useState } from 'react'
import { Copy, MessageSquareText } from 'lucide-react'
import { Button, Sheet, TextArea, useToast } from './ui'
import { draftMessage, messageKinds, smsHref, type MessageContext } from '../engine/messages'
import { MESSAGE_LABEL, type MessageKind } from '../content/messages'
import { guardText } from '../content/forbidden'

const ALL_KINDS = Object.keys(MESSAGE_LABEL) as MessageKind[]

function isPhone(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function MessageSheet({ open, onClose, ctx, initialKind }: { open: boolean; onClose: () => void; ctx: MessageContext; initialKind?: MessageKind }) {
  // 시트를 열 때마다 새로 — 지난번에 고치던 문장이 남지 않게
  return (
    <Sheet open={open} onClose={onClose} title={`${ctx.company.name} · 대표님께 문자`} testId="message-sheet">
      <MessageForm ctx={ctx} initialKind={initialKind} />
    </Sheet>
  )
}

function MessageForm({ ctx, initialKind }: { ctx: MessageContext; initialKind?: MessageKind }) {
  const toast = useToast()
  const recommended = messageKinds(ctx)
  const first = initialKind ?? recommended[0]
  const [kind, setKind] = useState<MessageKind>(first)
  const [text, setText] = useState(() => draftMessage(first, ctx))
  const [more, setMore] = useState(!recommended.includes(first))
  const kinds = more ? [...recommended, ...ALL_KINDS.filter((k) => !recommended.includes(k))] : recommended
  const hits = guardText(text)
  const href = smsHref(ctx.company.phone, text)
  const phoneFirst = isPhone() && Boolean(href)

  function pick(k: MessageKind) {
    setKind(k)
    setText(draftMessage(k, ctx))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.show('복사했습니다. 카카오톡이나 문자에 붙여 넣으세요.', 'ok')
    } catch {
      // 클립보드 권한이 없으면 본문을 선택해 둔다 — 길게 눌러 복사할 수 있게
      const el = document.querySelector<HTMLTextAreaElement>('[data-testid="message-text"]')
      el?.focus()
      el?.select()
      toast.show('복사 권한이 없어 문장을 선택해 두었습니다. 길게 눌러 복사하세요.', 'neutral')
    }
  }

  return (
    <>
      <div role="radiogroup" aria-label="문자 종류" className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => pick(k)}
            className={`tap inline-flex h-11 items-center rounded-full border-2 px-4 text-[0.98rem] font-bold ${kind === k ? 'border-accent-600 bg-accent-50 text-ink-900' : 'border-line bg-white text-ink-700 hover:border-accent-200'}`}
            data-testid={`message-kind-${k}`}
          >
            {MESSAGE_LABEL[k]}
          </button>
        ))}
        {!more && (
          <button type="button" onClick={() => setMore(true)} className="tap t-sub px-2 font-semibold text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline" data-testid="message-more">
            다른 문자
          </button>
        )}
      </div>

      <TextArea value={text} onChange={(e) => setText(e.target.value)} className="mt-4 min-h-56 text-[1rem]" aria-label="문자 내용" data-testid="message-text" />

      {hits.length > 0 && (
        <div className="t-sub mt-3 rounded-(--radius-control) bg-warn-50 px-4 py-3 text-warn-700" role="alert" data-testid="message-guard">
          <p className="font-bold">표현 수정 권장 — {hits[0].phrase}</p>
          <p className="mt-1 text-ink-700">이렇게 바꿔 보세요: {hits[0].alternative}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {href && (
          <a
            href={href}
            className={`btn inline-flex h-14 w-full items-center justify-center gap-2 rounded-(--radius-control) border px-6 text-[1.1rem] font-semibold sm:w-auto sm:min-w-[220px] ${phoneFirst ? 'border-accent-600 bg-accent-600 text-white hover:bg-accent-700' : 'border-line-strong bg-white text-ink-900 hover:bg-paper-2'} ${phoneFirst ? '' : 'order-2'}`}
            data-testid="message-sms"
          >
            <MessageSquareText aria-hidden="true" className="size-5" /> 문자 앱으로 보내기
          </a>
        )}
        <Button variant={phoneFirst ? 'secondary' : 'primary'} size="lg" className={`w-full sm:w-auto sm:min-w-[160px] ${phoneFirst ? 'order-2' : ''}`} onClick={() => void copy()} data-testid="message-copy">
          <Copy aria-hidden="true" className="size-5" /> 복사
        </Button>
      </div>
      {!href && <p className="t-sub mt-3 text-ink-500">연락처를 넣으면 문자 앱으로 바로 보낼 수 있습니다 — [정보 수정]에서 넣을 수 있습니다.</p>}
    </>
  )
}
