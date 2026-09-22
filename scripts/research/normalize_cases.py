# -*- coding: utf-8 -*-
"""Normalize raw_parsed.json -> research_cases.json (CaseStudy shape + research extras) + report.json"""
import json, re, hashlib, collections
D = './out'
raw = json.load(open(f'{D}/raw_parsed.json'))
BLOCKLIST = ['비원미래', '정통대왕쑥뜸원', 'KPJK', '태강지엘텍', '하나인사이트', '선진산업']
EOK = 100_000_000
UPDATED = '2026-09-22T00:00:00.000Z'
SOURCE_DOC = '미래AI랩 AX·플랫폼 자금조달 사례 종합리서치 (2026.09.04)'

def key(name):
    n = name.replace('●', '').strip()
    n = re.sub(r'\(.*?\)', '', n)
    return re.sub(r'\s+', '', n).lower()

def alias(name):
    m = re.search(r'\((.*?)\)', name)
    return m.group(1).strip() if m else ''

NINE_TO_INDUSTRY = {
    '제조·산업자동화·로봇': 'manufacturing', '물류·모빌리티·공급망': 'logistics', '식품·외식·프랜차이즈·농수산': 'food',
    '도매·리테일·커머스·렌털': 'distribution', '숙박·건물·건설·공간': 'construction', '환경·폐기물·에너지': 'environment',
    '의료·헬스·반려동물': 'medical', '교육·전문서비스·B2B SaaS': 'service', '뷰티·패션': 'other', '대형 AI·플랫폼 상단 벤치마크': 'service',
}
CAT17_TO_INDUSTRY = {
    '제조·가공·산업자동화': 'manufacturing', '도매·유통·무역·커머스': 'distribution', '식품제조·외식·프랜차이즈': 'food',
    '화장품·뷰티·퍼스널케어': 'other', '건설·인테리어·시설·공간': 'construction', '물류·운송·창고': 'logistics',
    '자동차·정비·모빌리티': 'logistics', '농업·화훼·스마트팜': 'food', '축산·수산·양식': 'food', '환경·폐기물·자원·에너지': 'environment',
    '패션·섬유·리세일': 'other', '숙박·관광·레저': 'service', '렌털·유지관리·A/S': 'distribution', '교육·학원·훈련': 'service',
    '생활·로컬서비스': 'service', '의료·헬스·반려동물': 'medical', '기타 B2B 소프트웨어': 'service',
}
IND_KW = {
    'manufacturing': ['제조', '로봇', '공장', '설비', '반도체', '소재', '부품', '자동화', '센서', '기계', '드론', '전기모터', '모터'],
    'logistics': ['물류', '배송', '배차', '운송', '창고', '모빌리티', '차량', '정비'],
    'food': ['식품', '농', '외식', '축산', '수산', '양식', '커피', '푸드', '급식', '농산물', '작물', '스마트팜'],
    'distribution': ['유통', '커머스', '리테일', '도매', '무역', '수출', '렌털', '렌탈', '판매자', '소싱'],
    'construction': ['건설', '건축', '인테리어', '시설', '공간', '건물', '부동산', '공실'],
    'environment': ['환경', '폐기물', '재활용', '에너지', '탄소', '태양광', '수처리', '자원순환', '배출'],
    'medical': ['의료', '병원', '헬스', '반려', '환자', '재활', '돌봄', '요양', '바이오', '진단', '치료', '건강'],
    'service': ['교육', '학원', '학생', 'SaaS', '보안', '금융', '세무', '회계', '법률', '인사', '채용', '콘텐츠', '마케팅', '광고', '여행', '숙박', '커뮤니티'],
}

