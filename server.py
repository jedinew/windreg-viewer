#!/usr/bin/env python3
import os
import http.server
import socketserver
import json
import urllib.request
from urllib.parse import urlparse, parse_qs

PORT = 5173
VWORLD_API_KEY = os.getenv('VWORLD_API_KEY', '')

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        # Log all requests
        print(f"REQUEST: {self.path}")

        # Serve API key endpoint
        if parsed_path.path == '/api/key':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = json.dumps({'key': VWORLD_API_KEY})
            self.wfile.write(response.encode())

        # Handle WFS proxy requests
        elif parsed_path.path == '/proxy/wfs':
            # Parse query parameters
            query_params = parse_qs(parsed_path.query)

            # Build VWorld URL
            vworld_params = {}
            for key, values in query_params.items():
                vworld_params[key] = values[0] if values else ''

            # Add/override API key
            vworld_params['key'] = VWORLD_API_KEY
            vworld_params['domain'] = vworld_params.get('domain', 'wind.rkswork.com')

            # Build URL
            vworld_url = 'https://api.vworld.kr/req/wfs?' + '&'.join([f"{k}={v}" for k, v in vworld_params.items()])

            print(f"PROXY TO VWORLD: {vworld_url}")

            try:
                # Make request to VWorld
                req = urllib.request.Request(vworld_url, headers={
                    'Accept': 'application/json',
                    'User-Agent': 'WindregViewer/1.0'
                })

                with urllib.request.urlopen(req, timeout=30) as response:
                    data = response.read()

                    # Send response back to client
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)

            except Exception as e:
                print(f"ERROR: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({'error': str(e)})
                self.wfile.write(error_response.encode())

        else:
            # Serve static files
            super().do_GET()

if __name__ == '__main__':
    if not VWORLD_API_KEY:
        print("⚠️  Warning: VWORLD_API_KEY not set in environment variable")
        print("   Set it with: export VWORLD_API_KEY=your_key_here")
    else:
        print(f"✓ API Key loaded from environment")

    print(f"Starting server at http://localhost:{PORT}")

    with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
        httpd.serve_forever()