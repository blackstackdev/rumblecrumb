"""Serve the packaged game on this computer only. No dependency installation."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
from urllib.request import urlopen
import argparse, webbrowser, os, socket

class LocalGameServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can allow competing listeners on the same port.
    # Keep local ownership exclusive there; permit normal restart reuse on Unix.
    allow_reuse_address = os.name != 'nt'
    allow_reuse_port = False

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=4328)
parser.add_argument('--no-open',action='store_true')
args=parser.parse_args()
base=Path(__file__).resolve().parent
version=(base/'VERSION').read_text(encoding='utf-8').strip()
root=base/'dist'
if not (root/'index.html').is_file():
    raise SystemExit('The dist folder is missing. Extract the entire playable ZIP, or run npm run build from the source folder.')
url=f'http://127.0.0.1:{args.port}/'
try:
    server=LocalGameServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root)))
except OSError:
    try:
        with urlopen(url,timeout=2) as response: existing=response.read(65536).decode('utf-8')
        if '<title>Rumblecrumb' in existing and f'v{version}' in existing:
            print('Rumblecrumb is already running at '+url)
            if not args.no_open:webbrowser.open(url)
            raise SystemExit(0)
    except (OSError,UnicodeError):pass
    raise SystemExit(f'Port {args.port} is occupied. Close the other server or use --port 4329.')
print(f'Rumblecrumb v{version} - '+url+'\nKeep this window open while playing. Ctrl+C stops the local server.')
if not args.no_open:webbrowser.open(url)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