def parse_amount(raw):
    """returns dict(actual, limit, notes, ambiguous, year) amounts in 억 (float)"""
    notes = []; year = None; ambiguous = False
    s = raw.strip()
    m = re.match(r'^(\d{4})\s*년\s*(.*)$', s)
    if m:
        year = m.group(1); s = m.group(2).strip()
    s = s.replace(',', '')
    if not s:
        return dict(actual=None, limit=None, notes=['금액 표기 없음'], ambiguous=True, year=year)
    if '비공개' in s:
        lim = None
        mm = re.search(r'최대\s*(\d+(?:\.\d+)?)\s*억', s)
        if mm: lim = float(mm.group(1))
        return dict(actual=None, limit=lim, notes=['개별 금액 비공개'], ambiguous=False, year=year)
    primary = re.split(r'\s*/\s*', s)[0]
    rest = re.split(r'\s*/\s*', s)[1:]
    if rest: notes.append('추가 표기: ' + ' / '.join(rest))
    comps = re.split(r'\s*\+\s*', primary)
    actual = 0.0; has_actual = False; limit = None
    for c in comps:
        nums = re.findall(r'(\d+(?:\.\d+)?)\s*억', c)
        if not nums:
            continue
        if re.search(r'최대|한도|제도', c):
            v = max(float(x) for x in nums)
            limit = v if limit is None else max(limit, v)
        else:
            v = float(nums[0]); actual += v; has_actual = True
            if len(nums) > 1: notes.append('한 구간에 복수 금액: ' + c); ambiguous = True
    if '→' in s: notes.append('후속 라운드 포함 표기: ' + s); ambiguous = True
    if '누적' in primary: notes.append('누적 금액 기준')
    if re.search(r'약|수준', primary): notes.append('약(근사) 표기')
    if '총' in primary: notes.append('총액 표기')
    if re.search(r'보증|금융지원|특별보증', primary): notes.append('보증·금융지원 한도 성격')
    if len(comps) > 1 and has_actual: notes.append('복수 자금 합산: ' + primary)
    if not has_actual and limit is None:
        ambiguous = True
    return dict(actual=(actual if has_actual else None), limit=limit, notes=notes, ambiguous=ambiguous, year=year)

def classify_funding(form):
    f = form or ''
    classes = []
    if re.search(r'민간|Seed|Pre-A|Series|전략적 투자|투자매칭|VC|시드|엔젤', f): classes.append('private_investment')
    if re.search(r'신보|기보|보증|펭귄|유니콘|BIRD', f): classes.append('guarantee')
    if re.search(r'중진공|융자|대출|청년창업사관학교|창업자금|투융자|성장공유형|RCPS', f): classes.append('policy_loan')
    if re.search(r'TIPS|R&D|정부과제|정부지원|정부사업|스케일업|딥테크|Pre-R&D', f): classes.append('gov_rnd')
    if re.search(r'사업화|바우처|창업패키지|창업중심대학|우수사례', f): classes.append('commercialization')
    if '혼합조달' in f: classes.append('mixed')
    classes = list(dict.fromkeys(classes))
    if not classes: return 'unknown', classes
    if len(classes) == 1: return classes[0], classes
    return 'mixed', classes

def sentences(t):
    parts = re.split(r'(?<=[.。])\s+', t.strip())
    return [p.strip() for p in parts if p.strip()]

