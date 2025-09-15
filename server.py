from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from urllib.request import Request, urlopen
import ssl
import json
import os

UPSTREAM_WFS = "https://api.vworld.kr/req/wfs"

class CORSRequestHandler(SimpleHTTPRequestHandler):
    # Handle CORS preflight requests
    def do_OPTIONS(self):
        self.send_response(204, "No Content")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    # Simple proxy for VWorld WFS to bypass CORS: GET /proxy/wfs?... -> upstream
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/proxy/wfs"):
            self.handle_proxy_wfs(parsed)
            return
        # Otherwise serve static files
        return super().do_GET()

    def handle_proxy_wfs(self, parsed):
        # Parse incoming query params
        qs = parse_qs(parsed.query, keep_blank_values=True)
        # Flatten values (take first for each key)
        params = {k: v[-1] if isinstance(v, list) else v for k, v in qs.items()}

        # Build upstream URL with the same params
        upstream_parsed = urlparse(UPSTREAM_WFS)
        upstream_qs = urlencode(params, doseq=False)
        upstream_url = urlunparse((
            upstream_parsed.scheme,
            upstream_parsed.netloc,
            upstream_parsed.path,
            '',
            upstream_qs,
            ''
        ))

        try:
            # Request upstream (ignore SSL issues if any)
            ctx = ssl.create_default_context()
            req = Request(upstream_url, headers={
                'Accept': params.get('OUTPUT', params.get('output', '')).lower() == 'application/json' and 'application/json' or '*/*'
            })
            with urlopen(req, context=ctx, timeout=15) as resp:
                data = resp.read()
                ctype = resp.headers.get('Content-Type', 'application/octet-stream')
                # Force JSON content-type if OUTPUT asked for JSON
                wants_json = (params.get('OUTPUT') == 'application/json' or params.get('output') == 'application/json')
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Type", 'application/json; charset=UTF-8' if wants_json else ctype)
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json; charset=UTF-8")
            self.end_headers()
            payload = {"error": str(e), "upstream": UPSTREAM_WFS, "url": upstream_url}
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    # Add CORS headers to all responses
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        # Reduce caching during development
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5173"))
    httpd = HTTPServer(("0.0.0.0", port), CORSRequestHandler)
    print(f"Serving at http://0.0.0.0:{port}\n- Static files: current directory\n- Proxy endpoint: GET /proxy/wfs?... (for {UPSTREAM_WFS})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        httpd.server_close()
