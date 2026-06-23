from http.server import BaseHTTPRequestHandler
import csv
import io
import json
import urllib.parse
import urllib.request


FRED_SERIES = {
    "DGS10": {"name": "미국채 10년물", "unit": "%", "source": "FRED: DGS10"},
    "PCEPI": {"name": "PCE 물가", "unit": "Index 2017=100", "source": "FRED: PCEPI"},
    "PCEPILFE": {"name": "Core PCE", "unit": "Index 2017=100", "source": "FRED: PCEPILFE"},
    "BAMLH0A0HYM2": {"name": "하이일드 스프레드", "unit": "%", "source": "FRED: BAMLH0A0HYM2"},
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        series = params.get("series", ["DGS10"])[0].strip().upper()
        try:
            limit = min(max(int(params.get("limit", ["260"])[0]), 5), 2000)
        except ValueError:
            limit = 260

        if series not in FRED_SERIES:
            return self.send_json({"error": f"Unsupported FRED series: {series}"}, 400)

        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urllib.parse.urlencode({"id": series})
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "text/csv",
                "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                text = response.read().decode("utf-8-sig")
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 502)

        rows = []
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            raw = row.get(series)
            if raw in {None, "", "."}:
                continue
            try:
                value = float(raw)
            except ValueError:
                continue
            rows.append({"date": row.get("observation_date"), "value": value})

        rows = rows[-limit:]
        self.send_json({
            "series": series,
            **FRED_SERIES[series],
            "observations": rows,
            "latest": rows[-1] if rows else None,
            "previous": rows[-2] if len(rows) > 1 else None,
        })

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
