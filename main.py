import os
import re
import json
import uuid
import math
import hmac
import base64
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from sqlalchemy import create_engine, Column, String, Float, Integer, Boolean, Text, ForeignKey, text
from sqlalchemy.orm import declarative_base, sessionmaker

try:
    from google import genai
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
except Exception:
    ai_client = None

JWT_SECRET = os.getenv("JWT_SECRET", "airbnb-trip-war-room-secret-key-2026")
JWT_EXPIRY_MINUTES = 60

DATABASE_URL = "sqlite:///./trip_war_room.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class DBUser(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="planner")


class DBTrip(Base):
    __tablename__ = "trips"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    dates = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    user_email = Column(String, default="")
    creator_email = Column(String, default="")
    trip_budget = Column(Float, default=20000.0)


class DBVenue(Base):
    __tablename__ = "venues"
    id = Column(String, primary_key=True, index=True)
    destination = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    dietary_tags = Column(Text, default='["all"]')
    hours = Column(String, default="09:00-22:00")
    lat = Column(Float, default=20.7144)
    lng = Column(Float, default=70.9874)
    rating = Column(Float, default=4.6)
    description = Column(Text, default="")


class DBItineraryItem(Base):
    __tablename__ = "itinerary_items"
    id = Column(String, primary_key=True, index=True)
    trip_id = Column(String, ForeignKey("trips.id"), index=True, nullable=False)
    title = Column(String, nullable=False)
    price = Column(Float, default=0.0)
    category = Column(String, default="activity")
    day = Column(Integer, default=1)
    slot = Column(String, default="Morning")
    status = Column(String, default="drafting")
    pinned_by = Column(String, default="Planner")
    position_version = Column(Integer, default=1)


class DBVote(Base):
    __tablename__ = "votes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, index=True, nullable=False)
    item_id = Column(String, index=True, nullable=False)
    user_name = Column(String, nullable=False)


class DBChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, index=True)
    trip_id = Column(String, index=True, nullable=False)
    sender = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    is_ai = Column(Boolean, default=False)
    timestamp = Column(String, default="")


class DBInteraction(Base):
    __tablename__ = "interactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String, index=True, nullable=False)
    trip_id = Column(String, default="")
    venue_title = Column(String, default="")
    destination = Column(String, nullable=False)
    category = Column(String, nullable=False)


Base.metadata.create_all(bind=engine)


