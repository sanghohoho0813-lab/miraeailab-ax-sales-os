/** 글로벌 헤더 왼쪽에 보이는 라우트 제목 */
const RULES: { test: RegExp; title: string }[] = [
  { test: /^\/$/, title: '홈' },
  { test: /^\/meetings\/[^/]+\/live/, title: 'LIVE MEETING' },
  { test: /^\/meetings\/[^/]+\/result/, title: '미팅 분석' },
  { test: /^\/meetings\/[^/]+\/report/, title: '미팅 리포트' },
  { test: /^\/meetings/, title: '미팅' },
  { test: /^\/companies\/new\/pdf/, title: 'PDF로 1분 준비' },
  { test: /^\/companies\/new\/quick/, title: '30초 빠른 등록' },
  { test: /^\/companies\/new/, title: '미팅 준비' },
  { test: /^\/companies\/[^/]+\/pdf/, title: '기업자료 추가' },
  { test: /^\/companies\/trash/, title: '고객 휴지통' },
  { test: /^\/companies\/[^/]+\/edit/, title: '고객 정보 수정' },
  { test: /^\/companies\/[^/]+\/tools/, title: '기업분석 도구' },
  { test: /^\/companies\/[^/]+/, title: '미팅 전략' },
  { test: /^\/companies/, title: '고객' },
  { test: /^\/handoffs\//, title: '2차 제안 요청' },
  { test: /^\/cases\/[^/]+/, title: '사례 상세' },
  { test: /^\/cases/, title: '실제 사례' },
  { test: /^\/playbook/, title: 'AX 플레이북' },
  { test: /^\/objections/, title: 'AX 플레이북 · 상황별 답변' },
  { test: /^\/forbidden/, title: 'AX 플레이북 · 주의 표현' },
  { test: /^\/more/, title: '더보기' },
  { test: /^\/settings/, title: '설정' },
  { test: /^\/master\/inbox/, title: '2차 제안 요청함' },
  { test: /^\/master\/partners\/[^/]+/, title: '파트너 상세' },
  { test: /^\/master\/partners/, title: '파트너 관리' },
  { test: /^\/master\/audit/, title: '변경 기록' },
  { test: /^\/master\/usage/, title: '사용 데이터' },
]
export function routeTitle(pathname: string): string {
  return RULES.find((r) => r.test.test(pathname))?.title ?? 'AX Partner OS'
}
