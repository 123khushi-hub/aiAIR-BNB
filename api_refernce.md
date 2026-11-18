# API & WebSocket Event Reference

## 1. REST Endpoints

### Health & Maintenance
- **`GET /api/health`**
  - **Description:** Service health check returning status and UTC timestamp.
  - **Response (`200 OK`):** `{"status": "healthy", "timestamp": "2026-11-18T12:00:00Z"}`

### Authentication & RBAC
- **`POST /api/auth/unified`**
  - **Description:** Registers a new user or authenticates an existing user; issues a signed HS256 JWT (`access_token`) with role (`viewer`, `planner`, `leader`, `admin`).
  - **Request Body:** `{"name": "Khushi", "email": "user@example.com", "password": "secret", "role": "planner"}`
  - **Response (`200 OK`):** `{"id": "u_123abc", "email": "user@example.com", "name": "Khushi", "role": "planner", "access_token": "<jwt>", "token_type": "bearer"}`
- **`POST /api/auth/reset-password`**
  - **Description:** Resets password after verifying account email and display name.
  - **Request Body:** `{"email": "user@example.com", "name": "Khushi", "new_password": "new_secret"}`

### Venues & Catalog
- **`GET /api/venues?destination={city}`**
  - **Description:** Retrieves structured venue metadata (price, dietary tags, operating hours, lat/lng coordinates, rating) for a destination. Auto-populates new destinations if not yet seeded.
- **`POST /api/venues`**
  - **Description:** Authenticated endpoint to validate and add destination venue metadata (rejects `viewer` role with `403`, validates positive price, dietary vocabulary, `HH:MM-HH:MM` hours, and coordinates).
  - **Headers:** `Authorization: Bearer <access_token>`

### Trip Rooms & Recommendations
- **`POST /api/trips`**
  - **Description:** Creates a new collaborative Trip War Room (`title`, `destination`, `dates`, `user_name`, `trip_budget`).
- **`GET /api/trips`**
  - **Description:** Lists all Trip Rooms along with session analytics (`itemsPinned`, `messagesExchanged`, `aiInsights`).
- **`GET /api/trips/{trip_id}`**
  - **Description:** Retrieves metadata and budget ceiling for a specific Trip Room.
- **`GET /api/recommendations?email={email}`**
  - **Description:** Returns a ranked top-5 venue recommendation rail combining content rating and user destination interaction history.

### Real-Time Board State & Actions
- **`GET /api/rooms/{room_id}/state?user_name={name}`**
  - **Description:** Fetches live board items, chat history, vote counts, active presence list, effective RBAC role, and exact per-person budget split ledger.
- **`POST /api/rooms/{room_id}/action`**
  - **Description:** Executes atomic board mutations (`PIN_ITEM`, `MOVE_ITEM`, `DELETE_ITEM`, `CAST_VOTE`, `RESOLVE_VOTE`, `UPDATE_BUDGET`, `SEND_CHAT`, `AI_QUERY`) with server-side RBAC and optimistic concurrency (`expectedVersion`).

---

## 2. WebSocket Real-Time Gateway (`/ws/{room_id}/{user_name}`)

- **Authentication:** Optional `?token=<jwt>` query parameter validated at handshake; role enforced on every inbound action.
- **Inbound Actions:**
  - `PIN_ITEM` — Pins a venue/activity card to a day/slot and triggers automatic slot-clash detection.
  - `MOVE_ITEM` — Moves a card to a target day/slot; verifies `expectedVersion == position_version` (returns `CONCURRENT_CONFLICT` on mismatch).
  - `DELETE_ITEM` — Removes a drafting item (or locked item if `leader`/`admin`).
  - `CAST_VOTE` — Records a user vote on a contested slot and auto-locks on majority (`> 50%` active users).
  - `RESOLVE_VOTE` — Leader override to lock the winning item and clear competing slot options.
  - `UPDATE_BUDGET` — Leader action to update group budget ceiling.
  - `SEND_CHAT` — Broadcasts and persists squad chat messages.
  - `AI_QUERY` — Filters destination venues against hard constraints (budget, dietary tags, operating hours + 30-min buffer, 2 km Haversine proximity) and broadcasts a grounded Gemini AI response citing exact venue metadata IDs.
- **Outbound Events:** `INIT_DATA`, `PRESENCE_UPDATE`, `ITEM_PINNED`, `ITEM_MOVED`, `ITEM_DELETED`, `SLOT_CONFLICT_DETECTED`, `VOTES_UPDATED`, `AUTO_RESOLVED`, `VOTE_RESOLVED`, `BUDGET_UPDATED`, `NEW_CHAT`, `PERMISSION_DENIED`, `CONCURRENT_CONFLICT`.