def ensure_schema_columns():
    migrations = [
        "ALTER TABLE trips ADD COLUMN creator_email TEXT DEFAULT ''",
        "ALTER TABLE trips ADD COLUMN trip_budget REAL DEFAULT 20000.0",
        "ALTER TABLE trips ADD COLUMN user_email TEXT DEFAULT ''",
        "ALTER TABLE venues ADD COLUMN lat REAL DEFAULT 20.7144",
        "ALTER TABLE venues ADD COLUMN lng REAL DEFAULT 70.9874",
        "ALTER TABLE venues ADD COLUMN rating REAL DEFAULT 4.6",
        "ALTER TABLE venues ADD COLUMN description TEXT DEFAULT ''",
        "ALTER TABLE itinerary_items ADD COLUMN position_version INTEGER DEFAULT 1",
        "ALTER TABLE itinerary_items ADD COLUMN pinned_by TEXT DEFAULT 'Planner'",
        "ALTER TABLE itinerary_items ADD COLUMN status TEXT DEFAULT 'drafting'",
        "ALTER TABLE chat_messages ADD COLUMN is_ai BOOLEAN DEFAULT 0",
        "ALTER TABLE chat_messages ADD COLUMN timestamp TEXT DEFAULT ''",
        "ALTER TABLE interactions ADD COLUMN trip_id TEXT DEFAULT ''",
        "ALTER TABLE interactions ADD COLUMN venue_title TEXT DEFAULT ''",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass


ensure_schema_columns()

INITIAL_VENUES = [
    {"id": "g1", "destination": "Goa", "name": "Taj Fort Aguada Resort", "category": "hotel", "price": 7500, "dietary_tags": ["all"], "hours": "12:00-23:59", "lat": 15.4926, "lng": 73.7736, "rating": 4.9, "description": "Luxury beachfront resort overlooking Sinquerim beach."},
    {"id": "g2", "destination": "Goa", "name": "Baga Beach Watersports", "category": "activity", "price": 1500, "dietary_tags": ["all"], "hours": "09:00-18:00", "lat": 15.5553, "lng": 73.7517, "rating": 4.6, "description": "Parasailing, jet skiing, and banana boat rides."},
    {"id": "g3", "destination": "Goa", "name": "Curlies Anjuna Sunset Shack", "category": "dining", "price": 900, "dietary_tags": ["seafood", "vegetarian"], "hours": "11:00-23:00", "lat": 15.5736, "lng": 73.7408, "rating": 4.5, "description": "Famous beachfront shack for fresh seafood and sunset view."},
    {"id": "u1", "destination": "Udaipur", "name": "Taj Lake Palace Stay", "category": "hotel", "price": 6000, "dietary_tags": ["all"], "hours": "12:00-23:59", "lat": 24.5754, "lng": 73.6800, "rating": 4.9, "description": "Iconic marble palace floating on Lake Pichola."},
    {"id": "u2", "destination": "Udaipur", "name": "City Palace Guided Tour", "category": "activity", "price": 400, "dietary_tags": ["all"], "hours": "09:30-17:30", "lat": 24.5764, "lng": 73.6835, "rating": 4.8, "description": "Royal courtyards & historic armory."},
    {"id": "u3", "destination": "Udaipur", "name": "Ambrai Waterfront Dinner", "category": "dining", "price": 850, "dietary_tags": ["vegetarian", "vegan"], "hours": "19:00-23:00", "lat": 24.5782, "lng": 73.6789, "rating": 4.7, "description": "Candlelight dinner by the lake facing illuminated palace."},
    {"id": "m1", "destination": "Manali", "name": "The Himalayan Resort & Spa", "category": "hotel", "price": 5500, "dietary_tags": ["all"], "hours": "12:00-23:59", "lat": 32.2530, "lng": 77.1887, "rating": 4.8, "description": "Victorian gothic style luxury resort surrounded by apple orchards."},
    {"id": "m2", "destination": "Manali", "name": "Solang Valley Paragliding & Snow", "category": "activity", "price": 1800, "dietary_tags": ["all"], "hours": "09:00-17:00", "lat": 32.3161, "lng": 77.1574, "rating": 4.7, "description": "Adventure sports, ropeway, and snow activities."},
    {"id": "m3", "destination": "Manali", "name": "Cafe 1947 Riverside", "category": "dining", "price": 750, "dietary_tags": ["vegetarian", "vegan", "gluten-free"], "hours": "12:00-23:00", "lat": 32.2635, "lng": 77.1752, "rating": 4.6, "description": "Live music and Italian/Indian dining beside Manalsu river."},
    {"id": "j1", "destination": "Jaipur", "name": "Rambagh Palace Heritage Stay", "category": "hotel", "price": 8000, "dietary_tags": ["all"], "hours": "12:00-23:59", "lat": 26.8980, "lng": 75.8082, "rating": 4.9, "description": "Royal Rajput palace with lush Mughal gardens."},
    {"id": "j2", "destination": "Jaipur", "name": "Amber Fort & Elephant Village", "category": "activity", "price": 500, "dietary_tags": ["all"], "hours": "08:00-17:30", "lat": 26.9855, "lng": 75.8513, "rating": 4.8, "description": "Historic hilltop fort and Sheesh Mahal tour."},
    {"id": "j3", "destination": "Jaipur", "name": "Chokhi Dhani Traditional Thali", "category": "dining", "price": 950, "dietary_tags": ["vegetarian", "gluten-free"], "hours": "17:00-23:00", "lat": 26.7688, "lng": 75.8364, "rating": 4.7, "description": "Authentic Rajasthani village dining and folk performances."}
]


def seed_initial_venues():
    db = SessionLocal()
    try:
        if db.query(DBVenue).count() == 0:
            for item in INITIAL_VENUES:
                db.add(DBVenue(
                    id=item["id"],
                    destination=item["destination"],
                    name=item["name"],
                    category=item["category"],
                    price=item["price"],
                    dietary_tags=json.dumps(item["dietary_tags"]),
                    hours=item["hours"],
                    lat=item["lat"],
                    lng=item["lng"],
                    rating=item["rating"],
                    description=item["description"]
                ))
            db.commit()
    finally:
        db.close()


seed_initial_venues()

app = FastAPI(title="AI Trip War Room API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_trip_prefix(request: Request, call_next):
    if request.url.path.startswith("/trip"):
        new_path = request.url.path[5:] or "/"
        request.scope["path"] = new_path
    return await call_next(request)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_jwt_token(user_id: str, email: str, role: str) -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    exp = int((datetime.utcnow() + timedelta(minutes=JWT_EXPIRY_MINUTES)).timestamp())
    payload = _b64url_encode(json.dumps({"sub": user_id, "email": email, "role": role, "exp": exp}).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url_encode(sig)}"


def verify_jwt_token(token: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed JWT")
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = _b64url_encode(hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig_b64, expected_sig):
            raise ValueError("Invalid JWT signature")
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(datetime.utcnow().timestamp()):
            raise ValueError("JWT token expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Unauthorized: {str(exc)}")


def get_optional_jwt_claims(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return verify_jwt_token(authorization.split(" ", 1)[1].strip())
    return verify_jwt_token(authorization.strip())


def resolve_effective_role(db, trip: Optional[DBTrip], user_name: str, jwt_claims: Optional[dict] = None) -> str:
    if jwt_claims and jwt_claims.get("role") in {"viewer", "planner", "leader", "admin"}:
        claim_role = jwt_claims["role"]
        if claim_role in {"viewer", "admin"}:
            return claim_role
    db_user = db.query(DBUser).filter(DBUser.name.ilike(user_name.strip())).first()
    if db_user and db_user.role in {"viewer", "admin"}:
        return db_user.role
    if trip and trip.created_by.strip().lower() == user_name.strip().lower():
        return "leader"
    return "planner"


def compute_split_ledger(total_cost: float, active_users: List[str], mode: str = "even", weights: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    members = active_users if active_users else ["Organizer"]
    n = len(members)
    if mode == "weighted" and weights:
        total_weight = sum(max(float(weights.get(m, 0)), 0.0) for m in members)
        if total_weight > 0:
            shares = {m: round((max(float(weights.get(m, 0)), 0.0) / total_weight) * total_cost, 2) for m in members}
        else:
            even = round(total_cost / n, 2)
            shares = {m: even for m in members}
    else:
        even = round(total_cost / n, 2)
        shares = {m: even for m in members}
    return {"totalCost": round(total_cost, 2), "memberCount": n, "perPersonShares": shares}


class UnifiedAuthRequest(BaseModel):
    name: Optional[str] = None
    email: str
    password: str
    role: Optional[str] = "planner"


class ResetPasswordRequest(BaseModel):
    email: str
    name: str
    new_password: str


class CreateTripRequest(BaseModel):
    title: str
    destination: str
    dates: str
    user_name: str
    user_email: Optional[str] = ""
    trip_budget: float = 20000.0


class VenueUploadRequest(BaseModel):
    destination: str
    name: str
    category: str
    price: float = Field(..., gt=0)
    dietary_tags: List[str]
    hours: str
    lat: float = 20.7144
    lng: float = 70.9874
    rating: float = 4.6
    description: str


def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return r * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def is_open_at_hour(hours_str: str, requested_hour: Optional[int], buffer_mins: int = 30) -> bool:
    if requested_hour is None or "-" not in hours_str:
        return True
    try:
        open_s, close_s = hours_str.split("-")
        oh, om = map(int, open_s.split(":"))
        ch, cm = map(int, close_s.split(":"))
        req_mins = requested_hour * 60
        open_mins = oh * 60 + om
        close_mins = ch * 60 + cm
        return (open_mins <= req_mins) and (req_mins + buffer_mins <= close_mins)
    except Exception:
        return True


def evaluate_hard_constraints_and_ask(prompt: str, dest: str, current_items: list, budget_limit: float = 5000) -> str:
    db = SessionLocal()
    try:
        venues = db.query(DBVenue).filter(DBVenue.destination.ilike(f"%{dest}%")).all()

        budget_match = re.search(r"(\d{3,5})", prompt)
        effective_budget = float(budget_match.group(1)) if budget_match else budget_limit

        dietary_filter = None
        for tag in ["vegan", "vegetarian", "seafood", "halal", "gluten-free"]:
            if tag in prompt.lower():
                dietary_filter = tag
                break

        requested_hour = None
        time_match = re.search(r"(\d{1,2})\s*(am|pm)", prompt.lower())
        if time_match:
            hr = int(time_match.group(1))
            mer = time_match.group(2)
            if mer == "pm" and hr != 12:
                hr += 12
            elif mer == "am" and hr == 12:
                hr = 0
            requested_hour = hr

        anchor_venue = None
        if "near" in prompt.lower() and current_items:
            anchor_title = current_items[-1].title
            anchor_venue = next((v for v in venues if v.name.lower() == anchor_title.lower()), None)

        valid_venues = []
        for v in venues:
            tags = json.loads(v.dietary_tags)
            if v.price > effective_budget:
                continue
            if dietary_filter and dietary_filter not in tags and "all" not in tags:
                continue
            if not is_open_at_hour(v.hours, requested_hour):
                continue

            dist_km = 0.5
            if anchor_venue:
                dist_km = haversine_km(anchor_venue.lat, anchor_venue.lng, v.lat, v.lng)
                if dist_km > 2.0:
                    continue

            prox_score = max(0.0, (2.0 - dist_km) / 2.0) * 40
            rating_score = (v.rating / 5.0) * 30
            headroom_score = max(0.0, (effective_budget - v.price) / max(effective_budget, 1)) * 30
            total_score = round(prox_score + rating_score + headroom_score, 2)

            valid_venues.append({
                "id": v.id,
                "name": v.name,
                "category": v.category,
                "price": v.price,
                "dietary": tags,
                "hours": v.hours,
                "distance_km": round(dist_km, 2),
                "rank_score": total_score,
                "desc": v.description
            })

        valid_venues.sort(key=lambda x: x["rank_score"], reverse=True)
        current_titles = [i.title for i in current_items]

        if not valid_venues:
            return f"No verified venues in {dest} matched all active hard constraints (Budget <= INR {int(effective_budget)}, Dietary: {dietary_filter or 'any'}, Time: {requested_hour or 'any'})."

        if not ai_client:
            top = valid_venues[0]
            return (
                f"[Metadata Citation: {top['name']} ({top['id']})] "
                f"{top['name']} satisfies all hard constraints (INR {top['price']}, Hours: {top['hours']}, "
                f"Tags: {top['dietary']}, Score: {top['rank_score']})."
            )

        try:
            context_str = json.dumps(valid_venues, indent=2)
            sys_prompt = (
                f"You are the official AI Travel Concierge for an Airbnb Trip War Room in {dest}. "
                f"ONLY recommend from these strictly filtered, valid venues: {context_str}. "
                f"Never invent venues, prices, or hours. Always cite exact venue metadata ID and name. "
                f"Current active pins: {current_titles}. User question: {prompt}"
            )
            resp = ai_client.models.generate_content(model="gemini-2.5-flash", contents=sys_prompt)
            return resp.text
        except Exception:
            top = valid_venues[0]
            return f"[Metadata Citation: {top['name']} ({top['id']})] Grounded suggestion: {top['name']} (INR {top['price']}, Hours: {top['hours']})."
    finally:
        db.close()


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/fix-db")
def fix_legacy_tables():
    with engine.connect() as conn:
        for tbl in ["itinerary_items", "chat_messages", "votes", "interactions"]:
            conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    return {"status": "FIXED_CLEAN_TABLES"}


@app.post("/api/auth/unified")
def unified_auth(payload: UnifiedAuthRequest):
    db = SessionLocal()
    try:
        email_clean = payload.email.strip().lower()
        pw_hash = hash_password(payload.password.strip())
        existing = db.query(DBUser).filter(DBUser.email == email_clean).first()

        if existing:
            if existing.password_hash != pw_hash:
                raise HTTPException(status_code=401, detail="Invalid password for this account.")
            token = create_jwt_token(existing.id, existing.email, existing.role)
            return {
                "id": existing.id,
                "email": existing.email,
                "name": existing.name,
                "role": existing.role,
                "access_token": token,
                "token_type": "bearer"
            }

        requested_role = (payload.role or "planner").strip().lower()
        if requested_role not in {"viewer", "planner", "leader", "admin"}:
            requested_role = "planner"

        display_name = (payload.name or email_clean.split("@")[0]).strip()
        new_user = DBUser(
            id="u_" + str(uuid.uuid4())[:6],
            email=email_clean,
            name=display_name,
            password_hash=pw_hash,
            role=requested_role
        )
        db.add(new_user)
        db.commit()
        token = create_jwt_token(new_user.id, new_user.email, new_user.role)
        return {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
            "access_token": token,
            "token_type": "bearer"
        }
    finally:
        db.close()


@app.post("/api/auth/reset-password")
def reset_password(payload: ResetPasswordRequest):
    db = SessionLocal()
    try:
        user = db.query(DBUser).filter(DBUser.email == payload.email.strip().lower()).first()
        if not user or user.name.strip().lower() != payload.name.strip().lower():
            raise HTTPException(status_code=404, detail="Account verification failed. Check email and name.")
        user.password_hash = hash_password(payload.new_password.strip())
        db.commit()
        return {"message": "Password updated successfully. Please log in."}
    finally:
        db.close()


@app.get("/api/venues")
def list_venues(destination: Optional[str] = None):
    db = SessionLocal()
    try:
        q = db.query(DBVenue)
        if destination:
            clean_dest = destination.strip()
            venues = q.filter(DBVenue.destination.ilike(f"%{clean_dest}%")).all()

            if not venues and len(clean_dest) >= 2:
                ai_venues = []
                if ai_client:
                    try:
                        prompt = (
                            f"Generate 6 real, popular travel venues in {clean_dest} (2 hotels, 2 sightseeing activities, 2 dining spots). "
                            f"Return ONLY a valid JSON array with exact keys: "
                            f"name (string), category ('hotel' | 'activity' | 'dining'), price (number in INR), "
                            f"dietary_tags (array from ['all','vegetarian','vegan','seafood','halal','gluten-free']), "
                            f"hours (string like '09:00-22:00'), lat (float), lng (float), rating (float 4.2-4.9), description (short string)."
                        )
                        resp = ai_client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
                        raw_json = resp.text.strip()
                        if raw_json.startswith("```"):
                            raw_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_json, flags=re.DOTALL).strip()
                        ai_venues = json.loads(raw_json)
                    except Exception:
                        ai_venues = []

                if not ai_venues:
                    city_title = clean_dest.title()
                    ai_venues = [
                        {"name": f"{city_title} Grand Beach & Heritage Resort", "category": "hotel", "price": 4500, "dietary_tags": ["all"], "hours": "12:00-23:59", "rating": 4.7, "description": f"Top-rated luxury stay with scenic views in {city_title}."},
                        {"name": f"{city_title} Boutique Inn", "category": "hotel", "price": 2200, "dietary_tags": ["all"], "hours": "12:00-23:59", "rating": 4.5, "description": f"Comfortable central stay near major attractions in {city_title}."},
                        {"name": f"{city_title} Fort & Sunset Point Tour", "category": "activity", "price": 500, "dietary_tags": ["all"], "hours": "09:00-18:30", "rating": 4.8, "description": f"Guided sightseeing tour covering iconic landmarks of {city_title}."},
                        {"name": f"{city_title} Beachfront Adventure & Watersports", "category": "activity", "price": 1200, "dietary_tags": ["all"], "hours": "10:00-17:30", "rating": 4.6, "description": f"Exciting outdoor activities and coastal exploration in {city_title}."},
                        {"name": f"The {city_title} Coastal Kitchen", "category": "dining", "price": 800, "dietary_tags": ["vegetarian", "seafood"], "hours": "11:30-23:00", "rating": 4.7, "description": f"Popular local eatery serving authentic {city_title} specialties."},
                        {"name": f"{city_title} Garden Cafe & Grill", "category": "dining", "price": 600, "dietary_tags": ["vegetarian", "vegan", "gluten-free"], "hours": "10:00-22:30", "rating": 4.6, "description": f"Relaxed cafe with multi-cuisine and healthy options in {city_title}."}
                    ]

                for item in ai_venues[:6]:
                    new_v = DBVenue(
                        id="ai_" + str(uuid.uuid4())[:6],
                        destination=clean_dest.title(),
                        name=item.get("name", f"{clean_dest.title()} Spot"),
                        category=item.get("category", "activity").lower(),
                        price=float(item.get("price", 1000)),
                        dietary_tags=json.dumps(item.get("dietary_tags", ["all"])),
                        hours=item.get("hours", "09:00-21:00"),
                        lat=float(item.get("lat", 20.7144)),
                        lng=float(item.get("lng", 70.9874)),
                        rating=float(item.get("rating", 4.6)),
                        description=item.get("description", f"Popular spot in {clean_dest.title()}")
                    )
                    db.add(new_v)
                db.commit()
                venues = db.query(DBVenue).filter(DBVenue.destination.ilike(f"%{clean_dest}%")).all()
        else:
            venues = q.all()

        return [
            {
                "id": v.id,
                "destination": v.destination,
                "title": v.name,
                "category": v.category,
                "price": v.price,
                "tags": json.loads(v.dietary_tags),
                "time": v.hours,
                "lat": v.lat,
                "lng": v.lng,
                "rating": v.rating,
                "desc": v.description
            }
            for v in venues
        ]
    finally:
        db.close()


@app.post("/api/venues")
def upload_venue(payload: VenueUploadRequest, authorization: Optional[str] = Header(default=None)):
    claims = get_optional_jwt_claims(authorization)
    if claims and claims.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="RBAC Denied: Viewer role cannot upload venues.")

    allowed_tags = {"all", "vegetarian", "vegan", "seafood", "halal", "gluten-free"}
    cleaned_tags = [t.lower().strip() for t in payload.dietary_tags if t.strip()]
    if not cleaned_tags or not set(cleaned_tags).issubset(allowed_tags):
        raise HTTPException(status_code=400, detail=f"Invalid dietary tags. Allowed: {sorted(list(allowed_tags))}")

    if not re.match(r"^\d{2}:\d{2}-\d{2}:\d{2}$", payload.hours.strip()):
        raise HTTPException(status_code=400, detail="Hours must follow HH:MM-HH:MM format.")

    if not (-90 <= payload.lat <= 90 and -180 <= payload.lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid geographic coordinates.")

    db = SessionLocal()
    try:
        new_v = DBVenue(
            id="v_" + str(uuid.uuid4())[:6],
            destination=payload.destination.strip().title(),
            name=payload.name.strip(),
            category=payload.category.strip().lower(),
            price=payload.price,
            dietary_tags=json.dumps(cleaned_tags),
            hours=payload.hours.strip(),
            lat=payload.lat,
            lng=payload.lng,
            rating=payload.rating,
            description=payload.description.strip()
        )
        db.add(new_v)
        db.commit()
        return {
            "id": new_v.id,
            "destination": new_v.destination,
            "title": new_v.name,
            "category": new_v.category,
            "price": new_v.price
        }
    finally:
        db.close()


@app.post("/api/trips")
def create_trip(payload: CreateTripRequest, authorization: Optional[str] = Header(default=None)):
    claims = get_optional_jwt_claims(authorization)
    if claims and claims.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="RBAC Denied: Viewer role cannot create trips.")

    db = SessionLocal()
    try:
        trip_id = "trip_" + str(uuid.uuid4())[:6]
        user_email_clean = (payload.user_email or "").strip().lower()
        new_trip = DBTrip(
            id=trip_id,
            title=payload.title.strip(),
            destination=payload.destination.strip().title(),
            dates=payload.dates.strip(),
            created_by=payload.user_name.strip(),
            user_email=user_email_clean,
            creator_email=user_email_clean,
            trip_budget=payload.trip_budget
        )
        db.add(new_trip)
        db.commit()
        try:
            if user_email_clean:
                db.add(DBInteraction(
                    user_email=user_email_clean,
                    trip_id=trip_id,
                    venue_title=payload.title.strip(),
                    destination=payload.destination.strip().title(),
                    category="trip_created"
                ))
                db.commit()
        except Exception:
            db.rollback()
        return {
            "id": new_trip.id,
            "title": new_trip.title,
            "destination": new_trip.destination,
            "dates": new_trip.dates,
            "created_by": new_trip.created_by,
            "trip_budget": new_trip.trip_budget
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not create trip: {str(e)}")
    finally:
        db.close()


@app.get("/api/trips")
def list_trips(email: Optional[str] = None):
    db = SessionLocal()
    try:
        trips = db.query(DBTrip).all()
        result = []
        for t in trips:
            pins = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == t.id).count()
            msgs = db.query(DBChatMessage).filter(DBChatMessage.trip_id == t.id, DBChatMessage.is_ai == False).count()
            ai_logs = db.query(DBChatMessage).filter(DBChatMessage.trip_id == t.id, DBChatMessage.is_ai == True).count()
            result.append({
                "id": t.id,
                "title": t.title,
                "destination": t.destination,
                "dates": t.dates,
                "created_by": t.created_by,
                "trip_budget": t.trip_budget,
                "analytics": {
                    "itemsPinned": pins,
                    "messagesExchanged": msgs,
                    "aiInsights": ai_logs
                }
            })
        return result
    finally:
        db.close()


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: str):
    db = SessionLocal()
    try:
        t = db.query(DBTrip).filter(DBTrip.id == trip_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Trip room not found")
        return {
            "id": t.id,
            "title": t.title,
            "destination": t.destination,
            "dates": t.dates,
            "created_by": t.created_by,
            "trip_budget": t.trip_budget
        }
    finally:
        db.close()


@app.get("/api/recommendations")
def get_recommendations(email: Optional[str] = None):
    db = SessionLocal()
    try:
        venues = db.query(DBVenue).all()
        user_dests = set()
        if email:
            interactions = db.query(DBInteraction).filter(DBInteraction.user_email == email.lower()).all()
            user_dests = {i.destination.lower() for i in interactions}

        scored = []
        for v in venues:
            affinity_boost = 0.5 if v.destination.lower() in user_dests else 0.0
            score = v.rating + affinity_boost
            reason = "Matches your squad's destination history" if affinity_boost > 0 else "Top-rated group pick"
            scored.append((score, {
                "id": v.id,
                "destination": v.destination,
                "title": v.name,
                "category": v.category,
                "price": v.price,
                "rating": v.rating,
                "reason": reason
            }))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:5]]
    finally:
        db.close()


class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[Dict[str, Any]]] = {}

    async def connect(self, room_id: str, user_name: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append({"user": user_name, "ws": websocket})

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id] = [c for c in self.rooms[room_id] if c["ws"] != websocket]

    def get_active_users(self, room_id: str) -> List[str]:
        return list(dict.fromkeys([c["user"] for c in self.rooms.get(room_id, [])]))

    async def broadcast(self, room_id: str, payload: dict):
        for conn in list(self.rooms.get(room_id, [])):
            try:
                await conn["ws"].send_json(payload)
            except Exception:
                pass


