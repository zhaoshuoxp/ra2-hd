"""Serve only the packaged review documents on the local loopback interface."""
import argparse
import json
import pathlib
import shutil
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = json.loads((root / 'review-manifest.json').read_text())
    documents = {'index.html', manifest['entry'], 'airport-inline-preview.html'}
    documents.update(row['file'] for row in manifest['pages'])
    policy = ("default-src 'none'; img-src data:; frame-src 'self'; script-src 'unsafe-inline'; "
              "style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            relative = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
            file = (root / relative).resolve()
            if relative not in documents or not file.is_relative_to(root) or not file.is_file():
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(file.stat().st_size))
            self.send_header('Content-Security-Policy', policy)
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:
                with file.open('rb') as stream:
                    shutil.copyfileobj(stream, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, format, *values):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(url, flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
