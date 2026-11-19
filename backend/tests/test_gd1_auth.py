import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.admin import Journey, JourneyStop
from app.models.guide_content import GuideContent
from app.models.place import Place
from app.services import login_throttle
from app.services.osm_service import OsmNearbyService, get_osm_service

PASSWORD = "StrongPass123"


@pytest.fixture
def client(db_session):
    def osm_handler(request):
        return httpx.Response(200, json={"elements": []})
    osm = OsmNearbyService(lambda: httpx.AsyncClient(transport=httpx.MockTransport(osm_handler)), allow_network=True)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_osm_service] = lambda: osm
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


@pytest.fixture
def clock(monkeypatch):
    now = [2_000_000_001]
    monkeypatch.setattr(login_throttle.time, "time", lambda: now[0])
    return now


@pytest.fixture
def paths(db_session):
    place = Place(name="Gate fixture", latitude=10.77, longitude=106.7, publication_status="published")
    db_session.add(place)
    db_session.flush()
    db_session.add(GuideContent(place_id=place.id, language_code="vi", title="vi", content="text", publication_status="published"))
    journey = Journey(name="Gate journey")
    db_session.add(journey)
    db_session.flush()
    db_session.add(JourneyStop(journey_id=journey.id, place_id=place.id, position=0))
    db_session.commit()
    pid = place.id
    return [
        "/places", "/places/search?q=Gate", "/places/nearby?latitude=10.77&longitude=106.7",
        f"/places/{pid}", f"/places/{pid}/guide-content?language=vi", f"/places/{pid}/guide-content/languages",
        f"/places/{pid}/images", f"/places/{pid}/reviews", f"/places/{pid}/reviews/summary",
        f"/places/{pid}/google-reviews", "/journeys", f"/journeys/{journey.id}",
        "/osm/nearby?latitude=10.77&longitude=106.7", "/settings", "/presence/policy",
    ]


def test_every_read_endpoint_requires_a_token(client, paths, reader_headers):
    for path in paths:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers={"Authorization": "Bearer invalid"}).status_code == 401, path
        assert client.get(path, headers=reader_headers).status_code == 200, path


def test_public_endpoints_stay_open(client):
    assert client.get("/").status_code == 200
    assert client.get("/health/live").status_code == 200
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/media/missing.jpg").status_code == 404


def register(client, email="gate@example.com", password=PASSWORD):
    return client.post("/users", json={"email": email, "full_name": "Gate", "password": password})


def login(client, email="gate@example.com", password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def fail(client, times, email="gate@example.com"):
    return [login(client, email, "Wrong1234").status_code for _ in range(times)]


def test_account_locks_after_five_failures_even_for_the_right_password(client, clock):
    assert register(client).status_code == 201
    assert fail(client, 5) == [401] * 5
    locked = login(client)
    assert locked.status_code == 429
    body = locked.json()
    assert body["code"] == "login_locked" and body["retry_after"] > 0
    assert body["detail"] == "Account temporarily locked after too many failed attempts."
    assert int(locked.headers["retry-after"]) == body["retry_after"]
    assert fail(client, 1) == [429]


def test_lock_expires_without_a_real_sleep(client, clock):
    register(client)
    fail(client, 5)
    clock[0] += login_throttle.LOCK_SECONDS - 1
    assert login(client).status_code == 429
    clock[0] += 2
    assert login(client).status_code == 200


def test_failures_expire_after_the_window(client, clock):
    register(client)
    assert fail(client, 4) == [401] * 4
    clock[0] += login_throttle.LOCK_WINDOW_SECONDS + 1
    assert fail(client, 4) == [401] * 4
    assert login(client).status_code == 200


def test_successful_login_clears_the_failure_counter(client, clock):
    register(client)
    assert fail(client, 4) == [401] * 4
    assert login(client).status_code == 200
    assert fail(client, 4) == [401] * 4
    assert login(client).status_code == 200


def test_unknown_email_is_counted_and_locked_like_a_real_one(client, clock):
    register(client)
    assert fail(client, 5, "missing@example.com") == [401] * 5
    unknown = login(client, "missing@example.com")
    assert unknown.status_code == 429 and unknown.json()["code"] == "login_locked"
    assert login(client).status_code == 200


def test_locking_one_account_does_not_lock_another(client, clock):
    register(client)
    register(client, "other@example.com")
    fail(client, 5)
    assert login(client, "other@example.com").status_code == 200


def test_ip_throttle_counts_every_attempt_and_reports_its_own_code(client, clock, monkeypatch):
    monkeypatch.setattr(login_throttle, "IP_LIMIT", 3)
    register(client)
    assert [login(client).status_code for _ in range(3)] == [200, 200, 200]
    limited = login(client)
    assert limited.status_code == 429
    assert limited.json()["code"] == "login_rate_limited" and limited.json()["retry_after"] > 0
    assert limited.json()["detail"] == "Too many login attempts. Try again later."
    assert int(limited.headers["retry-after"]) == limited.json()["retry_after"]


@pytest.mark.parametrize("password", ["alllowercase1", "ALLUPPERCASE1", "NoDigitsHere", "Sh0rt", "A1" + "a" * 127])
def test_weak_passwords_are_rejected_on_registration(client, password):
    response = register(client, password=password)
    assert response.status_code == 422
    assert "password" in response.json()["detail"][0]["loc"]


def test_strong_password_boundaries_are_accepted_and_login_skips_the_rule(client):
    assert register(client, "min@example.com", "Abcdef12").status_code == 201
    assert register(client, "max@example.com", "A1" + "a" * 126).status_code == 201
    assert login(client, "min@example.com", "abc").status_code == 401


PUBLIC_GET_PATHS = {
    "/", "/health/live", "/health/ready", "/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json",
    "/media/{name}",
}


def _flatten_routes(routes):
    for route in routes:
        nested = getattr(route, "original_router", None)
        if nested is not None:
            yield from _flatten_routes(nested.routes)
        else:
            yield route


def test_every_non_public_get_route_rejects_anonymous_requests(client):
    import re
    checked = []
    for route in _flatten_routes(app.routes):
        if "GET" not in (getattr(route, "methods", None) or ()) or route.path in PUBLIC_GET_PATHS:
            continue
        path = re.sub(r"\{[^}]+\}", "1", route.path)
        assert client.get(path).status_code == 401, route.path
        checked.append(route.path)
    assert len(checked) >= 15


def test_successful_login_does_not_clear_an_existing_lock(client, clock, db_session):
    register(client)
    fail(client, 5)
    login_throttle.release_login_attempt(db_session, "gate@example.com")
    assert login_throttle.lock_retry_after(db_session, "gate@example.com") > 0
    assert login(client).status_code == 429
    assert fail(client, 1) == [429]


def test_reservations_beyond_the_limit_are_rejected_before_verification(client, clock, db_session):
    register(client)
    for expected in range(1, login_throttle.LOCK_FAILURES + 1):
        assert login_throttle.reserve_login_attempt(db_session, "gate@example.com") == expected
    with pytest.raises(login_throttle.LoginRejected) as rejected:
        login_throttle.reserve_login_attempt(db_session, "gate@example.com")
    assert rejected.value.code == "login_locked" and rejected.value.retry_after > 0
    assert login(client).status_code == 429


def test_logout_revokes_the_old_refresh_token(client):
    register(client)
    tokens = login(client).json()
    assert client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