manager = ConnectionManager()


def serialize_item(item: DBItineraryItem) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "price": item.price,
        "category": item.category,
        "day": item.day,
        "slot": item.slot,
        "status": item.status,
        "pinnedBy": item.pinned_by,
        "positionVersion": item.position_version
    }


def serialize_chat(msg: DBChatMessage) -> dict:
    return {
        "id": msg.id,
        "sender": msg.sender,
        "text": msg.text,
        "isAi": msg.is_ai,
        "timestamp": msg.timestamp
    }


def get_votes_map(db, room_id: str) -> Dict[str, int]:
    rows = db.query(DBVote).filter(DBVote.trip_id == room_id).all()
    counts: Dict[str, int] = {}
    for r in rows:
        counts[r.item_id] = counts.get(r.item_id, 0) + 1
    return counts


ROOM_PRESENCE: Dict[str, Dict[str, float]] = {}


def touch_presence(room_id: str, user_name: str):
    now = datetime.utcnow().timestamp()
    room_map = ROOM_PRESENCE.setdefault(room_id, {})
    room_map[user_name] = now
    stale = [u for u, ts in room_map.items() if now - ts > 15]
    for u in stale:
        del room_map[u]
    ws_users = manager.get_active_users(room_id)
    return list(dict.fromkeys(list(room_map.keys()) + ws_users))


