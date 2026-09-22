# -*- coding: utf-8 -*-
"""Parse 미래AI랩 AX 자금조달 종합리서치 PDF (20260904) into structured research cases.
Sources: special index (p11-26), TIPS references (p12-30), policy section (p32-46),
amount-band index (p47-62), full research (p63-99). Output: research_cases.json + parse_report.json
"""
import re, json, sys, collections
import fitz

PDF = './research.pdf'
OUT_DIR = './out'

doc = fitz.open(PDF)
pages = {}
anchor_pos = collections.defaultdict(list)   # page -> [(y, text)] for 원문 보기 / 선정 DB lines in reading order
links = collections.defaultdict(list)
for i, page in enumerate(doc):
    pno = i + 1
    text = page.get_text('text')
    pages[pno] = [ln.rstrip('\n') for ln in text.split('\n')]
    d = page.get_text('dict')
    for b in d['blocks']:
        for ln in b.get('lines', []):
            t = ''.join(s['text'] for s in ln['spans'])
            if '원문 보기' in t or '선정 DB' in t or t.strip() == '원문':
                anchor_pos[pno].append(((ln['bbox'][1] + ln['bbox'][3]) / 2, t))
    for l in page.get_links():
        if l.get('uri'):
            r = l['from']
            links[pno].append({'uri': l['uri'], 'y': (r.y0 + r.y1) / 2, 'x': r.x0})

def match_url(pno, k):
    """k-th anchor (원문 보기/선정 DB) on page in reading order -> url via nearest y."""
    anchors = anchor_pos.get(pno, [])
    if k >= len(anchors):
        return None
    y = anchors[k][0]
    best, bd = None, 1e9
    for l in links.get(pno, []):
        dd = abs(l['y'] - y)
        if dd < bd:
            best, bd = l, dd
    if best and bd <= 14:
        return best['uri']
    return None

BLOCKLIST = ['비원미래', '정통대왕쑥뜸원', 'KPJK', '태강지엘텍', '하나인사이트', '선진산업']

NOISE = {
    'AX · 플랫폼 자금조달 사례 종합리서치', '기업 · 자금형태 · 출처', '기업 · 자금형태 · 원문', '금액',
    '시장 문제 → 해결·전환 → 실증 → 조달 과정', '과정 요약', '기업', 'AX', '변화·전환 포인트', '출처',
    '연도', '전환 포인트', '표시 원칙', '업종', '무엇을 만들었나', '기업 · 업종', '무엇을 만든 회사인가',
}
def is_noise(s):
    t = s.strip()
    if not t: return True
    if t in NOISE: return True
    if re.fullmatch(r'[\d ]{1,12}', t): return True          # page numbers / footers like '6 28'
    if re.fullmatch(r'\d+ 건  \|.*', t): return True
    return False

YEAR_RE = re.compile(r'^(\d{4})(?:\s*[~–-]\s*(\d{4}))?\s*년$')
FUND_RE = re.compile(r'(투자|보증|펭귄|기보|신보|중진공|TIPS|팁스|R&D|정부|지원|Seed|Pre-A|Series|시드|프리|혼합|조달|대출|융자|사업|참$|^여\)$|IBK|산은|기업은행|선정|과제|바우처|크라우드|펀딩|엔젤|액셀|\bAC\b|VC|CVC|유치|금융|보조|출연|창업|사관학교|스케일업|딥테크|우수|공모|BIRD|유니콘|성장|융합|모태|산업부|중기부|과기부|농식품|해수부|국토부|환경부|복지부|지자체|시리즈|라운드|브릿지|후속)')

def looks_narrative(s):
    t = s.strip()
    return len(t) >= 24 or t.endswith('.') or '문제:' in t or '흐름:' in t

