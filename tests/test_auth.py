"""Firebase ID-token verification (api/auth.py) with locally signed RS256 tokens."""

import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from api import auth
from api.main import app

PROJECT = "cooked-test"
KID = "test-key"
_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(key=_private, kid=KID, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{PROJECT}",
        "aud": PROJECT,
        "sub": "uid-123",
        "iat": now,
        "exp": now + 3600,
        "auth_time": now,
        "email": "advisor@example.edu",
        "email_verified": True,
        "name": "Ada Advisor",
        "firebase": {"sign_in_provider": "google.com"},
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


class FakeResponse:
    def __init__(self):
        self.headers = {"cache-control": "public, max-age=600"}

    def raise_for_status(self):
        pass

    def json(self):
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_private.public_key()))
        return {"keys": [{**jwk, "kid": KID, "alg": "RS256", "use": "sig"}]}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", PROJECT)
    monkeypatch.setattr(auth, "_keys", {})
    monkeypatch.setattr(auth, "_expires_at", 0.0)
    calls = []

    def fake_request(method, url, **kw):
        calls.append(url)
        if not auth.net.enabled():
            raise auth.net.NetworkDisabled("off")
        return FakeResponse()

    monkeypatch.setattr(auth.net, "request", fake_request)
    c = TestClient(app)
    c.jwks_calls = calls
    return c


def bearer(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def test_me_signed_out(client):
    body = client.get("/me").json()
    assert body == {"auth_enabled": True, "user": None}


def test_me_with_valid_token_and_keys_are_cached(client):
    for _ in range(2):
        r = client.get("/me", headers=bearer(token()))
        assert r.status_code == 200
    user = r.json()["user"]
    assert user["uid"] == "uid-123" and user["email"] == "advisor@example.edu"
    assert user["provider"] == "google.com"
    assert len(client.jwks_calls) == 1


@pytest.mark.parametrize(
    "bad, error",
    [
        (lambda: token(exp=int(time.time()) - 3600, iat=int(time.time()) - 7200), "token_expired"),
        (lambda: token(aud="someone-else"), "invalid_token"),
        (lambda: token(iss="https://securetoken.google.com/someone-else"), "invalid_token"),
        (lambda: token(key=_other), "invalid_token"),
        (lambda: token(kid="unknown"), "invalid_token"),
        (lambda: token(sub=""), "invalid_token"),
        (lambda: "not-a-jwt", "invalid_token"),
    ],
)
def test_bad_tokens_are_rejected(client, bad, error):
    r = client.get("/me", headers=bearer(bad()))
    assert r.status_code == 401
    assert r.json()["error"] == error
    assert r.headers["www-authenticate"] == "Bearer"
    assert set(r.json()) == {"error", "message", "needs"}


def test_non_bearer_scheme_is_rejected(client):
    assert client.get("/me", headers={"Authorization": f"Basic {token()}"}).status_code == 401


class FakeEngine:
    version = "x"

    def queue(self, staff, limit):
        return {"aggregated": not staff, "items": []}


def test_staff_rows_need_sign_in(client, monkeypatch):
    monkeypatch.setattr("api.routes.product.get_engine", lambda: FakeEngine())
    assert client.get("/institution/queue").status_code == 200
    r = client.get("/institution/queue?staff=true")
    assert r.status_code == 401 and r.json()["error"] == "auth_required"
    r = client.get("/institution/queue?staff=true", headers=bearer(token()))
    assert r.status_code == 200 and r.json()["data"]["aggregated"] is False


def test_auth_off_keeps_old_behaviour(client, monkeypatch):
    monkeypatch.delenv("FIREBASE_PROJECT_ID")
    monkeypatch.setattr("api.routes.product.get_engine", lambda: FakeEngine())
    assert client.get("/me").json() == {"auth_enabled": False, "user": None}
    assert client.get("/institution/queue?staff=true").status_code == 200


def test_demo_mode_cannot_fetch_keys(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "1")
    r = client.get("/me", headers=bearer(token()))
    assert r.status_code == 503 and r.json()["error"] == "auth_unavailable"


def test_cors_allows_authorization_header(client):
    r = client.options(
        "/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
