"""Refresh the asset manifest, then serve the unchanged static module app."""
import runpy
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
root = Path(__file__).resolve().parent.parent
try:
    runpy.run_path(str(root / 'tools/build-assets.py'))
except ModuleNotFoundError as error:
    if error.name != 'PIL':
        raise
    print('Pillow unavailable; using the saved asset manifest and previews.', flush=True)
print('Local: http://127.0.0.1:8000', flush=True)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def end_headers(self):
        # Revalidate the local module graph after edits. Keep photographs
        # cacheable so refreshing code does not reload the entire collection.
        path = self.path.split('?', 1)[0]
        if path == '/' or path.endswith(('.html', '.js', '.css')):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()
class Server(ThreadingHTTPServer):
    # Browsers fetch the module graph in parallel, alongside PDF/preview workers.
    # The default five-connection backlog can reset requests during a refresh.
    request_queue_size = 128
Server(('127.0.0.1', 8000), lambda *a, **k: Handler(*a, directory=str(root), **k)).serve_forever()
