import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

TOKEN = "Bearer e2e-provider-token"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self._send(200, {"status": "ok"})
            return
        if self.headers.get("Authorization") != TOKEN:
            self._send(401, {"success": False, "msg": "Unauthorized", "obj": None})
            return

        email = unquote(path.rsplit("/", 1)[-1])
        if path.startswith("/panel/api/clients/get/"):
            self._send(
                200,
                {
                    "success": True,
                    "msg": "",
                    "obj": {"client": {"subId": f"e2e-{email.removeprefix('[web]-')}"}},
                },
            )
            return
        if path.startswith("/panel/api/clients/links/"):
            fragment = quote(email, safe="-")
            self._send(
                200,
                {
                    "success": True,
                    "msg": "",
                    "obj": [
                        (
                            "vless://e2e-only@vpn.example.test:443"
                            f"?type=xhttp&security=reality#ru-fin-vless-443-{fragment}"
                        ),
                        (
                            "hysteria2://e2e-only@vpn.example.test:4443"
                            f"?sni=vpn.example.test#ru-fr-hysteria-4443-{fragment}"
                        ),
                    ],
                },
            )
            return
        self._send(404, {"success": False, "msg": "Not found", "obj": None})

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9084), Handler).serve_forever()
