#!/usr/bin/env python3
import os
import http.server
import socketserver
import json
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

PORT = 5173
VWORLD_API_KEY = os.getenv('VWORLD_API_KEY', '')

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        # Serve API key endpoint
        if parsed_path.path == '/api/key':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = json.dumps({'key': VWORLD_API_KEY})
            self.wfile.write(response.encode())
        else:
            # Serve static files
            super().do_GET()

if __name__ == '__main__':
    if not VWORLD_API_KEY:
        print("⚠️  Warning: VWORLD_API_KEY not set in .env file")
    else:
        print(f"✓ API Key loaded from environment")

    print(f"Starting server at http://localhost:{PORT}")

    with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
        httpd.serve_forever()