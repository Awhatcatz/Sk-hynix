from __future__ import annotations

import argparse
import csv
import io
import json
import mimetypes
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "reports" / "sk_hynix_strategy_dashboard.html"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
FRED_SERIES = {
    "DGS10": {
        "name": "미국채 10년물",
        "unit": "%",
        "source": "FRED: DGS10",
    },
    "PCEPI": {
        "name": "PCE 물가",
        "unit": "Index 2017=100",
        "source": "FRED: PCEPI",
    },
    "PCEPILFE": {
        "name": "Core PCE",
        "unit": "Index 2017=100",
        "source": "FRED: PCEPILFE",
    },
    "BAMLH0A0HYM2": {
        "name": "하이일드 스프레드",
        "unit": "%",
        "source": "FRED: BAMLH0A0HYM2",
    },
}


def find_open_port(start: int) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("No open port found")


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "SKHynixDashboard/1.0"

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in {"/", "/sk_hynix_strategy_dashboard.html"}:
            self.serve_file(DASHBOARD)
            return
        if parsed.path == "/api/yahoo-chart":
            self.serve_yahoo_chart(parsed.query)
            return
        if parsed.path == "/api/fred-series":
            self.serve_fred_series(parsed.query)
            return
        if parsed.path == "/api/news":
            self.serve_news(parsed.query)
            return
        if parsed.path == "/api/health":
            self.send_json({"ok": True})
            return
        self.send_error(404, "Not found")

    def serve_file(self, path: Path) -> None:
        if not path.exists():
            self.send_error(404, f"Missing file: {path}")
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        payload = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def serve_fred_series(self, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        series = params.get("series", ["DGS10"])[0].strip().upper()
        limit = min(max(int(params.get("limit", ["260"])[0]), 5), 2000)

        if series not in FRED_SERIES:
            self.send_json({"error": f"Unsupported FRED series: {series}"}, status=400)
            return

        url = f"{FRED_CSV}?{urllib.parse.urlencode({'id': series})}"
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
            self.send_json({"error": str(exc)}, status=502)
            return

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

    def serve_news(self, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        search_query = params.get("q", ["SK hynix OR SK하이닉스"])[0].strip() or "SK hynix OR SK하이닉스"
        limit = min(max(int(params.get("limit", ["5"])[0]), 1), 10)
        rss_query = urllib.parse.urlencode({
            "q": search_query,
            "hl": "ko",
            "gl": "KR",
            "ceid": "KR:ko",
        })
        request = urllib.request.Request(
            f"{GOOGLE_NEWS_RSS}?{rss_query}",
            headers={
                "Accept": "application/rss+xml, application/xml, text/xml",
                "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                xml_text = response.read()
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=502)
            return

        try:
            root = ET.fromstring(xml_text)
            items = []
            for item in root.findall("./channel/item")[:limit]:
                source = item.find("{*}source")
                items.append({
                    "title": item.findtext("title", default=""),
                    "link": item.findtext("link", default=""),
                    "published": item.findtext("pubDate", default=""),
                    "source": source.text if source is not None else "",
                })
        except ET.ParseError as exc:
            self.send_json({"error": f"RSS parse error: {exc}"}, status=502)
            return

        self.send_json({"query": search_query, "items": items})

    def serve_yahoo_chart(self, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        symbol = params.get("symbol", ["000660.KS"])[0].strip() or "000660.KS"
        chart_range = params.get("range", ["1d"])[0]
        interval = params.get("interval", ["1m"])[0]

        yahoo_query = urllib.parse.urlencode({"range": chart_range, "interval": interval})
        url = f"{YAHOO_CHART.format(symbol=urllib.parse.quote(symbol))}?{yahoo_query}"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = response.read()
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read() or json.dumps({"error": str(exc)}).encode("utf-8")
            status = exc.code
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=502)
            return

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the SK hynix strategy dashboard.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    port = find_open_port(args.port)
    server = ThreadingHTTPServer((args.host, port), DashboardHandler)
    print(f"SK hynix dashboard: http://{args.host}:{port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
