from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        search_query = params.get("q", ["SK hynix OR SK하이닉스"])[0].strip() or "SK hynix OR SK하이닉스"
        try:
            limit = min(max(int(params.get("limit", ["5"])[0]), 1), 10)
        except ValueError:
            limit = 5

        rss_query = urllib.parse.urlencode({
            "q": search_query,
            "hl": "ko",
            "gl": "KR",
            "ceid": "KR:ko",
        })
        request = urllib.request.Request(
            f"https://news.google.com/rss/search?{rss_query}",
            headers={
                "Accept": "application/rss+xml, application/xml, text/xml",
                "User-Agent": "Mozilla/5.0 SKHynixDashboard/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                xml_text = response.read()
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
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 502)

        self.send_json({"query": search_query, "items": items})

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
