import time
import statistics
from fastapi.testclient import TestClient
from main import app, evaluate_hard_constraints_and_ask

client = TestClient(app)


def run_benchmark():
    # 1. Non-AI REST API Latency (Target: P95 < 200 ms)
    api_latencies_ms = []
    for _ in range(30):
        t0 = time.perf_counter()
        res = client.get("/api/venues?destination=Goa")
        assert res.status_code == 200
        api_latencies_ms.append((time.perf_counter() - t0) * 1000)

    # 2. Board Sync Mutation Latency (Target: < 100 ms)
    trip = client.post("/api/trips", json={
        "title": "Benchmark Room",
        "destination": "Goa",
        "dates": "2026-11-20 to 2026-11-22",
        "user_name": "BenchLeader",
        "trip_budget": 25000
    }).json()
    room_id = trip["id"]

    sync_latencies_ms = []
    for i in range(20):
        t0 = time.perf_counter()
        res = client.post(f"/api/rooms/{room_id}/action", json={
            "action": "PIN_ITEM",
            "user_name": "BenchLeader",
            "title": f"Venue {i}",
            "price": 500,
            "day": 1,
            "slot": "Morning"
        })
        assert res.status_code == 200
        sync_latencies_ms.append((time.perf_counter() - t0) * 1000)

    # 3. AI Concierge Hard-Constraint + Grounded Response Latency (Target: P95 < 3000 ms)
    ai_latencies_ms = []
    for _ in range(10):
        t0 = time.perf_counter()
        reply = evaluate_hard_constraints_and_ask("vegan dinner under 1000 at 8pm", "Udaipur", [], 5000)
        assert "Ambrai" in reply
        ai_latencies_ms.append((time.perf_counter() - t0) * 1000)

    p95_api = sorted(api_latencies_ms)[int(len(api_latencies_ms) * 0.95)]
    p95_sync = sorted(sync_latencies_ms)[int(len(sync_latencies_ms) * 0.95)]
    p95_ai = sorted(ai_latencies_ms)[int(len(ai_latencies_ms) * 0.95)]

    print("=== AI TRIP WAR ROOM BENCHMARK REPORT ===")
    print(f"REST API P95 Latency   : {p95_api:.2f} ms  (Target: < 200 ms)")
    print(f"Board Sync P95 Latency : {p95_sync:.2f} ms  (Target: < 100 ms)")
    print(f"AI Concierge P95       : {p95_ai:.2f} ms  (Target: < 3000 ms)")
    print(f"Mean Sync Drift        : {statistics.mean(sync_latencies_ms):.2f} ms")


if __name__ == "__main__":
    run_benchmark()