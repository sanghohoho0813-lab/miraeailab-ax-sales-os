// pdf.js 가 CJK CID 폰트(크레탑·국내 보고서에 흔함)를 읽으려면 cmaps 가 필요하다.
// 외부 CDN 을 쓰지 않고 node_modules 의 파일을 public/pdfjs/ 로 복사한다 (dev·build 전에 실행, 산출물은 git 에 넣지 않는다).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dst = join(root, 'public', 'pdfjs')
if (!existsSync(src)) {
  console.warn('[copy-pdf-assets] pdfjs-dist 가 설치되지 않았습니다 — npm install 먼저')
  process.exit(0)
}
mkdirSync(dst, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(src, dir), join(dst, dir), { recursive: true })
}
console.log('[copy-pdf-assets] public/pdfjs/{cmaps,standard_fonts} 준비 완료')
