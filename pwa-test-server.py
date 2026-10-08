from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import re
from urllib.parse import urlparse, parse_qs

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        candidate = parse_qs(parsed.query).get('candidate', [''])[0]
        if parsed.path == '/service-worker.js' and candidate in ('failed', 'next'):
            source = Path('service-worker.js').read_text()
            source = re.sub(r'const CACHE_NAME = "([^"]+)";', lambda match: 'const CACHE_NAME = "' + match.group(1) + '-lifecycle-' + candidate + '";', source, count=1)
            if candidate == 'failed':
                source = source.replace('const STATIC_ASSETS = [', 'const STATIC_ASSETS = ["./pwa-test-missing.js",', 1)
            data = source.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

ThreadingHTTPServer(('127.0.0.1', 4174), Handler).serve_forever()
