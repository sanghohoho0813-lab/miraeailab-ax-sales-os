/**
 * 문서 어댑터 — 종류 감지 + 라벨 별칭.
 *   generic : 한국 기업정보 보고서·회사소개서 공통 규칙
 *   cretop  : 크레탑(NICE평가정보 기업정보) — 실제 샘플이 아직 제공되지 않아 감지 + 별칭만 분리해 두었다.
 *             샘플이 들어오면 이 어댑터의 aliases 만 보강한다 (문서에 없는 항목을 상상해서 만들지 않는다).
 */
import type { DocAdapter, TextDoc } from './types'

function joined(doc: TextDoc): string {
  return doc.pages.map((p) => p.lines.join('\n')).join('\n')
}

export const genericAdapter: DocAdapter = {
  id: 'generic',
  version: '1.0',
  docKind: '기업정보 보고서',
  detect: (doc) => (/(회사소개|Company\s*Profile|회사 소개서)/i.test(joined(doc)) ? 0.6 : 0.3),
}

export const cretopAdapter: DocAdapter = {
  id: 'cretop',
  version: '0.1-unverified',
  docKind: '크레탑 기업정보',
  detect: (doc) => (/(CRETOP|크레탑|NICE\s*평가정보|나이스평가정보|NICE\s*D&B|KED|한국기업데이터)/i.test(joined(doc)) ? 0.9 : 0),
  aliases: {
    companyName: [/^(?:기업체명|기업명\(상호\))\s*[:：]?\s*(.+)$/],
    headcount: [/^(?:종업원수\(명\)|종업원\s*\(명\))\s*[:：]?\s*([\d,]+)/],
    foundedAt: [/^(?:설립일자|법인등록일|개업연월일)\s*[:：]?\s*(\d{4})[.\-년/\s]*(\d{1,2})?[.\-월/\s]*(\d{1,2})?/],
  },
}

export const ADAPTERS: DocAdapter[] = [cretopAdapter, genericAdapter]

export function pickAdapter(doc: TextDoc): DocAdapter {
  let best = genericAdapter
  let score = -1
  for (const a of ADAPTERS) {
    const s = a.detect(doc)
    if (s > score) {
      score = s
      best = a
    }
  }
  return best
}

export function docKindOf(doc: TextDoc, adapter: DocAdapter): string {
  if (adapter.id === 'cretop') return adapter.docKind
  const t = joined(doc)
  if (/(회사소개|Company\s*Profile|회사 소개서)/i.test(t)) return '회사소개서'
  if (/(신용정보|신용평가|기업신용)/.test(t)) return '기업 신용정보'
  return adapter.docKind
}