# ---------- 1. main research (p63-99) & policy (p32-46) ----------
def parse_entries(page_from, page_to, mode):
    """mode 'main' (with year line) / 'policy' (no year line). Returns list of entries."""
    stream = []   # (page, line)
    section = None
    sections = {}  # idx -> section
    started = (mode == 'policy')
    for p in range(page_from, page_to + 1):
        lines = pages[p]
        i = 0
        while i < len(lines):
            t = lines[i].strip()
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ''
            if mode == 'main' and re.fullmatch(r'\d+ 건  \|.*', nxt):
                section = t; started = True; i += 2; continue
            if mode == 'policy':
                m = re.fullmatch(r'(.+?)\s*\((\d+) 건\)', t)
                if m and not re.search(r'억', t):
                    section = m.group(1).strip(); i += 1; continue
            if not started or is_noise(t):
                i += 1; continue
            stream.append((p, lines[i].rstrip('\n').lstrip(), section))
            i += 1
    # policy: drop the intro before first "기업 · 자금형태 · 원문" header? we already dropped headers; intro lines are narrative-ish; first entry starts at first 원문 line block
    stream = [(a, b, c) for (a, b, c) in stream]
    anchors = [k for k, (_, t, _) in enumerate(stream) if t.strip().startswith('원문 보기')]
    entries = []
    counters = collections.Counter()
    for ai, k in enumerate(anchors):
        p, t, sec = stream[k]; t = t.strip()
        src = t.replace('원문 보기', '').replace('↗', '').strip()
        # header block backwards
        j = k - 1
        block = []
        while j >= 0 and len(block) < 5:
            s = stream[j][1].strip()
            if s.startswith('원문 보기') or looks_narrative(s):
                break
            if stream[j][0] != p and stream[j][0] != p - 1:
                break
            block.insert(0, s); j -= 1
        block_start = j + 1
        # split funding / name
        fund = []
        nm = list(block)
        def is_fundish(idx):
            s = nm[idx]
            if FUND_RE.search(s):
                return True
            # short wrapped remainder of a funding line ("보 참여)", "여)")
            return len(s) <= 7 and idx > 0 and FUND_RE.search(nm[idx - 1]) is not None and (s.endswith(')') or len(s) <= 3)
        while len(nm) > 1 and is_fundish(len(nm) - 1):
            fund.insert(0, nm.pop())
        # paren balancing: a wrapped company name like '알앤알컴퍼니(공실의모' + '든것 공모)'
        while fund and ''.join(nm).count('(') > ''.join(nm).count(')') and ')' in fund[0]:
            nm.append(fund.pop(0))
        name = ''.join(nm).strip()
        funding_form = ''.join(fund).strip()
        # forward: source continuation, year, amount, narrative
        m = k + 1
        year = None
        while m < len(stream) and not YEAR_RE.match(stream[m][1].strip()) and mode == 'main':
            s = stream[m][1].strip()
            if looks_narrative(s) or re.match(r'^[\d약총누최]', s) or s.startswith('원문'):
                break
            src += ' ' + s; m += 1
        if mode == 'main' and m < len(stream) and YEAR_RE.match(stream[m][1].strip()):
            year = stream[m][1].replace(' 년', '').replace('년', '').strip(); m += 1
        amount_lines = []
        while m < len(stream) and not looks_narrative(stream[m][1].strip()) and not stream[m][1].strip().startswith('원문'):
            amount_lines.append(stream[m][1].strip()); m += 1
        # narrative until next entry's block start
        nxt_block_start = None
        if ai + 1 < len(anchors):
            k2 = anchors[ai + 1]
            j2 = k2 - 1; cnt = 0
            while j2 >= 0 and cnt < 5:
                s = stream[j2][1].strip()
                if s.startswith('원문 보기') or looks_narrative(s):
                    break
                j2 -= 1; cnt += 1
            nxt_block_start = j2 + 1
        else:
            nxt_block_start = len(stream)
        narrative_lines = [stream[x][1] for x in range(m, nxt_block_start)]
        narrative = ''.join(l if l.endswith(' ') else l for l in narrative_lines)
        narrative = re.sub(r'\s+', ' ', ' '.join(narrative_lines)).strip()
        # PDF wraps mid-word: join lines without spaces when line breaks inside a word (Korean); keep spaces that exist
        narrative = join_wrapped(narrative_lines)
        amount_raw = join_wrapped(amount_lines)
        # anchor url
        k_on_page = sum(1 for x in anchors[:ai] if stream[x][0] == p)
        url = match_url(p, k_on_page)
        entries.append({
            'page': p, 'section': sec, 'name': name, 'funding_form': funding_form, 'source': src.strip(),
            'source_url': url, 'year': year, 'amount_raw': amount_raw, 'narrative': narrative, 'mode': mode,
            'name_lines': len(nm), 'fund_lines': len(fund),
        })
    return entries

def join_wrapped(lines):
    out = ''
    for l in lines:
        l = l.rstrip('\n')
        if not out:
            out = l; continue
        if out.endswith(' ') or l.startswith(' '):
            out = out.rstrip(' ') + ' ' + l.lstrip(' ')
        else:
            # mid-word wrap (Korean) -> no space; but if previous ends with punctuation add space
            if out[-1] in '.,:;)?!’”' or out[-1].isdigit() and not l[0].isdigit() and l[0] != '억':
                out += ' ' + l
            else:
                out += l
    return re.sub(r'[ ]{2,}', ' ', out).strip()

main_entries = parse_entries(63, 99, 'main')
policy_entries = parse_entries(32, 46, 'policy')

