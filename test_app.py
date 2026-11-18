import pytest
from fastapi.testclient import TestClient
from main import app, evaluate_hard_constraints_and_ask, compute_split_ledger, INITIAL_VENUES

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_jwt_auth_and_four_tier_rbac():
    # 1. Register Viewer, Planner, Leader, Admin
    viewer = client.post("/api/auth/unified", json={
        "name": "Viewer User",
        "email": "viewer_test@trip.com",
        "password": "secret",
        "role": "viewer"
    }).json()
    assert "access_token" in viewer
    assert viewer["role"] == "viewer"

    leader = client.post("/api/auth/unified", json={
        "name": "Leader User",
        "email": "leader_test@trip.com",
        "password": "secret",
        "role": "leader"
    }).json()
    assert leader["role"] == "leader"

    # 2. Viewer cannot create a trip (403 RBAC)
    denied_trip = client.post(
        "/api/trips",
        json={"title": "Blocked Trip", "destination": "Goa", "dates": "2026-11-20 to 2026-11-22", "user_name": "Viewer User"},
        headers={"Authorization": f"Bearer {viewer['access_token']}"}
    )
    assert denied_trip.status_code == 403

    # 3. Leader creates trip
    trip = client.post(
        "/api/trips",
        json={"title": "Goa Squad", "destination": "Goa", "dates": "2026-11-20 to 2026-11-22", "user_name": "Leader User", "trip_budget": 15000},
        headers={"Authorization": f"Bearer {leader['access_token']}"}
    ).json()
    room_id = trip["id"]

    # 4. Viewer cannot pin item to board (403 RBAC)
    denied_pin = client.post(
        f"/api/rooms/{room_id}/action",
        json={"action": "PIN_ITEM", "user_name": "Viewer User", "title": "Baga Beach", "price": 1500, "day": 1, "slot": "Morning"},
        headers={"Authorization": f"Bearer {viewer['access_token']}"}
    )
    assert denied_pin.status_code == 403


def test_board_state_machine_concurrency_and_voting():
    trip = client.post("/api/trips", json={
        "title": "Udaipur Royale",
        "destination": "Udaipur",
        "dates": "2026-12-01 to 2026-12-03",
        "user_name": "HostLeader",
        "trip_budget": 12000
    }).json()
    room_id = trip["id"]

    # Pin two items in Day 1 Morning to trigger slot clash
    s1 = client.post(f"/api/rooms/{room_id}/action", json={
        "action": "PIN_ITEM", "user_name": "HostLeader", "title": "City Palace Tour", "price": 400, "day": 1, "slot": "Morning"
    }).json()
    assert len(s1["items"]) == 1
    item1_id = s1["items"][0]["id"]

    s2 = client.post(f"/api/rooms/{room_id}/action", json={
        "action": "PIN_ITEM", "user_name": "CoPlanner", "title": "Lake Pichola Boat", "price": 600, "day": 1, "slot": "Morning"
    }).json()
    assert len(s2["items"]) == 2
    assert any("Slot clash detected" in c["text"] for c in s2["chats"])

    # Optimistic concurrency conflict check (stale expectedVersion)
    conflict = client.post(f"/api/rooms/{room_id}/action", json={
        "action": "MOVE_ITEM", "user_name": "CoPlanner", "itemId": item1_id, "targetDay": 2, "targetSlot": "Evening", "expectedVersion": 99
    })
    assert conflict.status_code == 409

    # Leader resolves contested slot vote
    resolved = client.post(f"/api/rooms/{room_id}/action", json={
        "action": "RESOLVE_VOTE", "user_name": "HostLeader", "winnerId": item1_id
    }).json()
    assert len(resolved["items"]) == 1
    assert resolved["items"][0]["status"] == "locked"


def test_budget_reconciliation_accuracy():
    even = compute_split_ledger(10000.0, ["Khushi", "Bhakti", "Riya", "Aarav"], mode="even")
    assert even["perPersonShares"] == {"Khushi": 2500.0, "Bhakti": 2500.0, "Riya": 2500.0, "Aarav": 2500.0}

    weighted = compute_split_ledger(10000.0, ["Khushi", "Bhakti"], mode="weighted", weights={"Khushi": 3, "Bhakti": 1})
    assert weighted["perPersonShares"]["Khushi"] == 7500.0
    assert weighted["perPersonShares"]["Bhakti"] == 2500.0


@pytest.mark.parametrize("prompt,dest,expected_keyword", [
    ("vegan dinner under 1000 at 8pm", "Udaipur", "Ambrai Waterfront Dinner"),
    ("vegetarian dining under 1000 at 1pm", "Manali", "Cafe 1947 Riverside"),
    ("seafood shack under 1200 at 6pm", "Goa", "Curlies Anjuna Sunset Shack"),
    ("gluten-free dinner under 1000 at 7pm", "Jaipur", "Chokhi Dhani Traditional Thali"),
    ("budget activity under 600 at 10am", "Jaipur", "Amber Fort"),
    ("activity under 500 at 11am", "Udaipur", "City Palace"),
    ("hotel under 6000", "Manali", "The Himalayan Resort"),
    ("luxury resort under 8000", "Goa", "Taj Fort Aguada"),
    ("palace hotel under 8500", "Jaipur", "Rambagh Palace"),
    ("watersports under 2000 at 11am", "Goa", "Baga Beach"),
    ("paragliding under 2000 at 10am", "Manali", "Solang Valley"),
    ("vegan meal under 200", "Udaipur", "No verified venues"),
    ("dinner at 3am under 1000", "Goa", "No verified venues"),
    ("halal meal under 500 at 9pm", "Goa", "No verified venues"),
    ("hotel under 1000", "Jaipur", "No verified venues"),
    ("vegetarian food under 900 at 8pm", "Udaipur", "Ambrai Waterfront Dinner"),
    ("dining under 800 at 2pm", "Manali", "Cafe 1947 Riverside"),
    ("sightseeing under 500 at 10am", "Udaipur", "City Palace"),
    ("beach shack under 950 at 5pm", "Goa", "Curlies Anjuna"),
    ("thali dinner under 1000 at 8pm", "Jaipur", "Chokhi Dhani"),
])
def test_ai_concierge_hard_constraint_compliance(prompt, dest, expected_keyword):
    reply = evaluate_hard_constraints_and_ask(prompt, dest, [], budget_limit=5000)
    assert expected_keyword.lower() in reply.lower()