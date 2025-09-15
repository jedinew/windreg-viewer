#!/usr/bin/env python3
"""
VWorld WFS Proxy Server with Environment Variable Support
"""
import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='.')
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get configuration from environment
VWORLD_API_KEY = os.getenv('VWORLD_API_KEY', '')
VWORLD_DOMAIN = os.getenv('VWORLD_DOMAIN', 'wind.rkswork.com')
PORT = int(os.getenv('PORT', 5173))

if not VWORLD_API_KEY:
    logger.warning("VWORLD_API_KEY not set in environment variables!")

# VWorld WFS base URL
VWORLD_WFS_URL = 'https://api.vworld.kr/req/wfs'

@app.route('/')
def index():
    """Serve the main HTML file"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

@app.route('/api/config')
def get_config():
    """Return configuration status (not the actual key for security)"""
    return jsonify({
        'configured': bool(VWORLD_API_KEY),
        'domain': VWORLD_DOMAIN
    })

@app.route('/proxy/wfs')
def proxy_wfs():
    """Proxy WFS requests to VWorld with API key from environment"""
    try:
        # Get query parameters from request
        params = dict(request.args)

        # Override with server-side API key and domain
        params['key'] = VWORLD_API_KEY
        params['domain'] = VWORLD_DOMAIN

        # Log request (without API key)
        logger.info(f"WFS Request: {params.get('REQUEST')} for {params.get('TYPENAME')}")

        # Make request to VWorld
        response = requests.get(
            VWORLD_WFS_URL,
            params=params,
            headers={
                'Accept': 'application/json',
                'User-Agent': 'WindregViewer/1.0'
            },
            timeout=30
        )

        # Return response
        if response.headers.get('content-type', '').lower().startswith('application/json'):
            return jsonify(response.json())
        else:
            # Return as JSON even if response is XML/text
            return jsonify({
                'error': 'Non-JSON response from VWorld',
                'status': response.status_code,
                'content': response.text[:500]
            }), response.status_code

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timeout'}), 504
    except requests.exceptions.RequestException as e:
        logger.error(f"WFS proxy error: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print(f"""
    ============================================
    Wind Regulation Layer Viewer Server
    ============================================
    Server URL: http://localhost:{PORT}

    Configuration:
    - VWORLD_API_KEY: {'✓ Set' if VWORLD_API_KEY else '✗ Not set - Please set in .env file'}
    - VWORLD_DOMAIN: {VWORLD_DOMAIN}

    To set API key:
    1. Create .env file from .env.example
    2. Add your VWorld API key to .env file
    3. Restart the server
    ============================================
    """)

    app.run(host='0.0.0.0', port=PORT, debug=True)