class RoomActionRequest(BaseModel):
    action: str
    user_name: str
    title: Optional[str] = "Activity"
    price: Optional[float] = 0.0
    category: Optional[str] = "activity"
    day: Optional[int] = 1
    slot: Optional[str] = "Morning"
    itemId: Optional[str] = None
    targetDay: Optional[int] = None
    targetSlot: Optional[str] = None
    expectedVersion: Optional[int] = 1
    winnerId: Optional[str] = None
    tripBudget: Optional[float] = None
    text: Optional[str] = ""


@app.get("/api/rooms/{room_id}/state")
def get_room_state(room_id: str, user_name: str = "Planner", authorization: Optional[str] = Header(default=None)):
    claims = get_optional_jwt_claims(authorization)
    db = SessionLocal()
    try:
        clean_user = user_name.strip() or "Planner"
        active_users = touch_presence(room_id, clean_user)
        trip = db.query(DBTrip).filter(DBTrip.id == room_id).first()
        role = resolve_effective_role(db, trip, clean_user, claims)
        items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
        chats = db.query(DBChatMessage).filter(DBChatMessage.trip_id == room_id).all()
        votes_map = get_votes_map(db, room_id)
        total_cost = sum(float(i.price or 0) for i in items)
        return {
            "items": [serialize_item(i) for i in items],
            "chats": [serialize_chat(c) for c in chats],
            "votes": votes_map,
            "activeUsers": active_users,
            "yourRole": role,
            "tripBudget": trip.trip_budget if trip else 20000,
            "splitLedger": compute_split_ledger(total_cost, active_users)
        }
    finally:
        db.close()


