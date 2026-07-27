#!/usr/bin/env python3
"""Minimal mock of the two GitHub endpoints install.sh talks to.

Serves:
  GET /repos/<owner>/<repo>/releases/latest -> the fixture release JSON
  GET /assets/<name>                        -> the fixture asset bytes

Used only by scripts/test-install.sh (never by install.sh in production --
this file is test infrastructure, not shipped to end users).
"""

import http.server
import os
import sys

FIXTURES_DIR = sys.argv[1] if len(sys.argv) > 1 else "/fixtures"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8899


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: A002 - quiet by default
        pass

    def do_GET(self):  # noqa: N802 - http.server's required method name
        if self.path.endswith("/releases/latest"):
            self._serve_file(os.path.join(FIXTURES_DIR, "release.json"), "application/json")
            return
        if self.path.startswith("/assets/"):
            name = self.path[len("/assets/"):]
            self._serve_file(os.path.join(FIXTURES_DIR, "assets", name), "application/octet-stream")
            return
        self.send_response(404)
        self.end_headers()

    def _serve_file(self, path, content_type):
        if not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        with open(path, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
