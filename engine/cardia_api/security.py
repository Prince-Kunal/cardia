"""Only the Cardia UI on this computer may use the engine (PLAN.md §6).

Three checks, each enough on its own against a web page in another tab:
1. Host: the request must name 127.0.0.1 or localhost (stops DNS rebinding).
2. Origin: a browser request must come from a Cardia UI origin; anything else is refused before it runs.
3. Token: every /api/v1 call except /health needs `Authorization: Bearer <token>`, a secret made at each launch.
"""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

_bearer = HTTPBearer(
    auto_error=False, description="The token the engine printed when it started (a new one each launch)."
)


def require_token(request: Request, cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> None:
    expected = request.app.state.settings.token
    if cred is None or cred.scheme.lower() != "bearer" or not secrets.compare_digest(cred.credentials, expected):
        raise HTTPException(401, "Missing or wrong engine token.", headers={"WWW-Authenticate": "Bearer"})


class OriginGuard:
    """Refuse any request that carries an Origin header other than the Cardia UI's, before it reaches a route.

    CORS alone only stops a foreign page from reading the answer; a form post would still run. Requests
    without an Origin (curl, tests, the desktop shell) pass here and still need the token.
    """

    def __init__(self, app: ASGIApp, allowed_origins: tuple[str, ...]):
        self.app = app
        self.allowed = set(allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            origin = dict(scope["headers"]).get(b"origin")
            if origin is not None and origin.decode("latin-1") not in self.allowed:
                await JSONResponse({"detail": "This origin may not use the Cardia engine."}, 403)(scope, receive, send)
                return
        await self.app(scope, receive, send)