def split_narrative(n):
    n = (n or '').strip()
    out = dict(kind='free', problem='', transition='', product='', pivot='', validation='', funding_link='', flow='')
    if not n: out['kind'] = 'none'; return out
    if '제품이 겨냥한 문제' in n:
        out['kind'] = 'template_A'
        m = re.search(r'제품이 겨냥한 문제:\s*(.*?)\s*해결·전환:\s*(.*?)\s*자금\s*연결:\s*(.*)$', n, re.S)
        if m:
            out['problem'] = m.group(1).strip().rstrip('.')
            tr = m.group(2).strip()
            out['funding_link'] = m.group(3).strip()
            mm = re.match(r'(.*?)[를을]\s*만들\s*고,?\s*핵심\s*전환\s*포인트는\s*[‘\'"“]?(.*?)[’\'"”]?\s*[였이]?였?다\.?$', tr)
            if mm:
                out['product'] = mm.group(1).strip(); out['pivot'] = mm.group(2).strip()
                out['transition'] = f"{out['product']} → {out['pivot']}"
            else:
                out['transition'] = tr.rstrip('.')
        else:
            out['kind'] = 'free'
    if out['kind'] == 'free' and '시장 문제' in n:
        out['kind'] = 'template_B'
        m = re.search(r'시장\s*문제:\s*(.*?)\s*해결:\s*(.*?)(?:\s*실증:\s*(.*?))?\s*자금\s*연결:\s*(.*)$', n, re.S) or \
            re.search(r'시장\s*문제:\s*(.*?)\s*해결:\s*(.*?)(?:\s*실증:\s*(.*?))?()$', n, re.S)
        if m:
            out['problem'] = m.group(1).strip().rstrip('.')
            out['transition'] = m.group(2).strip().rstrip('.')
            out['validation'] = (m.group(3) or '').strip().rstrip('.')
            out['funding_link'] = m.group(4).strip()
        else:
            out['kind'] = 'free'
    if out['kind'] == 'free' and '공개자료에서 확인되는 흐름' in n:
        out['kind'] = 'template_C'
        m = re.search(r'공개자료에서\s*확인되는\s*흐름:\s*(.*?)[를을]\s*제품·서비스로\s*사업화했다\.\s*이\s*제품이\s*겨냥한\s*핵심\s*과제는\s*(.*?)다\.\s*(이후.*)$', n, re.S)
        if m:
            out['product'] = m.group(1).strip()
            out['transition'] = f"{out['product']} 제품·서비스화"
            out['problem'] = m.group(2).strip()
            out['funding_link'] = m.group(3).strip()
        else:
            out['kind'] = 'free'
    if out['kind'] == 'free' and n.count('→') >= 2 and len(n) < 400:
        out['kind'] = 'flow'
        segs = [s.strip().rstrip('.') for s in n.split('→')]
        out['problem'] = segs[0]
        out['transition'] = ' → '.join(segs[1:-1]) if len(segs) > 2 else segs[1]
        out['funding_link'] = segs[-1]
        out['flow'] = n
    if out['kind'] == 'free':
        ss = sentences(n)
        if ss:
            out['problem'] = ss[0].rstrip('.')
            out['transition'] = ss[1].rstrip('.') if len(ss) > 1 else ''
            out['funding_link'] = ss[-1] if len(ss) > 1 and re.search(r'억|조달|유치|선정', ss[-1]) else ''
            out['flow'] = n
    return out

def clause_with(texts, pat, maxlen=70):
    for t in texts:
        if not t: continue
        for c in re.split(r'[.。]\s*|\s*→\s*|,\s*| - ', t):
            c = c.strip()
            if c and re.search(pat, c):
                return c[:maxlen]
    return ''

def derive_layers(texts):
    return dict(
        data_layer=clause_with(texts, r'데이터|DB|로그|이력|기록|축적|디지털화|정보|추적'),
        ai_or_automation=clause_with(texts, r'AI|자동화|로봇|예측|추천|분석|에이전트|LLM|비전|알고리즘|무인|자율'),
        customer_surface=clause_with(texts, r'플랫폼|앱|포털|SaaS|커머스|구독|마켓|예약|매칭|서비스형|API'),
    )

AREA_KW = {
    'repetitive_work': r'반복|수작업|수기|엑셀|사람에게 (계속 )?의존|사람이 |입력|정리하|표준화|노코드',
    'info_scatter': r'흩어|분산|한눈에|여러 (사람|시스템)|파편|공유|연결하기 어려|통합',
    'current_system': r'ERP|시스템|SaaS|소프트웨어|클라우드|WMS|TMS|MES|PMS|LMS|CRM|솔루션',
    'customer_mgmt': r'고객|회원|CRM|상담|예약|마케팅|재방문|타깃|팬|사용자',
    'quote_order': r'견적|주문|발주|BOM|수주|계약|소싱|거래',
    'repurchase': r'재구매|구독|재계약|반복 (사용|구매)|리텐션|정기',
    'hiring_burden': r'인력|채용|전문가 부족|전문개발자 부족|숙련|노동|사람 구하|인건비',
    'ceo_dependency': r'경험(으로|에만|에 의존)|감으로|노하우|대표',
    'data_potential': r'데이터|이력|로그|축적|예측|추천|분석',
    'growth_plan': r'확장|글로벌|스케일|신사업|플랫폼|해외',
}
def problem_areas(texts):
    t = ' '.join(x for x in texts if x)
    areas = [a for a, pat in AREA_KW.items() if re.search(pat, t)]
    return areas