# ---------- 2. special index p11-26 ----------
AMT_IN_NAME = re.compile(r'^(?P<name>.*?)(?P<amount>(?:R&D\s*|Seed\s*|정부지원\s*|약\s*|총\s*|누적\s*)?\d[\d.,]*\s*억.*)$')
special = []
tips_refs = []
TIPS_HDR = ('추가 TIPS/지원 선정 레퍼런스', '추가 선정 레퍼런스')
for p in range(11, 27):
    lines = [l.strip() for l in pages[p]]
    cat = None; path = ''
    in_tips = False
    row_anchor_index = 0
    last_end = 0
    i = 0
    while i < len(lines):
        t = lines[i]
        if t.startswith('AX/SW 전환 경로'):
            path = t.replace('AX/SW 전환 경로', '').strip()
            # category = previous meaningful line
            k = i - 1
            while k >= 0 and (not lines[k] or lines[k] == '업종별 10억 미만'):
                k -= 1
            if k >= 0:
                cat = re.sub(r'\s*\(\d/\d\)\s*$', '', lines[k]).strip()
            in_tips = False
            i += 1; continue
        if t == '출처':
            last_end = i + 1; i += 1; continue
        if t.startswith(TIPS_HDR):
            in_tips = True; last_end = i + 1; i += 1; continue
        if t == '여기서 꼭 볼 것':
            break
        if not in_tips and t in ('A', 'B', 'C'):
            grade = t
            name_amt = [x for x in lines[last_end:i] if x and x not in NOISE and not re.fullmatch(r'[\d ]{1,12}', x)]
            new_verified = any(x.startswith('●') for x in name_amt)
            joined = ''.join(x.replace('●', '').strip() for x in name_amt)
            mm = AMT_IN_NAME.match(joined)
            if mm:
                name, amount = mm.group('name').strip(), mm.group('amount').strip()
            else:
                name, amount = joined, ''
            j = i + 1; trans = []
            while j < len(lines) and not lines[j].startswith('원문 보기'):
                trans.append(lines[j]); j += 1
            tr = join_wrapped(trans)
            if tr.endswith('원문 보기 ↗'):
                tr = tr[:-len('원문 보기 ↗')].strip()
            url = match_url(p, row_anchor_index); row_anchor_index += 1
            special.append({'page': p, 'category': cat, 'path': path, 'name': name, 'amount_raw': amount,
                            'grade': grade, 'transition': tr, 'new_verified': new_verified, 'source_url': url})
            last_end = j + 1; i = j + 1; continue
        if in_tips and re.fullmatch(r'\d{4}', t):
            nm = [x for x in lines[last_end:i] if x and x not in NOISE and not x.startswith(TIPS_HDR)]
            name = ''.join(nm).strip()
            j = i + 1; pt = []
            while j < len(lines) and not lines[j].startswith('일반 TIPS') and not lines[j].startswith('선정 DB') and not re.search(r'최대 \d', lines[j]):
                pt.append(lines[j]); j += 1
            limit = []
            while j < len(lines) and not lines[j].startswith('선정 DB'):
                limit.append(lines[j]); j += 1
            url = match_url(p, row_anchor_index); row_anchor_index += 1
            tips_refs.append({'page': p, 'category': cat, 'name': name, 'year': t, 'point': join_wrapped(pt),
                              'limit_raw': join_wrapped(limit), 'source_url': url})
            last_end = j + 1; i = j + 1; continue
        i += 1

# ---------- 2b. supplement TIPS pages 27-30 ----------
for p in range(27, 31):
    lines = [l.strip() for l in pages[p]]
    # rows: name / 업종 / 무엇을 / 표시원칙(1-2 lines) / 선정 DB ↗
    i = 0; row_anchor_index = 0; last_end = 0
    for k, t in enumerate(lines):
        if t == '출처':
            last_end = k + 1; break
    year = '2024' if p == 27 else ('2025' if p in (28, 29) else '2026')
    m = re.search(r'(\d{4}) TIPS', '\n'.join(lines[:6]))
    if m: year = m.group(1)
    while i < len(lines):
        if lines[i].startswith('선정 DB'):
            seg = [x for x in lines[last_end:i] if x and x not in NOISE and not re.fullmatch(r'\d{1,4}', x)]
            # find limit lines (contain 최대 / 제도상)
            limit = [x for x in seg if '최대' in x or '제도상' in x]
            rest = [x for x in seg if x not in limit]
            if len(rest) >= 3:
                name, cat, point = rest[0], rest[1], join_wrapped(rest[2:])
            elif len(rest) == 2:
                name, cat, point = rest[0], rest[1], ''
            else:
                name, cat, point = join_wrapped(rest), '', ''
            url = match_url(p, row_anchor_index); row_anchor_index += 1
            tips_refs.append({'page': p, 'category': cat, 'name': name, 'year': year, 'point': point,
                              'limit_raw': join_wrapped(limit), 'source_url': url})
            last_end = i + 1
        i += 1

