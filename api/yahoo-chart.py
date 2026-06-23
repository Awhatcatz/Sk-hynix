from http.server import BaseHTTPRequestHandler
import json
import urllib.error
import urllib.parse
import urllib.request


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        symbol = params.get("symbol", ["000660.KS"])[0].strip() or "000660.KS"
        chart_range = params.get("range", ["1d"])[0]
        interval = params.get("interval", ["1m"])[0]
        query = urllib.parse.urlencode({"range": chart_range, "interval": interval})
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?{query}"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read()
                status = response.status
        except urllib.error.HTTPError as exc:
            body = exc.read() or json.dumps({"error": str(exc)}).encode("utf-8")
            status = exc.code
        except Exception as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
            status = 502

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