def business_model(texts):
    t = ' '.join(x for x in texts if x)
    b2b = len(re.findall(r'기업|B2B|공장|현장|병원|제조|공급|산업|물류|건설|설비|SaaS|솔루션|유통|가맹|사업장|브랜드사|학교|지자체|공공', t))
    b2c = len(re.findall(r'소비자|B2C|개인|회원|사용자|고객군|커뮤니티|학생|반려|여행|팬|가입자|앱', t))
    if b2b and b2c: return 'both'
    if b2c > b2b: return 'b2c'
    return 'b2b'

def ax_path(texts, grade):
    t = ' '.join(x for x in texts if x)
    portal = bool(re.search(r'플랫폼|앱|포털|커머스|마켓|구독|매칭|커뮤니티', t))
    internal = bool(re.search(r'데이터|AI|예측|추천|SaaS|ERP|시스템|분석|관리', t))
    robot = bool(re.search(r'로봇|자동화 설비|무인|드론|디바이스|장비|기기|센서', t))
    if portal and internal: return 'hybrid'
    if portal: return 'customer_portal'
    if internal: return 'internal_ax'
    if robot: return 'simple_automation'
    return 'internal_ax'

def growth_stage(actual):
    if actual is None: return 'early'
    if actual < 5: return 'early'
    if actual < 10: return 'growing'
    return 'scaling'

def band_of(actual):
    if actual is None: return None
    if actual < 5: return '1~4억'
    if actual < 10: return '5~9억'
    if actual < 20: return '10~19억'
    if actual < 50: return '20~49억'
    if actual < 100: return '50~99억'
    return '100억+'

BAND_FRAME = {
    '1~4억': '작은 문제를 실제 시스템·제품으로 바꾸고, 첫 고객·첫 실증·첫 매출 같은 초기 증거가 나타나는 단계입니다.',
    '5~9억': '반복 사용과 데이터가 쌓이고, 자동화에서 AI 추천·예측·플랫폼으로 고도화되는 단계입니다.',
}
FUND_LABEL = {'private_investment': '민간투자', 'guarantee': '보증', 'policy_loan': '정책융자·정책기관', 'gov_rnd': '정부 R&D',
              'commercialization': '사업화지원', 'mixed': '혼합조달', 'unknown': '자금유형 미확인', 'none': '자금조달 없음'}
GRADE_LABEL = {'A': 'AX·플랫폼·데이터 전환형', 'B': '현장 자동화·로봇·디바이스형', 'C': '제품·브랜드 사업화형(AX 확장 여지)'}

def fmt_eok(v):
    if v is None: return None
    return f'{v:g}억'

def talking_points(c, actual, limit, ft, band, year, form, kind):
    pts = []
    if c['problem']:
        pts.append(('문제: ' if kind != 'free' else '상황: ') + c['problem'][:90])
    if c['axTransition']:
        pts.append('전환: ' + c['axTransition'][:100])
    if c['validation']:
        pts.append('실증: ' + c['validation'][:90])
    if actual is not None:
        pts.append(f"조달: {(year + '년 · ') if year else ''}{form or FUND_LABEL[ft]} · {fmt_eok(actual)} (공개자료 기준). 이 회사의 결과이지 우리 고객의 약속이 아닙니다.")
    elif limit is not None:
        pts.append(f"조달: 공개된 것은 제도상 한도({fmt_eok(limit)})뿐이며 실제 수령액은 확인되지 않았습니다.")
    if band in BAND_FRAME:
        pts.append(f"구간: {band} — {BAND_FRAME[band]}")
    elif band:
        pts.append('구간: 10억 이상 — 매출·PoC·공급계약·인증 같은 외부 증거와 확장 구조가 있는 단계라 우리 고객과 규모가 다릅니다. 방향만 참고합니다.')
    return pts

