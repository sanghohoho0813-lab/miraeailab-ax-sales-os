/**
 * E2E 픽스처 PDF 생성기 — 익명 데이터만 쓴다. 실제 고객 자료는 Repo 에 넣지 않는다.
 *
 * 기존 sample-company-report.pdf 와 같은 방식(비내장 CJK 폰트 Dotum + UniKS-UTF16-H)으로 만든다.
 * pdf.js 는 우리가 public/pdfjs 에 복사해 둔 cmaps 로 이 문서를 읽는다.
 *
 *   node scripts/make-fixture-pdf.mjs
 */
import { writeFileSync } from 'node:fs'

/** 업종·직원수·거래형태가 없는 보고서 — "PDF가 다 알려주지 않는" 현실을 재현한다 */
const LINES = [
  '기업정보 보고서',
  '',
  '회사명 : 가상데이터랩',
  '대표자 : 박가상',
  '설립일 : 2016-04-11',
  '전화번호 : 02-0000-0000',
  '',
  '※ 공개 정보만 수록한 요약본입니다.',
  '   분류 코드와 종업원 현황은 확인되지 않았습니다.',
]

const hex = (s) => [...s].map((ch) => ch.codePointAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()

let y = 780
const content =
  LINES.map((line) => {
    const row = line ? `BT /korea 13 Tf 56 ${y} Td <${hex(line)}> Tj ET\n` : ''
    y -= 26
    return row
  }).join('') || ''

const objects = [
  '<</Type/Catalog/Pages 2 0 R>>',
  '<</Type/Pages/Count 1/Kids[4 0 R]>>',
  '<</Font<</korea 5 0 R>>>>',
  '<</Type/Page/MediaBox[0 0 595 842]/Rotate 0/Resources 3 0 R/Parent 2 0 R/Contents 8 0 R>>',
  '<</Type/Font/Subtype/Type0/BaseFont/Dotum/Encoding/UniKS-UTF16-H/DescendantFonts[6 0 R]>>',
  '<</Type/Font/Subtype/CIDFontType0/BaseFont/Dotum/CIDSystemInfo<</Registry(Adobe)/Ordering(Korea1)/Supplement 2>>/FontDescriptor 7 0 R/DW 1000>>',
  '<</Type/FontDescriptor/FontName(Dotum)/FontBBox[-200 -200 1200 1200]/Flags 4/ItalicAngle 0/Ascent 1000/Descent -200/StemV 80>>',
  `<</Length ${content.length}>>\nstream\n${content}endstream`,
]

let pdf = '%PDF-1.7\n'
const offsets = [0]
objects.forEach((body, i) => {
  offsets.push(pdf.length)
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
})
const xref = pdf.length
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`

const out = 'e2e/fixtures/sparse-company-report.pdf'
writeFileSync(out, pdf, 'latin1')
console.log(`${out} — ${pdf.length} bytes, ${LINES.filter(Boolean).length} lines`)
