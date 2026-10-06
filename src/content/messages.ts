/**
 * 대표님께 보내는 문자 — 문구 원본.
 *
 * 원칙 (콘텐츠 원칙과 같다)
 *   - 과장·약속 없음. 금액·승인·선정 이야기는 문자로 하지 않는다 (주의 표현 검사기를 통과해야 한다)
 *   - 짧게. 한 문자에 한 가지 부탁만
 *   - 개인정보를 요청할 때는 가리는 방법을 먼저 말한다
 *   - 문자는 저장하지 않는다. 보내는 것은 컨설턴트 휴대폰의 문자 앱이다
 */
import type { DocKey } from './documents'

export type MessageKind = 'schedule' | 'confirm' | 'reschedule' | 'thanks' | 'documents' | 'proposal' | 'followup'

export const MESSAGE_LABEL: Record<MessageKind, string> = {
  schedule: '미팅 요청',
  confirm: '미팅 확인',
  reschedule: '일정 다시 잡기',
  thanks: '감사 인사',
  documents: '서류 요청',
  proposal: '2차 미팅 제안',
  followup: '안부 · 재연락',
}

/**
 * 고객에게 받는 서류 — 어디서 떼는지까지 한 줄로.
 * 기업정보 보고서(크레탑)는 컨설턴트가 직접 조회하는 서류라 요청하지 않는다.
 */
export const CLIENT_DOC_ORDER: DocKey[] = ['business_license', 'insurance_roster', 'financial_statement', 'corporate_register']
export const CLIENT_DOC_REQUEST: Partial<Record<DocKey, string>> = {
  business_license: '사업자등록증 — 홈택스에서 사업자등록증명으로 발급할 수 있습니다',
  insurance_roster: '4대보험 가입자 명부 — 고용지원금 검토에 씁니다. 주민등록번호 뒷자리는 가리고 보내 주세요',
  financial_statement: '최근 재무제표 — 홈택스 표준재무제표증명으로 발급할 수 있습니다',
  corporate_register: '법인등기부등본 (법인인 경우) — 대법원 인터넷등기소에서 발급할 수 있습니다',
}
