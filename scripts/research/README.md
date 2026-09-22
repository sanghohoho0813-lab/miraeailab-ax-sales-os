# 리서치 PDF → 사례 DB 재생성

원천: "미래AI랩 AX·플랫폼 자금조달 사례 종합리서치 (2026.09.04)" PDF. 사례를 임의 생성하지 않는다.

```bash
pip install pymupdf
cp <리서치 PDF> scripts/research/research.pdf
cd scripts/research && mkdir -p out
python3 parse_research.py     # out/raw_parsed.json  (표 5종 파싱 + 원문 링크 좌표 매칭)
python3 normalize_cases.py    # out/research_cases.json + out/report.json (금액/한도 분리, 자금유형, 검수 플래그)
python3 gen_sql.py            # supabase/migrations/…_partner_cases_research_seed.sql 갱신용 SQL
cp out/research_cases.json ../../src/content/research-cases.json
```

- 기존 컨설팅 고객사 6곳은 파서에서 차단한다.
- `needs_review` 행은 기본 추천에서 제외된다. 마스터가 검수 후 `verified` 로 바꾼다.