def caveats(ft, actual, limit, notes, kind, is_tips, form):
    cv = []
    if actual is not None and limit is not None:
        cv.append(f"실제 공개금액 {fmt_eok(actual)}과 제도상 한도 {fmt_eok(limit)}은 다른 숫자입니다. 한도를 받은 것처럼 말하지 않습니다.")
    if ft == 'private_investment':
        cv.append("민간투자 사례입니다. 정책자금과 경로가 다르므로 '우리도 이만큼 받는다'식 설명은 금지입니다.")
    if ft in ('guarantee', 'policy_loan', 'mixed'):
        cv.append('보증·정책융자는 상환 의무가 있는 자금입니다. 지원금처럼 설명하지 않습니다.')
    if ft == 'gov_rnd':
        cv.append('정부 R&D·TIPS는 선정 후 과제 수행이 전제이며, 개발비를 정책자금으로 대체하는 구조가 아닙니다.')
    if is_tips:
        cv.append('TIPS 선정 레퍼런스입니다. 실제 수령액이 아니라 제도상 한도만 표기되어 있습니다.')
    if kind in ('free', 'flow'):
        cv.append('요약 서술은 공개 기사·리서치 기반이며 내부 프로세스 상세는 확인되지 않았습니다.')
    for n in notes:
        if n.startswith(('누적', '약', '총', '후속', '복수', '한 구간')):
            cv.append(f'금액 표기 주의: {n}')
    return cv

def cid(*parts):
    return 'rc-' + hashlib.md5('|'.join(parts).encode('utf-8')).hexdigest()[:10]

special_by = {}
for s in raw['special']:
    special_by.setdefault(key(s['name']), s)
policy_by = collections.defaultdict(list)
for e in raw['policy']:
    policy_by[key(e['name'])].append(e)
band_by = {}
for r in raw['band_rows']:
    band_by.setdefault(key(r['name'] or ''), r)

cases = []
seen_main = set()
report = collections.Counter()

