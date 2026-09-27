"""Firebase Authentication for the API.

The web app signs people in with Firebase and sends the Firebase ID token on every call as
`Authorization: Bearer <token>`. We verify it here against Google's public signing keys, so the
server only needs FIREBASE_PROJECT_ID. No service-account private key is used or stored.

Auth is on when FIREBASE_PROJECT_ID is set. Unset (local dev, most tests, the offline demo),
every route behaves as it did before auth existed.
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from typing import Annotated

import httpx
import jwt
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from api.providers import net

# Google's JWKS for Firebase ID tokens (securetoken.google.com issuer).
JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
LEEWAY_S = 30


class AuthError(Exception):
    def __init__(self, status: int, error: str, message: str):
        super().__init__(message)
        self.status = status
        self.error = error
        self.message = message


@dataclass(frozen=True)
class User:
    uid: str
    email: str | None
    email_verified: bool
    name: str | None
    provider: str | None


def project_id() -> str | None:
    return net.key("FIREBASE_PROJECT_ID")


def enabled() -> bool:
    return project_id() is not None


# ---------- signing keys (cached for the lifetime Google advertises) ----------
_keys: dict[str, object] = {}
_expires_at = 0.0
_lock = threading.Lock()


def _max_age(cache_control: str | None) -> float:
    m = re.search(r"max-age=(\d+)", cache_control or "")
    return float(m.group(1)) if m else 3600.0


def _signing_key(kid: str):
    global _keys, _expires_at
    with _lock:
        if kid not in _keys or time.time() >= _expires_at:
            try:
                r = net.request("GET", JWKS_URL, timeout=10)
                r.raise_for_status()
                jwks = jwt.PyJWKSet.from_dict(r.json())
            except net.NetworkDisabled as exc:
                raise AuthError(
                    503, "auth_unavailable", "Sign-in can't be verified while outbound network is off."
                ) from exc
            except (httpx.HTTPError, jwt.PyJWTError, ValueError) as exc:
                raise AuthError(503, "auth_unavailable", "Couldn't fetch Firebase signing keys.") from exc
            _keys = {k.key_id: k.key for k in jwks.keys if k.key_id}
            _expires_at = time.time() + _max_age(r.headers.get("cache-control"))
        key = _keys.get(kid)
    if key is None:
        raise AuthError(401, "invalid_token", "Token was signed with an unknown key.")
    return key


def verify_token(token: str) -> User:
    pid = project_id()
    if pid is None:
        raise AuthError(503, "auth_unavailable", "Authentication isn't configured on this server.")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise AuthError(401, "invalid_token", "Malformed token.") from exc
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise AuthError(401, "invalid_token", "Unexpected token signature.")
    key = _signing_key(header["kid"])
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=pid,
            issuer=f"https://securetoken.google.com/{pid}",
            leeway=LEEWAY_S,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError(401, "token_expired", "Session expired. Sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise AuthError(401, "invalid_token", "Token failed verification.") from exc
    sub = claims.get("sub")
    if not isinstance(sub, str) or not 0 < len(sub) <= 128:
        raise AuthError(401, "invalid_token", "Token has no valid subject.")
    if float(claims.get("auth_time", 0)) > time.time() + LEEWAY_S:
        raise AuthError(401, "invalid_token", "Token auth_time is in the future.")
    return User(
        uid=sub,
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
        provider=(claims.get("firebase") or {}).get("sign_in_provider"),
    )


# ---------- FastAPI dependencies ----------
def optional_user(authorization: Annotated[str | None, Header()] = None) -> User | None:
    """The signed-in user, or None. A token that is present but bad is a 401, never ignored."""
    if not authorization or not enabled():
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError(401, "invalid_token", "Use 'Authorization: Bearer <Firebase ID token>'.")
    return verify_token(token.strip())


CurrentUser = Annotated[User | None, Depends(optional_user)]


def require_signed_in(user: User | None) -> None:
    """Raise unless someone is signed in. No-op while auth is off."""
    if enabled() and user is None:
        raise AuthError(401, "auth_required", "Sign in to see per-student rows.")


# ---------- /me ----------
class MeUser(BaseModel):
    uid: str
    email: str | None
    email_verified: bool
    name: str | None
    provider: str | None


class MeResponse(BaseModel):
    auth_enabled: bool
    user: MeUser | None


router = APIRouter(tags=["auth"])


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser):
    """Who the bearer token belongs to. `user` is null when signed out or auth is off."""
    return MeResponse(auth_enabled=enabled(), user=MeUser(**user.__dict__) if user else None)
