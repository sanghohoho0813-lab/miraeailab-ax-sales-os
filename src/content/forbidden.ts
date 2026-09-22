/**
 * 주의 표현 — 절대 하지 말아야 할 말.
 * 각 항목: 왜 위험한지 + 대체 문장. 자유입력·생성 문장에 이 패턴이 보이면 ⚠ 표현 수정 권장.
 */
export interface ForbiddenExpression {
  id: string
  phrase: string
  /** 감지 패턴 (자유입력 검사) */
  patterns: RegExp[]
  why: string
  alternative: string
}

export const FORBIDDEN: ForbiddenExpression[] = [
  {
    id: 'pay_after_fund',
    phrase: '정책자금 나오면 개발비 주시면 됩니다.',
    patterns: [/자금\s*(나오|받|되)\S*\s*(개발비|비용|돈|대금)/, /(개발비|비용|대금)\S*\s*자금\s*(나오|받)/],
    why: '정산이 자금 승인에 걸린 것처럼 들린다. 후불은 정책자금 성공수수료가 아니다. 승인이 안 되면 분쟁이 되고, 컨설팅과 대출 알선을 혼동하게 만든다.',
    alternative: '초기 부담을 낮출 수 있는 정산방식도 있어서, 구축범위가 정해진 뒤 함께 안내드릴 수 있습니다.',
  },
  {
    id: 'deferred_ok',
    phrase: '후불 가능합니다.',
    patterns: [/후불\s*(가능|됩|돼|되)/, /후불로\s*(하|해|드)/],
    why: '미팅 초반에 후불부터 꺼내면 가격이 아니라 "안 내도 되는 것" 으로 이해된다. 구축범위와 가치를 먼저 확인한 뒤 정산방식을 안내해야 한다.',
    alternative: '구축범위가 정해지면 초기 부담을 나누는 정산방식도 함께 설명드리겠습니다.',
  },
  {
    id: 'ax_gets_fund',
    phrase: 'AX 하면 정책자금 받을 수 있습니다.',
    patterns: [/AX\S*\s*(하|만들|구축)\S*\s*(정책)?자금\s*(받|나오|가능)/, /(자금|지원금)\S*\s*(받을 수 있|나옵니다|나와요|보장)/],
    why: '자금은 기관 심사 결과다. AX 는 실제 변화와 증거(Before/After)를 만드는 본체이고, 자금은 그 결과로 따라오는 설명력이다. 인과를 뒤집으면 허위 안내가 된다.',
    alternative: '현장 문제를 시스템으로 바꾸고 실제로 쓰면서 데이터가 쌓이면, 그 변화가 정책금융·R&D·투자를 설명하는 근거가 됩니다.',
  },
  {
    id: 'same_amount',
    phrase: '비슷한 회사가 5억 받았으니 대표님도 가능합니다.',
    patterns: [/(억|천만|만원)\S*\s*받았\S*\s*(대표님|사장님)?\S*\s*(도|역시)?\s*(가능|받)/, /(도|역시)\s*(가능|받으실 수|될 겁)/],
    why: '다른 회사의 승인 금액은 그 회사의 재무·업력·사업내용에 대한 결과다. 같은 금액을 암시하면 기대치를 잘못 만들고, 실제 결과와 어긋나면 신뢰가 무너진다.',
    alternative: '이 업체는 이런 문제를 이렇게 바꿨고, 그 결과로 자금 설명력이 생겼습니다. 대표님 회사는 상황이 다르니 먼저 문제 구조부터 확인하겠습니다.',
  },
  {
    id: 'guaranteed',
    phrase: '무조건 됩니다 / 100% 가능합니다.',
    patterns: [/무조건\s*(됩|돼|가능)/, /100\s*%\s*(가능|됩|보장)/, /확실히\s*(받|됩|가능)/, /보장(합니다|해 드|해드)/],
    why: '승인·선정은 기관이 결정한다. 확정 표현은 컨설턴트 개인과 미래AI랩 모두에 법적·신뢰 위험을 만든다.',
    alternative: '가능성을 높이는 준비 순서는 분명히 있습니다. 결과는 기관 심사에 따라 달라지니 먼저 준비할 것부터 정리하겠습니다.',
  },
  {
    id: 'price_first',
    phrase: '(미팅 초반) 총 얼마 정도 들어요.',
    patterns: [/총\s*\d+\s*(만원|천만|억)\s*(들|입니다|정도)/],
    why: '범위를 모른 채 금액을 먼저 말하면 그 숫자에 갇힌다. 가격은 범위 확인 뒤 미래AI랩 Master 검토를 거쳐 제안한다.',
    alternative: '회사마다 필요한 범위가 많이 다릅니다. 지금 몇 가지만 확인한 뒤 회사에 맞는 구축범위와 정확한 견적을 다시 제안드리겠습니다.',
  },
  {
    id: 'replace_erp',
    phrase: 'ERP 를 저희 걸로 바꾸시면 됩니다.',
    patterns: [/ERP\S*\s*(바꾸|교체|걷어)/],
    why: '기존 시스템을 바꾸자는 제안은 저항만 만든다. AX 는 ERP 밖에서 사람이 반복하는 일을 찾는 것이다.',
    alternative: 'ERP 를 바꾸려는 게 아니라, ERP 밖에서 아직 사람이 반복하고 있는 일을 찾는 겁니다.',
  },
]

export interface GuardHit {
  id: string
  phrase: string
  why: string
  alternative: string
}

/** 자유입력·생성 문장에서 위험 표현을 찾는다 */
export function guardText(text: string): GuardHit[] {
  const t = (text ?? '').replace(/\s+/g, ' ')
  if (!t.trim()) return []
  const hits: GuardHit[] = []
  for (const f of FORBIDDEN) {
    if (f.patterns.some((p) => p.test(t))) hits.push({ id: f.id, phrase: f.phrase, why: f.why, alternative: f.alternative })
  }
  return hits
}