def build(name, source_kind, *, industry, sub_industry, nine, cat17, form, source, source_url, year, amount_raw, narrative,
          transition_short, grade, new_verified, one_liner, page, policy_entries=None, is_tips=False, tips_point=''):
    k = key(name)
    if any(b.lower() in k for b in [x.lower().replace(' ', '') for x in BLOCKLIST]):
        report['blocked'] += 1; return None
    am = parse_amount(amount_raw or '')
    year = year or am['year']
    if not year and narrative:
        m = re.search(r'(20\d\d)', narrative)
        if m: year = m.group(1); am['notes'].append('연도는 서술에서 추출')
    ft, classes = classify_funding(form)
    sn = split_narrative(narrative)
    texts = [transition_short, one_liner, sn['problem'], sn['transition'], narrative, tips_point]
    layers = derive_layers([transition_short, one_liner, sn['transition'], sn['validation'], sn['product'], sn['pivot']])
    if not any(layers.values()) and sn['kind'] in ('free', 'flow'):
        layers = derive_layers([narrative])
    areas = problem_areas(texts)
    actual, limit = am['actual'], am['limit']
    band = band_of(actual)
    problem = sn['problem'] or ''
    transition = sn['transition'] or ''
    if not problem and transition_short:
        if '→' in transition_short:
            parts = [p.strip() for p in transition_short.split('→')]
            problem = parts[0]; transition = ' → '.join(parts[1:]) if not transition else transition
        elif ' - ' in transition_short:
            a, b = transition_short.split(' - ', 1); problem = a.strip(); transition = transition or b.strip()
        else:
            transition = transition or transition_short
    if not problem and one_liner:
        if ' - ' in one_liner:
            a, b = one_liner.split(' - ', 1); problem = a.strip(); transition = transition or b.strip()
        else:
            problem = one_liner
    if is_tips and not problem:
        problem = ''
        transition = tips_point
    review_reasons = []
    if not source_url: review_reasons.append('출처 링크 없음')
    if am['ambiguous']: review_reasons.append('금액 해석 모호: ' + (amount_raw or '(없음)'))
    if not year: review_reasons.append('연도 미확인')
    if not (problem or transition): review_reasons.append('문제/전환 서술 없음')
    if is_tips: review_reasons.append('TIPS 선정 레퍼런스(실제 수령액 미공개)')
    if industry is None:
        review_reasons.append('업종 미확정')
        industry = 'other'
    if len(name) > 20 or re.search(r'억|원문|레퍼런스', name): review_reasons.append('기업명 파싱 의심')
    status = 'needs_review' if review_reasons else 'verified'
    pol = policy_entries or []
    policy_narr = [p['narrative'] for p in pol if p['narrative'] and p['narrative'] != narrative]
    policy_forms = list(dict.fromkeys(p['funding_form'] for p in pol if p['funding_form']))
    policy_sections = list(dict.fromkeys(p['section'] for p in pol if p['section']))
    keywords = []
    for t in [nine, cat17, GRADE_LABEL.get(grade or ''), FUND_LABEL[ft], band, '신규 검증' if new_verified else None]:
        if t: keywords.append(t)
    for c in classes:
        if FUND_LABEL[c] not in keywords: keywords.append(FUND_LABEL[c])
    for s in policy_sections: keywords.append(s.split(' - ')[0])
    keywords = list(dict.fromkeys(keywords))
    bm = business_model(texts)
    c = {
        'id': cid(k, str(year), amount_raw or '', source_kind),
        'companyName': name.replace('●', '').strip(),
        'companyAlias': alias(name),
        'industry': industry,
        'subIndustry': cat17 or nine or '',
        'businessModel': bm,
        'problem': problem,
        'beforeProcess': sn['problem'] if sn['kind'] in ('template_A', 'template_B', 'template_C') and problem != sn['problem'] else '',
        'axTransition': transition,
        'internalAx': layers['data_layer'],
        'customerPortal': layers['customer_surface'],
        'aiFunction': layers['ai_or_automation'],
        'validation': sn['validation'],
        'axPath': ax_path(texts, grade),
        'growthStage': growth_stage(actual),
        'talkingPoints': [],
        'caveats': [],
        'fundingType': ft,
        'fundingAmountDisclosed': int(round(actual * EOK)) if actual is not None else None,
        'fundingProgramMax': int(round(limit * EOK)) if limit is not None else None,
        'fundingNote': '; '.join(am['notes']),
        'year': year or '',
        'source': source or '',
        'sourceDate': '2026-09-04',
        'verificationStatus': status,
        'keywords': keywords,
        'problemAreas': areas,
        'updatedAt': UPDATED,
        # research extras (additive)
        'sourceUrl': source_url or '',
        'sourceDocument': SOURCE_DOC,
        'researchPage': page,
        'researchSection': nine or '',
        'researchCategory': cat17 or '',
        'reviewRequired': status != 'verified',
        'reviewReasons': review_reasons,
        'axGrade': grade or '',
        'axGradeLabel': GRADE_LABEL.get(grade or '', ''),
        'newlyVerified': bool(new_verified),
        'amountRaw': amount_raw or '',
        'amountBand': band or '',
        'fundingForm': form or '',
        'fundingClasses': classes,
        'fundingLink': sn['funding_link'],
        'narrative': narrative or '',
        'narrativeKind': sn['kind'],
        'oneLiner': one_liner or transition_short or '',
        'policyNarratives': policy_narr,
        'policyForms': policy_forms,
        'policyPrograms': policy_sections,
        'transitionPath': (special_by.get(k) or {}).get('path', ''),
        'similarityTags': [],
    }
    c['talkingPoints'] = talking_points(c, actual, limit, ft, band, year, form, sn['kind'])
    c['caveats'] = caveats(ft, actual, limit, am['notes'], sn['kind'], is_tips, form)
    tags = [t for t in [nine, cat17, band, FUND_LABEL[ft], {'b2b': 'B2B', 'b2c': 'B2C', 'both': 'B2B·B2C'}[bm],
                        GRADE_LABEL.get(grade or '')] if t]
    tags += [a for a in areas]
    c['similarityTags'] = list(dict.fromkeys(tags))
    return c