@app.post("/api/rooms/{room_id}/action")
async def execute_room_action(room_id: str, payload: RoomActionRequest, authorization: Optional[str] = Header(default=None)):
    claims = get_optional_jwt_claims(authorization)
    db = SessionLocal()
    try:
        user_name = payload.user_name.strip() or "Planner"
        touch_presence(room_id, user_name)
        trip = db.query(DBTrip).filter(DBTrip.id == room_id).first()
        role = resolve_effective_role(db, trip, user_name, claims)
        action = payload.action

        if role == "viewer" and action in {"PIN_ITEM", "MOVE_ITEM", "DELETE_ITEM", "CAST_VOTE", "RESOLVE_VOTE", "UPDATE_BUDGET"}:
            raise HTTPException(status_code=403, detail="RBAC Denied: Viewer role is read-only.")

        if action == "PIN_ITEM":
            new_item = DBItineraryItem(
                id="it_" + str(uuid.uuid4())[:6],
                trip_id=room_id,
                title=payload.title or "Activity",
                price=float(payload.price or 0),
                category=payload.category or "activity",
                day=int(payload.day or 1),
                slot=payload.slot or "Morning",
                status="drafting",
                pinned_by=user_name,
                position_version=1
            )
            db.add(new_item)
            db.commit()
            await manager.broadcast(room_id, {"type": "ITEM_PINNED", "item": serialize_item(new_item)})

            slot_items = db.query(DBItineraryItem).filter(
                DBItineraryItem.trip_id == room_id,
                DBItineraryItem.day == new_item.day,
                DBItineraryItem.slot == new_item.slot
            ).all()
            if len(slot_items) > 1:
                conflict_msg = DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender="Conflict Detector",
                    text=f"Slot clash detected on Day {new_item.day} ({new_item.slot}). Cast votes to resolve!",
                    is_ai=False,
                    timestamp=datetime.utcnow().isoformat()
                )
                db.add(conflict_msg)
                db.commit()

        elif action == "MOVE_ITEM":
            item = db.query(DBItineraryItem).filter(DBItineraryItem.id == payload.itemId).first()
            if not item:
                raise HTTPException(status_code=404, detail="Item not found")
            if item.status == "locked" and role not in {"leader", "admin"}:
                raise HTTPException(status_code=403, detail="Only Leader can move locked items.")
            if payload.expectedVersion is not None and int(payload.expectedVersion) != item.position_version:
                raise HTTPException(status_code=409, detail="Concurrent move conflict: item version changed.")
            item.day = int(payload.targetDay or item.day)
            item.slot = payload.targetSlot or item.slot
            item.position_version += 1
            db.commit()

        elif action == "DELETE_ITEM":
            item = db.query(DBItineraryItem).filter(DBItineraryItem.id == payload.itemId).first()
            if item:
                if item.status == "locked" and role not in {"leader", "admin"}:
                    raise HTTPException(status_code=403, detail="Only Leader can delete locked items.")
                db.delete(item)
                db.commit()

        elif action == "CAST_VOTE":
            existing_vote = db.query(DBVote).filter(
                DBVote.trip_id == room_id,
                DBVote.item_id == payload.itemId,
                DBVote.user_name == user_name
            ).first()
            if not existing_vote:
                db.add(DBVote(trip_id=room_id, item_id=payload.itemId, user_name=user_name))
                db.commit()

            votes_map = get_votes_map(db, room_id)
            active_count = max(len(touch_presence(room_id, user_name)), 1)
            if votes_map.get(payload.itemId, 0) > active_count / 2:
                winner = db.query(DBItineraryItem).filter(DBItineraryItem.id == payload.itemId).first()
                if winner:
                    losers = db.query(DBItineraryItem).filter(
                        DBItineraryItem.trip_id == room_id,
                        DBItineraryItem.day == winner.day,
                        DBItineraryItem.slot == winner.slot,
                        DBItineraryItem.id != winner.id
                    ).all()
                    for loser in losers:
                        db.delete(loser)
                    winner.status = "locked"
                    db.add(DBChatMessage(
                        id="msg_" + str(uuid.uuid4())[:6],
                        trip_id=room_id,
                        sender="Voting Engine",
                        text=f"Majority vote locked '{winner.title}' for Day {winner.day} ({winner.slot}).",
                        is_ai=False,
                        timestamp=datetime.utcnow().isoformat()
                    ))
                    db.commit()

        elif action == "RESOLVE_VOTE":
            if role not in {"leader", "admin"}:
                raise HTTPException(status_code=403, detail="Only Leader can lock slots.")
            winner = db.query(DBItineraryItem).filter(DBItineraryItem.id == payload.winnerId).first()
            if winner:
                losers = db.query(DBItineraryItem).filter(
                    DBItineraryItem.trip_id == room_id,
                    DBItineraryItem.day == winner.day,
                    DBItineraryItem.slot == winner.slot,
                    DBItineraryItem.id != winner.id
                ).all()
                for loser in losers:
                    db.delete(loser)
                winner.status = "locked"
                db.add(DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender="Host Action",
                    text=f"Leader finalized '{winner.title}' on Day {winner.day} ({winner.slot}).",
                    is_ai=False,
                    timestamp=datetime.utcnow().isoformat()
                ))
                db.commit()

        elif action == "UPDATE_BUDGET":
            if role not in {"leader", "admin"}:
                raise HTTPException(status_code=403, detail="Only Leader can update budget.")
            new_budget = float(payload.tripBudget or 20000)
            if trip:
                trip.trip_budget = new_budget
            db.add(DBChatMessage(
                id="msg_" + str(uuid.uuid4())[:6],
                trip_id=room_id,
                sender="Host Action",
                text=f"Group budget updated to INR {int(new_budget):,}.",
                is_ai=False,
                timestamp=datetime.utcnow().isoformat()
            ))
            db.commit()

        elif action == "SEND_CHAT":
            db.add(DBChatMessage(
                id="msg_" + str(uuid.uuid4())[:6],
                trip_id=room_id,
                sender=user_name,
                text=payload.text or "",
                is_ai=False,
                timestamp=datetime.utcnow().isoformat()
            ))
            db.commit()

        elif action == "AI_QUERY":
            question = payload.text or ""
            db.add(DBChatMessage(
                id="msg_" + str(uuid.uuid4())[:6],
                trip_id=room_id,
                sender=user_name,
                text=question,
                is_ai=False,
                timestamp=datetime.utcnow().isoformat()
            ))
            db.commit()
            current_items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
            dest = trip.destination if trip else "Goa"
            budget = trip.trip_budget if trip else 5000
            ai_reply = evaluate_hard_constraints_and_ask(question, dest, current_items, budget)
            db.add(DBChatMessage(
                id="msg_" + str(uuid.uuid4())[:6],
                trip_id=room_id,
                sender="Gemini AI Concierge",
                text=ai_reply,
                is_ai=True,
                timestamp=datetime.utcnow().isoformat()
            ))
            db.commit()

        return get_room_state(room_id, user_name, authorization)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.websocket("/ws/{room_id}/{user_name}")
