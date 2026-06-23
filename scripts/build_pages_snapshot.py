import csv
import datetime as dt
import io
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "pages-data.json"

SYMBOLS = ["000660.KS", "^KS11"]
RANGES = [
    ("1d", "1m"),
    ("5d", "5m"),
    ("1mo", "1d"),
    ("3mo", "1d"),
    ("6mo", "1d"),
    ("1y", "1d"),
]

FRED_SERIES = {
    "DGS10": {"name": "미국채 10년물", "unit": "%", "source": "FRED: DGS10"},
    "PCEPI": {"name": "PCE 물가", "unit": "Index 2017=100", "source": "FRED: PCEPI"},
    "PCEPILFE": {"name": "Core PCE", "unit": "Index 2017=100", "source": "FRED: PCEPILFE"},
    "BAMLH0A0HYM2": {"name": "하이일드 스프레드", "unit": "%", "source": "FRED: BAMLH0A0HYM2"},
}


def request_text(url, accept):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": accept,
            "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def fetch_yahoo(symbol, chart_range, interval):
    query = urllib.parse.urlencode({"range": chart_range, "interval": interval})
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?{query}"
    body = request_text(url, "application/json")
    return json.loads(body.decode("utf-8"))


def fetch_fred(series, limit):
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urllib.parse.urlencode({"id": series})
    text = request_text(url, "text/csv").decode("utf-8-sig")
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        raw = row.get(series)
        if raw in {None, "", "."}:
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        rows.append({"date": row.get("observation_date"), "value": value})

    rows = rows[-limit:]
    return {
        "series": series,
        **FRED_SERIES[series],
        "observations": rows,
        "latest": rows[-1] if rows else None,
        "previous": rows[-2] if len(rows) > 1 else None,
    }


def fetch_news(limit=4):
    query = urllib.parse.urlencode({
        "q": "SK hynix OR SK하이닉스 semiconductor",
        "hl": "ko",
        "gl": "KR",
        "ceid": "KR:ko",
    })
    xml_body = request_text(
        f"https://news.google.com/rss/search?{query}",
        "application/rss+xml, application/xml, text/xml",
    )
    root = ET.fromstring(xml_body)
    items = []
    for item in root.findall("./channel/item")[:limit]:
        source = item.find("{*}source")
        items.append({
            "title": item.findtext("title", default=""),
            "link": item.findtext("link", default=""),
            "published": item.findtext("pubDate", default=""),
            "source": source.text if source is not None else "",
        })
    return {"query": "SK hynix OR SK하이닉스 semiconductor", "items": items}


def main():
    charts = {}
    for symbol in SYMBOLS:
        for chart_range, interval in RANGES:
            key = f"{symbol}|{chart_range}|{interval}"
            charts[key] = fetch_yahoo(symbol, chart_range, interval)

    macro = {
        "tenYear": fetch_fred("DGS10", 260),
        "pce": fetch_fred("PCEPI", 180),
        "corePce": fetch_fred("PCEPILFE", 180),
        "highYield": fetch_fred("BAMLH0A0HYM2", 260),
        "news": fetch_news(4),
    }

    payload = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "charts": charts,
        "macro": macro,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
