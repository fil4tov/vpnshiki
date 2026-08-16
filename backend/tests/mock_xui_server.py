import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

TOKEN = "Bearer e2e-provider-token"
CLIENTS: dict[str, dict] = {}


class Handler(BaseHTTPRequestHandler):
    @staticmethod
    def _client(email: str) -> dict:
        if email not in CLIENTS:
            CLIENTS[email] = {
                "email": email,
                "subId": f"e2e-{email.removeprefix('web-')}",
                "id": len(CLIENTS) + 1,
                "uuid": f"e2e-id-{email}",
                "password": "e2e-password",
                "auth": "none",
                "flow": "xtls-rprx-vision",
                "security": "auto",
                "totalGB": 0,
                "expiryTime": 0,
                "limitIp": 0,
                "tgId": 0,
                "reset": 0,
                "group": "web",
                "comment": "E2E profile",
                "enable": True,
            }
        return CLIENTS[email]

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self._send(200, {"status": "ok"})
            return
        if self.headers.get("Authorization") != TOKEN:
            self._send(401, {"success": False, "msg": "Unauthorized", "obj": None})
            return

        if path == "/panel/api/clients/list":
            self._send(200, {"success": True, "msg": "", "obj": list(CLIENTS.values())})
            return

        email = unquote(path.rsplit("/", 1)[-1])
        if path.startswith("/panel/api/clients/get/"):
            self._send(
                200,
                {
                    "success": True,
                    "msg": "",
                    "obj": {"client": self._client(email)},
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

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if self.headers.get("Authorization") != TOKEN:
            self._send(401, {"success": False, "msg": "Unauthorized", "obj": None})
            return
        if path == "/panel/api/clients/onlines":
            self._send(
                200,
                {
                    "success": True,
                    "msg": "",
                    "obj": [
                        email for email, client in CLIENTS.items() if client["enable"]
                    ],
                },
            )
            return
        if not path.startswith("/panel/api/clients/update/"):
            self._send(404, {"success": False, "msg": "Not found", "obj": None})
            return
        email = unquote(path.rsplit("/", 1)[-1])
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
        except (TypeError, ValueError):
            self._send(400, {"success": False, "msg": "Invalid payload", "obj": None})
            return
        if not isinstance(payload, dict) or payload.get("email") != email:
            self._send(400, {"success": False, "msg": "Invalid client", "obj": None})
            return
        current = self._client(email)
        CLIENTS[email] = {
            **current,
            **payload,
            "id": current["id"],
            "uuid": payload["id"],
        }
        self._send(200, {"success": True, "msg": "", "obj": None})

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
    for seeded_email in (
        "web-admin-mobile",
        "web-admin-pc",
        "web-e2e-admin-mobile",
        "web-e2e-admin-pc",
        "web-Участник-e2e-mobile",
        "web-Участник-e2e-pc",
    ):
        Handler._client(seeded_email)
    ThreadingHTTPServer(("0.0.0.0", 9084), Handler).serve_forever()