@app.websocket("/trip/ws/{room_id}/{user_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_name: str):
    token = websocket.query_params.get("token")
    claims = verify_jwt_token(token) if token else None

    await manager.connect(room_id, user_name, websocket)
    db = SessionLocal()
    try:
        trip = db.query(DBTrip).filter(DBTrip.id == room_id).first()
        role = resolve_effective_role(db, trip, user_name, claims)

        items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
        chats = db.query(DBChatMessage).filter(DBChatMessage.trip_id == room_id).all()
        votes_map = get_votes_map(db, room_id)

        await websocket.send_json({
            "type": "INIT_DATA",
            "items": [serialize_item(i) for i in items],
            "chats": [serialize_chat(c) for c in chats],
            "votes": votes_map,
            "yourRole": role,
            "tripBudget": trip.trip_budget if trip else 20000
        })

        await manager.broadcast(room_id, {
            "type": "PRESENCE_UPDATE",
            "activeUsers": manager.get_active_users(room_id)
        })

        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if role == "viewer" and action in {"PIN_ITEM", "MOVE_ITEM", "DELETE_ITEM", "CAST_VOTE", "RESOLVE_VOTE", "UPDATE_BUDGET"}:
                await websocket.send_json({"type": "PERMISSION_DENIED", "message": "Viewer role is read-only."})
                continue

            if action == "PIN_ITEM":
                new_item = DBItineraryItem(
                    id="it_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    title=data.get("title", "Activity"),
                    price=float(data.get("price", 0)),
                    category=data.get("category", "activity"),
                    day=int(data.get("day", 1)),
                    slot=data.get("slot", "Morning"),
                    status="drafting",
                    pinned_by=user_name,
                    position_version=1
                )
                db.add(new_item)
                db.commit()
                await manager.broadcast(room_id, {"type": "ITEM_PINNED", "item": serialize_item(new_item)})

                slot_items = db.query(DBItineraryItem).filter(
                    DBItineraryItem.trip_id == room_id,
                    DBItineraryItem.day == new_item.day,
                    DBItineraryItem.slot == new_item.slot
                ).all()
                if len(slot_items) > 1:
                    conflict_msg = DBChatMessage(
                        id="msg_" + str(uuid.uuid4())[:6],
                        trip_id=room_id,
                        sender="Conflict Detector",
                        text=f"Slot clash detected on Day {new_item.day} ({new_item.slot}). Cast votes to resolve!",
                        is_ai=False,
                        timestamp=datetime.utcnow().isoformat()
                    )
                    db.add(conflict_msg)
                    db.commit()
                    await manager.broadcast(room_id, {
                        "type": "SLOT_CONFLICT_DETECTED",
                        "chat": serialize_chat(conflict_msg)
                    })

            elif action == "MOVE_ITEM":
                item = db.query(DBItineraryItem).filter(DBItineraryItem.id == data.get("itemId")).first()
                if not item:
                    continue
                if item.status == "locked" and role not in {"leader", "admin"}:
                    await websocket.send_json({"type": "PERMISSION_DENIED", "message": "Only Leader can move locked items."})
                    continue

                expected_ver = int(data.get("expectedVersion", item.position_version))
                if expected_ver != item.position_version:
                    await websocket.send_json({
                        "type": "CONCURRENT_CONFLICT",
                        "message": "Another planner moved this item first. State synchronized."
                    })
                    continue

                item.day = int(data.get("targetDay", item.day))
                item.slot = data.get("targetSlot", item.slot)
                item.position_version += 1
                db.commit()
                await manager.broadcast(room_id, {"type": "ITEM_MOVED", "item": serialize_item(item)})

            elif action == "DELETE_ITEM":
                item = db.query(DBItineraryItem).filter(DBItineraryItem.id == data.get("itemId")).first()
                if item:
                    if item.status == "locked" and role not in {"leader", "admin"}:
                        await websocket.send_json({"type": "PERMISSION_DENIED", "message": "Only Leader can delete locked items."})
                        continue
                    item_id = item.id
                    db.delete(item)
                    db.commit()
                    await manager.broadcast(room_id, {"type": "ITEM_DELETED", "itemId": item_id})

            elif action == "CAST_VOTE":
                item_id = data.get("itemId")
                existing_vote = db.query(DBVote).filter(
                    DBVote.trip_id == room_id,
                    DBVote.item_id == item_id,
                    DBVote.user_name == user_name
                ).first()
                if not existing_vote:
                    db.add(DBVote(trip_id=room_id, item_id=item_id, user_name=user_name))
                    db.commit()

                votes_map = get_votes_map(db, room_id)
                await manager.broadcast(room_id, {"type": "VOTES_UPDATED", "votes": votes_map})

                active_count = max(len(manager.get_active_users(room_id)), 1)
                if votes_map.get(item_id, 0) > active_count / 2:
                    winner = db.query(DBItineraryItem).filter(DBItineraryItem.id == item_id).first()
                    if winner:
                        losers = db.query(DBItineraryItem).filter(
                            DBItineraryItem.trip_id == room_id,
                            DBItineraryItem.day == winner.day,
                            DBItineraryItem.slot == winner.slot,
                            DBItineraryItem.id != winner.id
                        ).all()
                        for loser in losers:
                            db.delete(loser)
                        winner.status = "locked"
                        sys_msg = DBChatMessage(
                            id="msg_" + str(uuid.uuid4())[:6],
                            trip_id=room_id,
                            sender="Voting Engine",
                            text=f"Majority vote locked '{winner.title}' for Day {winner.day} ({winner.slot}).",
                            is_ai=False,
                            timestamp=datetime.utcnow().isoformat()
                        )
                        db.add(sys_msg)
                        db.commit()
                        all_items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
                        await manager.broadcast(room_id, {
                            "type": "AUTO_RESOLVED",
                            "items": [serialize_item(i) for i in all_items],
                            "chat": serialize_chat(sys_msg)
                        })

            elif action == "RESOLVE_VOTE":
                if role not in {"leader", "admin"}:
                    await websocket.send_json({"type": "PERMISSION_DENIED", "message": "Only Leader can lock slots."})
                    continue
                winner_id = data.get("winnerId")
                winner = db.query(DBItineraryItem).filter(DBItineraryItem.id == winner_id).first()
                if winner:
                    losers = db.query(DBItineraryItem).filter(
                        DBItineraryItem.trip_id == room_id,
                        DBItineraryItem.day == winner.day,
                        DBItineraryItem.slot == winner.slot,
                        DBItineraryItem.id != winner.id
                    ).all()
                    for loser in losers:
                        db.delete(loser)
                    winner.status = "locked"
                    sys_msg = DBChatMessage(
                        id="msg_" + str(uuid.uuid4())[:6],
                        trip_id=room_id,
                        sender="Host Action",
                        text=f"Leader finalized '{winner.title}' on Day {winner.day} ({winner.slot}).",
                        is_ai=False,
                        timestamp=datetime.utcnow().isoformat()
                    )
                    db.add(sys_msg)
                    db.commit()
                    all_items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
                    await manager.broadcast(room_id, {
                        "type": "VOTE_RESOLVED",
                        "items": [serialize_item(i) for i in all_items],
                        "chat": serialize_chat(sys_msg)
                    })

            elif action == "UPDATE_BUDGET":
                if role not in {"leader", "admin"}:
                    await websocket.send_json({"type": "PERMISSION_DENIED", "message": "Only Leader can update budget."})
                    continue
                new_budget = float(data.get("tripBudget", 20000))
                if trip:
                    trip.trip_budget = new_budget
                sys_msg = DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender="Host Action",
                    text=f"Group budget updated to INR {int(new_budget):,}.",
                    is_ai=False,
                    timestamp=datetime.utcnow().isoformat()
                )
                db.add(sys_msg)
                db.commit()
                await manager.broadcast(room_id, {
                    "type": "BUDGET_UPDATED",
                    "tripBudget": new_budget,
                    "chat": serialize_chat(sys_msg)
                })

            elif action == "SEND_CHAT":
                msg = DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender=user_name,
                    text=data.get("text", ""),
                    is_ai=False,
                    timestamp=datetime.utcnow().isoformat()
                )
                db.add(msg)
                db.commit()
                await manager.broadcast(room_id, {"type": "NEW_CHAT", "chat": serialize_chat(msg)})

            elif action == "AI_QUERY":
                question = data.get("text", "")
                user_msg = DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender=user_name,
                    text=question,
                    is_ai=False,
                    timestamp=datetime.utcnow().isoformat()
                )
                db.add(user_msg)
                db.commit()
                await manager.broadcast(room_id, {"type": "NEW_CHAT", "chat": serialize_chat(user_msg)})

                current_items = db.query(DBItineraryItem).filter(DBItineraryItem.trip_id == room_id).all()
                dest = trip.destination if trip else "Goa"
                budget = trip.trip_budget if trip else 5000
                ai_reply = evaluate_hard_constraints_and_ask(question, dest, current_items, budget)

                ai_msg = DBChatMessage(
                    id="msg_" + str(uuid.uuid4())[:6],
                    trip_id=room_id,
                    sender="Gemini AI Concierge",
                    text=ai_reply,
                    is_ai=True,
                    timestamp=datetime.utcnow().isoformat()
                )
                db.add(ai_msg)
                db.commit()
                await manager.broadcast(room_id, {"type": "NEW_CHAT", "chat": serialize_chat(ai_msg)})

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, {
            "type": "PRESENCE_UPDATE",
            "activeUsers": manager.get_active_users(room_id)
        })
    finally:
        db.close()


DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.exists(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))