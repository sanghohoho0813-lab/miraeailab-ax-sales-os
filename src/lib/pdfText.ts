/**
 * PDF → 줄 단위 텍스트 (브라우저, pdf.js). 원본 파일은 메모리에서만 다루고 어디에도 업로드하지 않는다.
 * pdf.js 는 필요할 때만 동적으로 불러온다 (메인 번들에 들어가지 않는다).
 * OCR 은 하지 않는다 — 텍스트 레이어가 없으면 hasTextLayer=false 로 돌려주고 UI가 직접 등록을 안내한다.
 */
import type { TextDoc, TextPage } from '../engine/docParser/types'
import { sha256Hex } from './hash'

export interface ExtractOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /** 너무 큰 문서는 앞부분만 (기본 60쪽) */
  maxPages?: number
  /** CJK CID 폰트(예: UniKS-UCS2-H)를 읽기 위한 pdf.js cmap 위치. 브라우저는 /pdfjs/cmaps/ (빌드 시 복사), Node 테스트는 node_modules 경로 */
  cMapUrl?: string
  standardFontDataUrl?: string
}

export interface PdfTextResult extends TextDoc {
  hasTextLayer: boolean
  sha256: string
}

/* pdf.js 의 최소 타입 — 실제 모듈은 동적 import */
interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}
interface PdfPageLike {
  getTextContent(): Promise<{ items: (TextItemLike | { type?: string })[] }>
  cleanup?: () => void
}
interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
  destroy?: () => Promise<void>
}
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean; cMapUrl?: string; cMapPacked?: boolean; standardFontDataUrl?: string }): { promise: Promise<PdfDocLike> }
  GlobalWorkerOptions?: { workerSrc: string }
}

/** 글자 조각(items)을 줄로 재구성 — y 가 같은(오차 이내) 조각을 x 순으로 잇는다 */
export function itemsToLines(items: (TextItemLike | { type?: string })[]): string[] {
  const rows: { y: number; parts: { x: number; w: number; h: number; s: string }[] }[] = []
  for (const it of items) {
    if (!('str' in it) || typeof it.str !== 'string') continue
    const s = it.str
    if (!s.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    const h = Math.abs(it.transform[3]) || it.height || 10
    const tol = Math.max(2, h * 0.45)
    let row = rows.find((r) => Math.abs(r.y - y) <= tol)
    if (!row) {
      row = { y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x, w: it.width, h, s })
  }
  rows.sort((a, b) => b.y - a.y)
  const lines: string[] = []
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x)
    let line = ''
    let cursor: number | null = null
    for (const p of r.parts) {
      if (cursor !== null) {
        const gap = p.x - cursor
        if (gap > p.h * 0.25) line += ' '
      }
      line += p.s
      cursor = p.x + p.w
    }
    const cleaned = line.replace(/\s+/g, ' ').trim()
    if (cleaned) lines.push(cleaned)
  }
  return lines
}

/** 핵심 — 주입된 pdf.js 모듈로 읽는다 (브라우저·Node 테스트 공용) */
export async function extractPdfTextWith(pdfjs: PdfJsLike, data: ArrayBuffer, fileName: string, opts: ExtractOptions = {}): Promise<PdfTextResult> {
  const bytes = new Uint8Array(data)
  const sha256 = await sha256Hex(bytes)
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    ...(opts.cMapUrl ? { cMapUrl: opts.cMapUrl, cMapPacked: true } : {}),
    ...(opts.standardFontDataUrl ? { standardFontDataUrl: opts.standardFontDataUrl } : {}),
  }).promise
  const total = Math.min(doc.numPages, opts.maxPages ?? 60)
  const pages: TextPage[] = []
  let textChars = 0
  try {
    for (let n = 1; n <= total; n++) {
      if (opts.signal?.aborted) throw new DOMException('취소됨', 'AbortError')
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const lines = itemsToLines(content.items)
      textChars += lines.reduce((a, l) => a + l.length, 0)
      pages.push({ page: n, lines })
      page.cleanup?.()
      opts.onProgress?.(n, total)
    }
  } finally {
    await doc.destroy?.()
  }
  const hasTextLayer = total > 0 && (textChars / total >= 40 || textChars >= 400)
  return { fileName, pageCount: doc.numPages, pages, textChars, hasTextLayer, sha256 }
}

let pdfjsPromise: Promise<PdfJsLike> | null = null
async function loadPdfJs(): Promise<PdfJsLike> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import('pdfjs-dist')) as unknown as PdfJsLike
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string
      if (mod.GlobalWorkerOptions) mod.GlobalWorkerOptions.workerSrc = worker
      return mod
    })()
  }
  return pdfjsPromise
}

/** 빌드 시 scripts/copy-pdf-assets.mjs 가 node_modules 의 cmaps·standard_fonts 를 public/pdfjs/ 로 복사한다 (외부 CDN 없음) */
const PDF_ASSETS = `${import.meta.env.BASE_URL ?? '/'}pdfjs/`.replace(/\/\//g, '/')

/** 브라우저용 — File → 텍스트 문서 */
export async function extractPdfText(file: File, opts: ExtractOptions = {}): Promise<PdfTextResult> {
  const pdfjs = await loadPdfJs()
  const data = await file.arrayBuffer()
  return extractPdfTextWith(pdfjs, data, file.name, { cMapUrl: `${PDF_ASSETS}cmaps/`, standardFontDataUrl: `${PDF_ASSETS}standard_fonts/`, ...opts })
}
