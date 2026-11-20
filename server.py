#!/usr/bin/env python3
"""Serves the game files and a tiny account/save API.

Accounts are stored in accounts.json next to this script, so every browser
that reaches this server sees the same accounts and saves.
Passwords are hashed in the browser before they are sent; the server only
stores and compares those hashes.
"""
import json, os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(HERE, 'accounts.json')
LOCK = threading.Lock()
PORT = 8765


def load():
    try:
        with open(DATA_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def store(accounts):
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(accounts, f)
    os.replace(tmp, DATA_FILE)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n) or b'{}')

    def do_POST(self):
        if not self.path.startswith('/api/'):
            return self.reply(404, {'error': 'not found'})
        body = self.read_json()
        name, h = body.get('name', ''), body.get('hash', '')
        with LOCK:
            accounts = load()
            if self.path == '/api/signup':
                if name in accounts:
                    return self.reply(409, {'error': 'That name is taken.'})
                accounts[name] = {'hash': h, 'data': {'coins': 0, 'owned': [], 'bestDays': {}}}
                store(accounts)
                return self.reply(200, {'data': accounts[name]['data']})
            acct = accounts.get(name)
            if not acct or acct['hash'] != h:
                return self.reply(401, {'error': 'Wrong name or password.'})
            if self.path == '/api/login':
                return self.reply(200, {'data': acct['data']})
            if self.path == '/api/save':
                acct['data'] = body.get('data', acct['data'])
                store(accounts)
                return self.reply(200, {'ok': True})
        self.reply(404, {'error': 'not found'})

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


if __name__ == '__main__':
    print(f'Serving on http://127.0.0.1:{PORT}  (accounts in {DATA_FILE})')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