# ---------- 3. amount-band index p47-62 ----------
NINE = ['제조·산업자동화·로봇', '물류·모빌리티·공급망', '식품·외식·프랜차이즈·농수산', '도매·리테일·커머스·렌털',
        '숙박·건물·건설·공간', '환경·폐기물·에너지', '의료·헬스·반려동물', '교육·전문서비스·B2B SaaS', '뷰티·패션',
        '대형 AI·플랫폼 상단 벤치마크']
known_names = set(e['name'] for e in main_entries) | set(s['name'] for s in special) | set(e['name'] for e in policy_entries)
band_rows = []
band = None
for p in range(47, 63):
    lines = [l.strip() for l in pages[p]]
    idxs = [i for i, t in enumerate(lines) if t in NINE]
    for n, i in enumerate(idxs):
        # band header detection: lines like '1~4' ' ' '억(47 건)' or '5~9 억(46 건)'
        pre = ' '.join(lines[max(0, i - 6):i])
        mb = re.search(r'(\d+\s*~\s*\d+|\d+)\s*억\s*(?:이상)?\s*\(\d+ 건\)', ' '.join(lines[:i]))
        seg_start = idxs[n - 1] + 1 if n > 0 else 0
        seg = [x for x in lines[seg_start:i] if x and x not in NOISE and not re.fullmatch(r'\d{1,4}', x)]
        # name = trailing lines that form a known name (try 1..3 lines)
        name = None
        for L in (1, 2, 3):
            if len(seg) >= L:
                cand = ''.join(seg[-L:])
                if cand in known_names:
                    name = cand; break
        if name is None and seg:
            name = seg[-1]
        # amount + one-liner: lines after category until next name
        j = i + 1; amt = []
        while j < len(lines) and lines[j] not in NINE and re.match(r'^(약|총|누적|최대|Seed|Pre-A|Series [A-C]|R&D|정부지원)?\s*\d[\d.,]*\s*억', lines[j]):
            amt.append(lines[j]); j += 1
        one = []
        nxt_i = idxs[n + 1] if n + 1 < len(idxs) else len(lines)
        # one-liner lines between j and the next row's name
        tail = [x for x in lines[j:nxt_i] if x and x not in NOISE and not re.fullmatch(r'\d{1,4}', x)]
        # strip trailing name lines of next row
        if n + 1 < len(idxs):
            for L in (1, 2, 3):
                if len(tail) >= L and ''.join(tail[-L:]) in known_names:
                    tail = tail[:-L]; break
            else:
                if tail: tail = tail[:-1]
        band_rows.append({'page': p, 'name': name, 'nine': lines[i], 'amount_raw': join_wrapped(amt), 'one_liner': join_wrapped(tail)})

# band header per page: scan for '억(NN 건)' patterns to set band by page sequence
band_by_page = {}
cur = None
for p in range(47, 63):
    txt = ' '.join(l.strip() for l in pages[p])
    m = re.search(r'(1~4|5~9|10~19|20~49|50~99|100)\s*억\s*(이상)?\s*\(\d+ 건\)', txt)
    if m: cur = m.group(1) + ('억+' if m.group(1) == '100' else '억')
    band_by_page[p] = cur
for r in band_rows: r['band'] = band_by_page.get(r['page'])

json.dump({'main': main_entries, 'policy': policy_entries, 'special': special, 'tips_refs': tips_refs, 'band_rows': band_rows},
          open(f'{OUT_DIR}/raw_parsed.json', 'w'), ensure_ascii=False, indent=1)
print('main', len(main_entries), 'policy', len(policy_entries), 'special', len(special), 'tips', len(tips_refs), 'band', len(band_rows))
print('main without url', sum(1 for e in main_entries if not e['source_url']), 'special without url', sum(1 for e in special if not e['source_url']))
print('main without year', sum(1 for e in main_entries if not e['year']), 'empty amount', sum(1 for e in main_entries if not e['amount_raw']))
print('odd name lines', [(e['name'], e['name_lines'], e['fund_lines']) for e in main_entries if e['name_lines'] != 1 or e['fund_lines'] != 1][:40])
print('policy odd', [(e['name'], e['funding_form']) for e in policy_entries if e['name_lines'] != 1 or e['fund_lines'] != 1][:40])
