#!/usr/bin/env bash
# 実ページ HTML / API JSON を extension/tests/fixtures に保存する。
# パーサーのテストはこの実データに対して書く (合成 HTML は使わない)。
# 注意: researchmap への礼節として各リクエスト間に 1.5s sleep を入れる。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/extension/tests/fixtures"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

# 取得対象の公開プロフィールは env で指定できる
STEM="${KENLENS_FIXTURE_STEM:-p_chun}"
HUM="${KENLENS_FIXTURE_HUM:-p_chun}"

mkdir -p "$FIX/html" "$FIX/api"

fetch_html() { # url outfile
  echo "HTML  $1"
  curl -sS -A "$UA" -H "Accept-Language: ja" "$1" -o "$FIX/html/$2" --max-time 30 || echo "  ! failed: $1"
  sleep 1.5
}

fetch_json() { # url outfile
  echo "JSON  $1"
  curl -sSL -H "Accept: application/json" "$1" -o "$FIX/api/$2" --max-time 30 || echo "  ! failed: $1"
  sleep 1.5
}

# --- researchmap HTML ---
fetch_html "https://researchmap.jp/$STEM"                                        "profile-stem.html"
fetch_html "https://researchmap.jp/$STEM/published_papers"                       "papers-stem-p1.html"
fetch_html "https://researchmap.jp/$STEM/published_papers?limit=20&start=21"     "papers-stem-p2.html"
fetch_html "https://researchmap.jp/$STEM/published_papers?lang=en"               "papers-stem-en.html"
fetch_html "https://researchmap.jp/$HUM"                                         "profile-hum.html"
fetch_html "https://researchmap.jp/$HUM/published_papers"                        "papers-hum-p1.html"
fetch_html "https://researchmap.jp/__kenlens_nonexistent__"                      "profile-403.html"

# --- researchmap API ---
fetch_json "https://api.researchmap.jp/$STEM/published_papers?limit=100"         "rm-papers-stem.json"
fetch_json "https://api.researchmap.jp/$HUM/published_papers?limit=100"          "rm-papers-hum.json"
fetch_json "https://api.researchmap.jp/$STEM"                                    "rm-root-stem.json"

# --- OpenAlex ---
fetch_json "https://api.openalex.org/works/doi:10.7717/peerj.4375"               "openalex-normal.json"
fetch_json "https://api.openalex.org/works/doi:10.18910/57477"                   "openalex-xpac.json"
fetch_json "https://api.openalex.org/works/doi:10.9999/kenlens-nonexistent"      "openalex-404.json"

# --- Crossref ---
fetch_json "https://api.crossref.org/works/10.7717/peerj.4375"                   "crossref-work.json"
fetch_json "https://api.crossref.org/works?query.bibliographic=The+state+of+OA+a+large-scale+analysis&rows=3" "crossref-biblio.json"

# --- Unpaywall (email はダミー不可 — 実行時に KENLENS_EMAIL を指定) ---
if [ -n "${KENLENS_EMAIL:-}" ]; then
  fetch_json "https://api.unpaywall.org/v2/10.7717/peerj.4375?email=$KENLENS_EMAIL" "unpaywall-work.json"
else
  echo "SKIP  unpaywall (set KENLENS_EMAIL to fetch)"
fi

echo "done → $FIX"
