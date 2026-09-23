/**
 * E2E 픽스처 PDF 생성기 — 익명 데이터만 쓴다. 실제 고객 자료는 Repo 에 넣지 않는다.
 *
 * 기존 sample-company-report.pdf 와 같은 방식(비내장 CJK 폰트 Dotum + UniKS-UTF16-H)으로 만든다.
 * pdf.js 는 우리가 public/pdfjs 에 복사해 둔 cmaps 로 이 문서를 읽는다.
 *
 *   node scripts/make-fixture-pdf.mjs
 */
import { writeFileSync } from 'node:fs'

/**
 * 4대보험 가입자 명부(익명) — 이름·주민번호가 들어 있는 실제 명부 모양을 그대로 흉내 낸다.
 * 파서가 이 개인정보를 읽지도 저장하지도 않는지 검증하기 위한 픽스처다. 모든 값은 가상이다.
 */
const ROSTER = [
  '사업장가입자 명부',
  '',
  '사업장명 : 가상정밀기계',
  '',
  '성명   주민등록번호   자격취득일   자격상실일',
  '홍가상  900101-1234567  2019-03-04',
  '김가상  880505-2345678  2021-07-15',
  '이가상  950212-1456789  2025-02-03',
  '박가상  010909-3567890  2025-06-10',
  '최가상  870303-1678901  2018-11-20  2025-04-30',
  '정가상  930808-2789012  2024-01-08',
  '',
  '국민연금 건강보험 고용보험 산재보험',
]

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

function draw(lines, size, step) {
  let y = 780
  return lines
    .map((line) => {
      const row = line ? `BT /korea ${size} Tf 40 ${y} Td <${hex(line)}> Tj ET\n` : ''
      y -= step
      return row
    })
    .join('')
}

function build(content) {
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
  objects.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

for (const [out, lines, size, step] of [
  ['e2e/fixtures/sparse-company-report.pdf', LINES, 13, 26],
  ['e2e/fixtures/insurance-roster.pdf', ROSTER, 11, 24],
]) {
  const pdf = build(draw(lines, size, step))
  writeFileSync(out, pdf, 'latin1')
  console.log(`${out} — ${pdf.length} bytes, ${lines.filter(Boolean).length} lines`)
}