# ---- main entries (primary)
for e in raw['main']:
    k = key(e['name'])
    dk = (k, e['year'], e['amount_raw'])
    if dk in seen_main:
        report['dup_main_skipped'] += 1; continue
    seen_main.add(dk)
    sp = special_by.get(k)
    br = band_by.get(k)
    c = build(e['name'], 'main', industry=NINE_TO_INDUSTRY.get(e['section'], 'other'), sub_industry=None, nine=e['section'],
              cat17=sp['category'] if sp else '', form=e['funding_form'], source=e['source'], source_url=e['source_url'],
              year=e['year'], amount_raw=e['amount_raw'], narrative=e['narrative'],
              transition_short=sp['transition'] if sp else '', grade=sp['grade'] if sp else '', new_verified=sp['new_verified'] if sp else False,
              one_liner=br['one_liner'] if br else '', page=e['page'], policy_entries=policy_by.get(k))
    if c: cases.append(c); report['from_main'] += 1

main_keys = set(key(e['name']) for e in raw['main'])
# ---- special-only entries
for s in raw['special']:
    k = key(s['name'])
    if k in main_keys: continue
    pol = policy_by.get(k)
    narrative = pol[0]['narrative'] if pol else ''
    form = pol[0]['funding_form'] if pol else ('민간투자' if re.search(r'^(약\s*)?\d', s['amount_raw']) and not re.search(r'정부|R&D', s['amount_raw']) else '')
    if re.search(r'정부지원|R&D', s['amount_raw']): form = form or '정부지원'
    if 'Seed' in s['amount_raw']: form = 'Seed 민간투자'
    if '전략투자' in s['amount_raw']: form = '전략투자'
    c = build(s['name'], 'special', industry=CAT17_TO_INDUSTRY.get(s['category']), sub_industry=None, nine='',
              cat17=s['category'], form=form, source=(pol[0]['source'] if pol else 'StartupRecipe/보도자료(리서치 인덱스)'),
              source_url=s['source_url'] or (pol[0]['source_url'] if pol else None), year=(pol[0]['year'] if pol and pol[0].get('year') else None),
              amount_raw=s['amount_raw'], narrative=narrative, transition_short=s['transition'], grade=s['grade'],
              new_verified=s['new_verified'], one_liner='', page=s['page'], policy_entries=pol)
    if c:
        if not c['year']:
            # try year from url (startuprecipe m_year=2026)
            m = re.search(r'm_year=(20\d\d)', c['sourceUrl'] or '') or re.search(r'/(20\d\d)[/\d]', c['sourceUrl'] or '') or re.search(r'(20\d\d)', c['sourceUrl'] or '')
            if m:
                c['year'] = m.group(1); c['fundingNote'] = (c['fundingNote'] + '; ' if c['fundingNote'] else '') + '연도는 출처 링크 게시 연도 기준'
                c['reviewReasons'] = [r for r in c['reviewReasons'] if r != '연도 미확인']
                c['reviewRequired'] = bool(c['reviewReasons']); c['verificationStatus'] = 'needs_review' if c['reviewRequired'] else 'verified'
        cases.append(c); report['from_special_only'] += 1

special_keys = set(key(s['name']) for s in raw['special'])
# ---- policy-only entries
def infer_industry(text):
    scores = {ind: sum(text.count(kw) for kw in kws) for ind, kws in IND_KW.items()}
    best = max(scores, key=scores.get)
    ranked = sorted(scores.values(), reverse=True)
    if ranked[0] >= 2 and (len(ranked) < 2 or ranked[0] >= ranked[1] * 2):
        return best, True
    return (best if ranked[0] > 0 else 'other'), False

