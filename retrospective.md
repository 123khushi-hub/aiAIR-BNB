# Project Retrospective: AI Trip War Room

## 1. What Was Built
- **Real-Time Collaborative Trip Board (Epic 1):** Built a multiplayer day-by-day itinerary canvas in React and FastAPI supporting live item pinning, drag-and-drop scheduling across time blocks, optimistic concurrency control (`position_version`) to prevent silent overwrites, online presence tracking, live squad chat, and Leader slot locking/overrides[cite: 2].
- **Grounded AI Concierge & Logistics Engine (Epic 2):** Implemented deterministic hard-constraint filtering (budget ceiling, dietary tag matching, operating hours with a 30-minute travel buffer, and 2 km Haversine proximity) combined with weighted candidate ranking (40% proximity, 30% rating, 30% budget headroom) and Gemini AI response generation citing verified venue metadata IDs[cite: 2].
- **Conflict Detection & Democratic Voting:** Built automated slot-clash flagging when multiple items occupy the same day/slot, alongside live group voting with automatic majority resolution and Leader override controls[cite: 2].
- **Budget Reconciliation, Analytics & Security (Epic 3):** Implemented exact per-person even and weighted budget split calculations, session analytics per trip room, a hybrid content + destination-affinity recommendation rail, HS256 JWT authentication, and server-side 4-tier RBAC (`viewer`, `planner`, `leader`, `admin`)[cite: 2].
- **Automated Testing & Benchmarks:** Added a 24-test `pytest` suite (`test_app.py`) verifying RBAC, board state transitions, concurrency conflicts, budget math, and 20 AI constraint scenarios, plus a latency benchmark script (`benchmark.py`)[cite: 2].

## 2. Key Engineering Adaptations & Trade-offs
- **Dual WebSocket + HTTP Sync Gateway:** Deployed a hybrid WebSocket and HTTP state/action synchronization mechanism so live board updates, chat, presence, and voting remain responsive even in shared cloud reverse-proxy environments where long-lived WebSocket connections may be throttled[cite: 2].
- **Self-Healing SQLite Schema:** Added automatic startup column migrations and an administrative `/api/fix-db` endpoint to handle zero-downtime schema updates cleanly on lightweight single-node hosting without external database servers[cite: 2].
- **In-Memory Presence & Local Dataset Grounding:** Used lightweight server-side presence heartbeats and structured destination JSON/SQLite catalogs instead of third-party booking APIs to keep constraint matching deterministic, fast, and 100% testable[cite: 2].

## 3. What I Would Do Next With More Time
- Migrate persistence from SQLite to managed PostgreSQL with PostGIS spatial indexing and Redis pub/sub for horizontal multi-worker scaling.
- Add timed countdowns for contested-slot votes, undo/redo history on the canvas, and one-click PDF/ICS calendar itinerary exports.