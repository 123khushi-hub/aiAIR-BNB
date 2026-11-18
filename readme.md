# AI Trip War Room: Collaborative Group Itinerary Canvas & Real-Time Logistics Engine

**Delivery Track:** Track A — Full-Stack (Option C: Python FastAPI + SQLAlchemy + React)

## Overview
AI Trip War Room is a real-time multiplayer trip-planning canvas where co-travelers simultaneously pin accommodations and activities, resolve schedule clashes via live democratic voting, track exact per-person budget splits, and query a grounded Gemini AI Travel Concierge constrained by budget ceilings, dietary tags, operating hours, and 2 km Haversine proximity.

## System Architecture
- **Frontend (`frontend/`):** React + Tailwind CSS SPA (`src/App.jsx`) providing a day-by-day drag-and-drop itinerary canvas, live budget meter & split engine, group chat, presence indicators, and Gemini RAG Q&A panel[cite: 2].
- **Backend (`backend/main.py`):** FastAPI REST API + native WebSocket sync gateway with HS256 JWT authentication, 4-tier RBAC (`viewer`, `planner`, `leader`, `admin`), optimistic concurrency control (`position_version`), and deterministic AI constraint filtering[cite: 2].
- **Database Schema (SQLite / SQLAlchemy):**
  - `users` (`id`, `email`, `name`, `password_hash`, `role`)[cite: 2]
  - `trips` (`id`, `title`, `destination`, `dates`, `created_by`, `user_email`, `creator_email`, `trip_budget`)[cite: 2]
  - `venues` (`id`, `destination`, `name`, `category`, `price`, `dietary_tags`, `hours`, `lat`, `lng`, `rating`, `description`)[cite: 2]
  - `itinerary_items` (`id`, `trip_id`, `title`, `price`, `category`, `day`, `slot`, `status`, `pinned_by`, `position_version`)[cite: 2]
  - `votes` (`id`, `trip_id`, `item_id`, `user_name`)[cite: 2]
  - `chat_messages` (`id`, `trip_id`, `sender`, `text`, `is_ai`, `timestamp`)[cite: 2]
  - `interactions` (`id`, `user_email`, `trip_id`, `venue_title`, `destination`, `category`)[cite: 2]

## Setup & Run Instructions

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy pydantic google-genai pytest
set GEMINI_API_KEY=your_gemini_api_key
uvicorn main:app --host 0.0.0.0 --port 5000