for e in raw['policy']:
    k = key(e['name'])
    if k in main_keys or k in special_keys: continue
    if any(key(x['companyName']) == k for x in cases): continue
    ind, confident = infer_industry(e['narrative'] + ' ' + e['funding_form'])
    c = build(e['name'], 'policy', industry=(ind if confident else None), sub_industry=None, nine='', cat17='',
              form=e['funding_form'], source=e['source'], source_url=e['source_url'], year=None, amount_raw=e['amount_raw'],
              narrative=e['narrative'], transition_short='', grade='', new_verified=False, one_liner='', page=e['page'],
              policy_entries=[e])
    if c:
        c['policyPrograms'] = [e['section']] if e['section'] else []
        c['keywords'] = list(dict.fromkeys(c['keywords'] + ([e['section'].split(' - ')[0]] if e['section'] else [])))
        if confident:
            c['fundingNote'] = (c['fundingNote'] + '; ' if c['fundingNote'] else '') + '업종은 서술 키워드로 분류'
        cases.append(c); report['from_policy_only'] += 1

# ---- TIPS references
existing = set(key(c['companyName']) for c in cases)
for t in raw['tips_refs']:
    k = key(t['name'])
    if k in existing: report['tips_dup_existing'] += 1; continue
    existing.add(k)
    lim = re.search(r'최대\s*(\d+)억', t['limit_raw'] or '')
    c = build(t['name'], 'tips', industry=CAT17_TO_INDUSTRY.get(t['category']), sub_industry=None, nine='', cat17=t['category'],
              form='TIPS 선정(일반)', source='중기부 TIPS 선정 DB', source_url=t['source_url'], year=t['year'],
              amount_raw=(f"최대 {lim.group(1)}억(제도상)" if lim else ''), narrative='', transition_short='', grade='',
              new_verified=False, one_liner=t['point'], page=t['page'], is_tips=True, tips_point=t['point'])
    if c:
        c['problem'] = ''
        c['axTransition'] = t['point']
        cases.append(c); report['from_tips'] += 1

# ---- final checks
names = [c['companyName'] for c in cases]
for b in BLOCKLIST:
    assert not any(b in n for n in names), b
ids = [c['id'] for c in cases]
assert len(ids) == len(set(ids)), 'dup ids'
report['total'] = len(cases)
report['verified'] = sum(1 for c in cases if c['verificationStatus'] == 'verified')
report['needs_review'] = sum(1 for c in cases if c['verificationStatus'] == 'needs_review')
report['under_10eok_verified'] = sum(1 for c in cases if c['verificationStatus'] == 'verified' and c['fundingAmountDisclosed'] is not None and c['fundingAmountDisclosed'] < 10 * EOK)
report['under_10eok_all'] = sum(1 for c in cases if c['fundingAmountDisclosed'] is not None and c['fundingAmountDisclosed'] < 10 * EOK)
report['with_url'] = sum(1 for c in cases if c['sourceUrl'])
report['newly_verified'] = sum(1 for c in cases if c['newlyVerified'])
report['by_industry'] = dict(collections.Counter(c['industry'] for c in cases))
report['by_funding'] = dict(collections.Counter(c['fundingType'] for c in cases))
report['by_band'] = dict(collections.Counter(c['amountBand'] or 'n/a' for c in cases))
report['by_kind'] = dict(collections.Counter(c['narrativeKind'] for c in cases))
report['review_reasons'] = dict(collections.Counter(r.split(':')[0] for c in cases for r in c['reviewReasons']))
SLIM_DROP = ['talkingPoints', 'caveats', 'sourceDocument', 'updatedAt', 'transitionPath', 'axGradeLabel', 'similarityTags']
slim = [{k: v for k, v in c.items() if k not in SLIM_DROP} for c in cases]
json.dump(slim, open(f'{D}/research_cases.json', 'w'), ensure_ascii=False, indent=0)
json.dump(cases, open(f'{D}/research_cases_full.json', 'w'), ensure_ascii=False, indent=1)
json.dump(report, open(f'{D}/report.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False, indent=1))
