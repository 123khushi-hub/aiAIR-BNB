import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, QrCode, Plus, AlertCircle, Send, Bot, MessageSquare, 
  Lock, Share2, Sparkles, X, Check, Compass, LogOut, ArrowRight, 
  Calendar, MapPin, ThumbsUp, Trash2, Edit3, Sliders, TrendingUp,
  Clock, ShieldAlert, Award, Zap, DollarSign, Crown, Eye, UserCheck,
  GripVertical, UploadCloud, Star, KeyRound
} from 'lucide-react';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('auth');

  // Auth & Forgot Password State
  const [isResetMode, setIsResetMode] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [venuesList, setVenuesList] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripDest, setNewTripDest] = useState('Goa');
  const [startDate, setStartDate] = useState('2026-11-20');
  const [endDate, setEndDate] = useState('2026-11-25');
  const [newTripBudget, setNewTripBudget] = useState(25000);
  const [joinRoomInput, setJoinRoomInput] = useState('');

  const [showVenueModal, setShowVenueModal] = useState(false);
  const [vDest, setVDest] = useState('Goa');
  const [vName, setVName] = useState('');
  const [vCategory, setVCategory] = useState('dining');
  const [vPrice, setVPrice] = useState(800);
  const [vTags, setVTags] = useState('vegetarian, vegan');
  const [vHours, setVHours] = useState('11:00-23:00');
  const [vDesc, setVDesc] = useState('');
  const [vError, setVError] = useState('');

  const [currentTrip, setCurrentTrip] = useState(null);
  const [totalTripDays, setTotalTripDays] = useState(5);
  const [tripBudget, setTripBudget] = useState(20000);
  const [myRole, setMyRole] = useState('planner');
  const [userRolesMap, setUserRolesMap] = useState({});
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editBudgetValue, setEditBudgetValue] = useState(20000);

  const [activeDay, setActiveDay] = useState(1);
  const [rightTab, setRightTab] = useState('chat');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitMode, setSplitMode] = useState('even');
  const [customWeights, setCustomWeights] = useState({});
  const [copied, setCopied] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [wsConnected, setWsConnected] = useState(true);
  const [boardItems, setBoardItems] = useState([]);
  const [votes, setVotes] = useState({});
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [recentAction, setRecentAction] = useState(null);

  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const getApiBase = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? `http://${window.location.hostname}:5000` : `${window.location.origin}/trip`;
  };

  const getWsBase = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) return `ws://${window.location.hostname}:5000`;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/trip`;
  };

  const calculateDays = (start, end) => {
    try {
      const d1 = new Date(start);
      const d2 = new Date(end);
      const diffTime = Math.abs(d2 - d1);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays > 0 ? diffDays : 1;
    } catch {
      return 3;
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  useEffect(() => {
    const saved = localStorage.getItem('trip_auth_user');
    let currentUser = null;
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        setUser(currentUser);
        fetchTrips(currentUser.email);
        fetchRecommendations(currentUser.email);
      } catch (e) {
        console.error(e);
      }
    }
    fetchVenues();

    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');

    if (currentUser) {
      if (urlRoom) {
        fetchTripAndJoin(urlRoom.trim(), currentUser.name);
      } else {
        setCurrentScreen('dashboard');
      }
    } else {
      setCurrentScreen('auth');
    }
  }, []);

  const syncRoomState = async (roomId, activeUserName) => {
    try {
      const res = await fetch(
        `${getApiBase()}/api/rooms/${encodeURIComponent(roomId)}/state?user_name=${encodeURIComponent(activeUserName)}`
      );
      if (res.ok) {
        const data = await res.json();
        setBoardItems(data.items || []);
        setMessages(data.chats || []);
        setVotes(data.votes || {});
        if (data.activeUsers && data.activeUsers.length > 0) setActiveUsers(data.activeUsers);
        if (data.yourRole) setMyRole(data.yourRole);
        if (data.tripBudget) {
          setTripBudget(data.tripBudget);
          setEditBudgetValue(data.tripBudget);
        }
        setWsConnected(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (currentScreen !== 'warroom' || !currentTrip?.id) return;
    const activeName = user?.name || 'Planner';
    syncRoomState(currentTrip.id, activeName);
    const interval = setInterval(() => {
      syncRoomState(currentTrip.id, activeName);
    }, 2000);
    return () => clearInterval(interval);
  }, [currentScreen, currentTrip?.id, user?.name]);

  const fetchVenues = async (destination = '') => {
    try {
      const url = destination 
        ? `${getApiBase()}/api/venues?destination=${encodeURIComponent(destination.trim())}` 
        : `${getApiBase()}/api/venues`;
      const res = await fetch(url);
      if (res.ok) setVenuesList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecommendations = async (email) => {
    try {
      const url = email ? `${getApiBase()}/api/recommendations?email=${encodeURIComponent(email)}` : `${getApiBase()}/api/recommendations`;
      const res = await fetch(url);
      if (res.ok) setRecommendations(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTrips = async (email) => {
    try {
      const url = email ? `${getApiBase()}/api/trips?email=${encodeURIComponent(email)}` : `${getApiBase()}/api/trips`;
      const res = await fetch(url);
      if (res.ok) setTrips(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTripAndJoin = async (roomId, activeUserName) => {
    try {
      const res = await fetch(`${getApiBase()}/api/trips/${encodeURIComponent(roomId)}`);
      if (res.ok) {
        const tripData = await res.json();
        setTripBudget(tripData.trip_budget || 20000);
        setEditBudgetValue(tripData.trip_budget || 20000);

        if (tripData.dates && tripData.dates.includes('to')) {
          const [s, e] = tripData.dates.split('to').map(x => x.trim());
          setTotalTripDays(calculateDays(s, e));
        } else {
          setTotalTripDays(5);
        }

        joinWarRoom(tripData.id, tripData.title, tripData.destination, tripData.dates, activeUserName, tripData.created_by);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerToast = (text) => {
    setRecentAction(text);
    setTimeout(() => setRecentAction(null), 3000);
  };

  const safeSend = async (payload) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return;
    }
    if (!currentTrip?.id) return;
    try {
      const res = await fetch(`${getApiBase()}/api/rooms/${encodeURIComponent(currentTrip.id)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          user_name: user?.name || 'Planner'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setBoardItems(data.items || []);
        setMessages(data.chats || []);
        setVotes(data.votes || {});
        if (data.activeUsers) setActiveUsers(data.activeUsers);
        if (data.tripBudget) {
          setTripBudget(data.tripBudget);
          setEditBudgetValue(data.tripBudget);
        }
        setIsAiTyping(false);
        setWsConnected(true);
        if (payload.action === 'PIN_ITEM') triggerToast(`📍 ${payload.title} pinned!`);
        if (payload.action === 'MOVE_ITEM') triggerToast(`↔️ Moved to ${payload.targetSlot}`);
        if (payload.action === 'DELETE_ITEM') triggerToast(`Item removed.`);
      } else {
        const err = await res.json().catch(() => ({}));
        setIsAiTyping(false);
        alert(err.detail || 'Action failed');
      }
    } catch (err) {
      setIsAiTyping(false);
      triggerToast('Network error while syncing...');
    }
  };

  const handleUnifiedAuth = async (e) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email aur password dono daalna zaroori hai!");
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await fetch(`${getApiBase()}/api/auth/unified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authName.trim() || undefined,
          email: authEmail.trim(),
          password: authPassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");

      setUser(data);
      localStorage.setItem('trip_auth_user', JSON.stringify(data));
      fetchTrips(data.email);
      fetchRecommendations(data.email);
      fetchVenues();

      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      if (urlRoom) {
        fetchTripAndJoin(urlRoom.trim(), data.name);
      } else {
        setCurrentScreen('dashboard');
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!authEmail.trim() || !authName.trim() || !authPassword.trim()) {
      setAuthError("Registered Email, Name aur Naya Password teeno bharein!");
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await fetch(`${getApiBase()}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail.trim(),
          name: authName.trim(),
          new_password: authPassword.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Password reset failed");

      setAuthSuccess(data.message);
      setIsResetMode(false);
      setAuthPassword('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('trip_auth_user');
    setUser(null);
    setAuthEmail('');
    setAuthPassword('');
    setAuthName('');
    setAuthError('');
    setAuthSuccess('');
    setIsResetMode(false);
    if (socketRef.current) socketRef.current.close();
    setCurrentScreen('auth');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleUploadVenue = async (e) => {
    e.preventDefault();
    setVError('');
    try {
      const res = await fetch(`${getApiBase()}/api/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: vDest.trim(),
          name: vName,
          category: vCategory,
          price: Number(vPrice),
          dietary_tags: vTags.split(',').map(t => t.trim()).filter(Boolean),
          hours: vHours,
          description: vDesc
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Validation failed");

      setShowVenueModal(false);
      setVName('');
      setVDesc('');
      fetchVenues();
      fetchRecommendations(user?.email);
      triggerToast(`✅ Venue '${data.title}' added to catalog!`);
    } catch (err) {
      setVError(err.message);
    }
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!newTripTitle.trim() || !newTripDest.trim()) return;

    const formattedDates = `${startDate} to ${endDate}`;
    const calculatedDays = calculateDays(startDate, endDate);
    setTotalTripDays(calculatedDays);

    try {
      const res = await fetch(`${getApiBase()}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTripTitle,
          destination: newTripDest.trim(),
          dates: formattedDates,
          user_name: user?.name || "Organizer",
          user_email: user?.email || "anonymous@trip.com",
          trip_budget: Number(newTripBudget)
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Server error while creating trip");
      }

      const data = await res.json();
      setShowCreateModal(false);
      setNewTripTitle('');
      fetchTrips(user?.email);
      setTripBudget(data.trip_budget || 20000);
      setEditBudgetValue(data.trip_budget || 20000);
      joinWarRoom(data.id, data.title, data.destination, data.dates, user?.name, user?.name);
    } catch (err) {
      alert("Failed to connect: " + err.message);
    }
  };

  const joinWarRoom = (roomId, title, destination, dates, assignedName, creatorName) => {
    const cleanRoom = roomId.trim();
    const activeUserName = (assignedName || user?.name || 'Friend').trim();

    setActiveUsers([activeUserName]);
    setMyRole(
      creatorName && creatorName.trim().toLowerCase() === activeUserName.toLowerCase()
        ? 'leader'
        : 'planner'
    );

    setCurrentTrip({ id: cleanRoom, title, destination, dates, created_by: creatorName });
    setCurrentScreen('warroom');
    window.history.replaceState(null, '', `?room=${cleanRoom}`);

    fetchVenues(destination);
    syncRoomState(cleanRoom, activeUserName);

    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
    }

    const wsUrl = `${getWsBase()}/ws/${encodeURIComponent(cleanRoom)}/${encodeURIComponent(activeUserName)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INIT_DATA') {
          setBoardItems(data.items || []);
          setMessages(data.chats || []);
          setVotes(data.votes || {});
          if (data.yourRole) setMyRole(data.yourRole);
          if (data.tripBudget) {
            setTripBudget(data.tripBudget);
            setEditBudgetValue(data.tripBudget);
          }
        } else if (data.type === 'ITEM_PINNED') {
          setBoardItems(prev => [...prev, data.item]);
          triggerToast(`📍 ${data.item.title} pinned!`);
        } else if (data.type === 'ITEM_MOVED') {
          setBoardItems(prev => prev.map(i => i.id === data.item.id ? data.item : i));
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast(`↔️ Moved '${data.item.title}' to ${data.item.slot}`);
        } else if (data.type === 'ITEM_DELETED') {
          setBoardItems(prev => prev.filter(i => i.id !== data.itemId));
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast(`Item removed.`);
        } else if (data.type === 'VOTES_UPDATED') {
          setVotes(data.votes || {});
        } else if (data.type === 'AUTO_RESOLVED') {
          setBoardItems(data.items || []);
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast("🏆 Majority vote locked final slot!");
        } else if (data.type === 'VOTE_RESOLVED') {
          setBoardItems(data.items || []);
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast("🔒 Slot finalized by leader!");
        } else if (data.type === 'SLOT_CONFLICT_DETECTED') {
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast("⚠️ Conflict Detected on Slot!");
        } else if (data.type === 'CONCURRENT_CONFLICT') {
          alert(`Optimistic Concurrency Warning: ${data.message}`);
        } else if (data.type === 'BUDGET_UPDATED') {
          setTripBudget(data.tripBudget);
          setEditBudgetValue(data.tripBudget);
          if (data.chat) setMessages(prev => [...prev, data.chat]);
          triggerToast(`Budget ceiling updated to ₹${data.tripBudget.toLocaleString()}`);
        } else if (data.type === 'NEW_CHAT') {
          setIsAiTyping(false);
          setMessages(prev => [...prev, data.chat]);
        } else if (data.type === 'PRESENCE_UPDATE') {
          if (data.activeUsers && data.activeUsers.length > 0) setActiveUsers(data.activeUsers);
          if (data.userRoles) setUserRolesMap(data.userRoles);
        } else if (data.type === 'PERMISSION_DENIED') {
          alert(`RBAC Warning: ${data.message}`);
        }
      } catch (err) {
        console.error("Payload error:", err);
      }
    };
  };

  const pinItem = (venue) => {
    if (isLocked) return alert('Itinerary locked by host!');
    if (myRole === 'viewer') return alert('Viewer role is read-only!');

    const targetSlot = venue.category === 'hotel' ? 'Afternoon' : (venue.category === 'dining' ? 'Evening' : 'Morning');
    safeSend({
      action: 'PIN_ITEM',
      title: venue.title,
      price: venue.price,
      category: venue.category,
      day: Number(activeDay),
      slot: targetSlot
    });
  };

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', item.id);
  };

  const handleDragOver = (e, slotName) => {
    e.preventDefault();
    if (dragOverSlot !== slotName) {
      setDragOverSlot(slotName);
    }
  };

  const handleDropOnSlot = (e, targetSlot) => {
    e.preventDefault();
    setDragOverSlot(null);
    if (!draggedItem) return;

    if (isLocked) {
      alert('Itinerary is locked!');
      setDraggedItem(null);
      return;
    }

    if (draggedItem.slot.toLowerCase() === targetSlot.toLowerCase() && Number(draggedItem.day) === Number(activeDay)) {
      setDraggedItem(null);
      return;
    }

    safeSend({
      action: 'MOVE_ITEM',
      itemId: draggedItem.id,
      targetDay: Number(activeDay),
      targetSlot: targetSlot,
      expectedVersion: draggedItem.positionVersion || 1
    });
    setDraggedItem(null);
  };

  const deleteItem = (itemId) => {
    if (isLocked) return alert('Itinerary is locked!');
    safeSend({ action: 'DELETE_ITEM', itemId });
  };

  const castVote = (item) => {
    safeSend({
      action: 'CAST_VOTE',
      itemId: item.id,
      day: item.day,
      slot: item.slot
    });
  };

  const resolveVote = (slot, winnerId) => {
    safeSend({
      action: 'RESOLVE_VOTE',
      day: activeDay,
      slot: slot,
      winnerId: winnerId
    });
  };

  const handleUpdateBudget = () => {
    const val = Number(editBudgetValue);
    if (isNaN(val) || val <= 0) return alert('Valid budget amount bharein');
    safeSend({ action: 'UPDATE_BUDGET', tripBudget: val });
    setShowBudgetModal(false);
  };

  const sendChatMessage = () => {
    if (!inputMsg.trim()) return;
    const textToSend = inputMsg;
    setInputMsg('');
    safeSend({ action: 'SEND_CHAT', text: textToSend });
  };

  const askAiConcierge = () => {
    if (!aiPrompt.trim()) return;
    const query = aiPrompt;
    setAiPrompt('');
    setIsAiTyping(true);
    safeSend({ action: 'AI_QUERY', text: query });
  };

  const totalCost = boardItems.reduce((acc, curr) => acc + Number(curr.price || 0), 0);
  const friendCount = Math.max(activeUsers.length, 1);
  const evenShare = Math.round(totalCost / friendCount);
  const isTripBudgetExceeded = totalCost > tripBudget;
  const budgetRatio = Math.min(Math.round((totalCost / (tripBudget || 1)) * 100), 100);

  const activeCatalog = venuesList.filter(v => 
    !currentTrip?.destination || v.destination.toLowerCase().includes(currentTrip.destination.toLowerCase())
  );
  const shareableUrl = `${window.location.origin}${window.location.pathname}?room=${currentTrip?.id}`;
  const daysArray = Array.from({ length: totalTripDays }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans antialiased overflow-hidden selection:bg-rose-500 selection:text-white">
      
      {recentAction && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800/95 backdrop-blur-md border border-slate-700 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-semibold animate-bounce">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>{recentAction}</span>
        </div>
      )}

      <nav className="h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-6 flex items-center justify-between z-30">
        <div onClick={() => { if (user) { fetchTrips(user.email); fetchRecommendations(user.email); fetchVenues(); setCurrentScreen('dashboard'); } }} className="flex items-center space-x-3 cursor-pointer group">
          <div className="w-10 h-10 bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-lg shadow-rose-500/30">
            ✈️
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-rose-400 transition">
                Trip War Room
              </span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                Airbnb Spec
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Multiplayer Travel Canvas & Logistics Engine</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center space-x-3">
            {currentScreen === 'warroom' && (
              <button onClick={() => { fetchTrips(user.email); fetchRecommendations(user.email); fetchVenues(); setCurrentScreen('dashboard'); }} className="text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700 font-semibold transition cursor-pointer">
                ← Dashboard
              </button>
            )}

            <div className="flex items-center space-x-2 bg-slate-800/60 border border-slate-700 py-1.5 px-3 rounded-2xl text-xs">
              {myRole === 'leader' ? (
                <Crown className="w-3.5 h-3.5 text-amber-400" title="Host Leader" />
              ) : myRole === 'viewer' ? (
                <Eye className="w-3.5 h-3.5 text-sky-400" title="Viewer" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" title="Planner" />
              )}
              <span className="font-bold text-slate-200">{user.name}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-slate-700 text-slate-300 rounded-md">
                {myRole}
              </span>
            </div>

            <button onClick={handleLogout} className="text-slate-400 hover:text-rose-400 p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </nav>

      {/* Screen 1: Auth + Forgot Password */}
      {currentScreen === 'auth' && (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-900 relative">
          <div className="w-full max-w-md bg-slate-800/60 backdrop-blur-2xl rounded-3xl p-8 border border-slate-700 shadow-2xl z-10">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-xl text-2xl">
                {isResetMode ? '🔐' : '🗺️'}
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                {isResetMode ? 'Reset Your Password' : 'Enter Your War Room'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isResetMode
                  ? 'Apna registered Email aur Name verify karke naya password set karein'
                  : 'Naya account ho ya purana, bas details daalkar enter karein'}
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs rounded-2xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded-2xl flex items-center space-x-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={isResetMode ? handleResetPassword : handleUnifiedAuth} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  {isResetMode ? 'Registered Naam (Required)' : 'Aapka Naam (Optional agar pehle se account hai)'}
                </label>
                <input 
                  type="text" 
                  required={isResetMode}
                  value={authName} 
                  onChange={e => setAuthName(e.target.value)} 
                  placeholder="Khushi Rathod" 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-2xl outline-none focus:border-rose-500 text-white text-sm" 
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Email ID</label>
                <input 
                  type="email" 
                  required 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)} 
                  placeholder="khushi@travel.com" 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-2xl outline-none focus:border-rose-500 text-white text-sm" 
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-300">
                    {isResetMode ? 'Naya Password' : 'Password'}
                  </label>
                  {!isResetMode && (
                    <button
                      type="button"
                      onClick={() => { setIsResetMode(true); setAuthError(''); setAuthSuccess(''); }}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <input 
                  type="password" 
                  required 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  placeholder="••••••••" 
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-2xl outline-none focus:border-rose-500 text-white text-sm" 
                />
              </div>

              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 text-white font-extrabold py-3.5 rounded-2xl transition shadow-xl mt-2 text-sm cursor-pointer"
              >
                {authLoading ? 'Please wait...' : (isResetMode ? 'Update Password →' : 'Enter War Room →')}
              </button>

              {isResetMode && (
                <button
                  type="button"
                  onClick={() => { setIsResetMode(false); setAuthError(''); setAuthSuccess(''); }}
                  className="w-full text-center text-slate-400 hover:text-white font-semibold py-2 cursor-pointer"
                >
                  ← Back to Login
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Screen 2: Dashboard */}
      {currentScreen === 'dashboard' && (
        <div className="flex-1 overflow-y-auto w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-800/80 p-8 rounded-3xl border border-slate-700 shadow-xl">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                  Squad Dashboard & Analytics
                </span>
                <h2 className="text-3xl font-black text-white mt-3">Welcome, {user?.name}! 🌴</h2>
                <p className="text-xs text-slate-400 mt-1">Manage active rooms, explore hybrid recommendations, or upload destination venues.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-2xl p-1.5 shadow-inner">
                  <input type="text" placeholder="Room Code..." value={joinRoomInput} onChange={e => setJoinRoomInput(e.target.value)} className="px-3 py-1.5 text-xs bg-transparent outline-none w-32 text-white font-mono" />
                  <button onClick={() => joinRoomInput && fetchTripAndJoin(joinRoomInput, user?.name)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-bold transition border border-slate-700 cursor-pointer">
                    Join
                  </button>
                </div>

                <button onClick={() => setShowVenueModal(true)} className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sky-300 px-4 py-3 rounded-2xl text-xs font-bold transition cursor-pointer">
                  <UploadCloud className="w-4 h-4" /><span>Upload Venue (Admin)</span>
                </button>

                <button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 text-white px-5 py-3 rounded-2xl text-xs font-black shadow-lg shadow-rose-500/30 transition cursor-pointer">
                  <Plus className="w-4 h-4" /><span>New Trip Room</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="font-extrabold text-base text-white">Recommended for Your Group</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Hybrid Content + Affinity Engine</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {recommendations.map(rec => (
                  <div key={rec.id} className="bg-slate-800/50 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between hover:border-rose-500/40 transition">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">{rec.destination}</span>
                        <span className="text-[11px] font-bold text-amber-400 flex items-center space-x-0.5">
                          <Star className="w-3 h-3 fill-amber-400" /><span>{rec.rating}</span>
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-xs line-clamp-1">{rec.title}</h4>
                      <p className="text-[10px] text-emerald-400 mt-1 font-medium">{rec.reason}</p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-700/60 flex justify-between items-center text-[11px]">
                      <span className="font-mono font-bold text-slate-300">₹{rec.price}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{rec.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-200 mb-4">Your Active Trips & Session Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trips.map(trip => (
                  <div key={trip.id} className="bg-slate-800/60 border border-slate-700 rounded-3xl p-6 transition flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-xl">{trip.id}</span>
                        <span className="text-xs text-slate-400">{trip.dates}</span>
                      </div>
                      <h4 className="font-extrabold text-lg text-white">{trip.title}</h4>
                      <p className="text-xs text-slate-400 flex items-center space-x-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" /><span>{trip.destination}</span>
                      </p>
                      <p className="text-xs text-amber-400 font-mono mt-2">
                        Trip Budget: ₹{Number(trip.trip_budget || 20000).toLocaleString()}
                      </p>

                      {trip.analytics && (
                        <div className="mt-3 p-2.5 bg-slate-900/70 rounded-xl border border-slate-700/70 grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div>
                            <span className="text-slate-400 block">Pins</span>
                            <span className="font-bold text-white text-xs">{trip.analytics.itemsPinned}</span>
                          </div>
                          <div className="border-x border-slate-800">
                            <span className="text-slate-400 block">Chats</span>
                            <span className="font-bold text-sky-400 text-xs">{trip.analytics.messagesExchanged}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">AI Logs</span>
                            <span className="font-bold text-indigo-400 text-xs">{trip.analytics.aiInsights}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-700 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Leader: {trip.created_by}</span>
                      <button onClick={() => fetchTripAndJoin(trip.id, user?.name)} className="flex items-center space-x-1 text-xs font-bold text-rose-400 cursor-pointer">
                        <span>Open Canvas</span><ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <datalist id="popular-destinations">
              <option value="Goa" />
              <option value="Udaipur" />
              <option value="Diu" />
              <option value="Manali" />
              <option value="Jaipur" />
              <option value="Kerala" />
            </datalist>

            {showVenueModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 rounded-3xl p-7 max-w-md w-full border border-slate-700 shadow-2xl relative text-xs">
                  <button onClick={() => setShowVenueModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">✕</button>
                  <h3 className="font-black text-white text-lg mb-1">Admin Venue Dataset Upload</h3>
                  <p className="text-slate-400 mb-4">Add validated venue metadata directly into the live catalog & RAG engine.</p>

                  {vError && (
                    <div className="mb-3 p-2.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl">
                      {vError}
                    </div>
                  )}

                  <form onSubmit={handleUploadVenue} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">Destination</label>
                        <input
                          type="text"
                          list="popular-destinations"
                          required
                          value={vDest}
                          onChange={e => setVDest(e.target.value)}
                          placeholder="e.g. Diu, Goa..."
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">Category</label>
                        <select value={vCategory} onChange={e => setVCategory(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white">
                          <option value="dining">Dining</option>
                          <option value="activity">Activity</option>
                          <option value="hotel">Hotel</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Venue Name</label>
                      <input type="text" required value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Radhika Beach Resort" className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">Price / Person (₹)</label>
                        <input type="number" required value={vPrice} onChange={e => setVPrice(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono" />
                      </div>
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">Hours (HH:MM-HH:MM)</label>
                        <input type="text" required value={vHours} onChange={e => setVHours(e.target.value)} placeholder="10:00-22:00" className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono" />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Dietary Tags (comma separated)</label>
                      <input type="text" required value={vTags} onChange={e => setVTags(e.target.value)} placeholder="vegetarian, vegan, seafood" className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white" />
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Short Description</label>
                      <input type="text" required value={vDesc} onChange={e => setVDesc(e.target.value)} placeholder="Beachfront resort near Nagoa Beach" className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white" />
                    </div>

                    <button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white font-extrabold py-3 rounded-2xl transition shadow-lg mt-2 cursor-pointer">
                      Validate & Save Venue →
                    </button>
                  </form>
                </div>
              </div>
            )}

            {showCreateModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 rounded-3xl p-8 max-w-md w-full border border-slate-700 shadow-2xl relative text-xs">
                  <button onClick={() => setShowCreateModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">✕</button>
                  <h3 className="font-black text-white text-lg mb-1">Launch New Trip War Room</h3>
                  <p className="text-slate-400 mb-4">Dates select karte hi Canvas par exact utne days generate honge.</p>

                  <form onSubmit={handleCreateTrip} className="space-y-4">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Trip Name</label>
                      <input type="text" required value={newTripTitle} onChange={e => setNewTripTitle(e.target.value)} placeholder="e.g. Diu Weekend Squad" className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl outline-none focus:border-rose-500 text-white" />
                    </div>
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Destination (Type Any City)</label>
                      <input
                        type="text"
                        list="popular-destinations"
                        required
                        value={newTripDest}
                        onChange={e => setNewTripDest(e.target.value)}
                        placeholder="e.g. Diu, Goa, Udaipur, Manali..."
                        className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl outline-none focus:border-rose-500 text-white"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">Start Date</label>
                        <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl outline-none text-white font-mono" />
                      </div>
                      <div>
                        <label className="font-bold text-slate-300 block mb-1">End Date</label>
                        <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl outline-none text-white font-mono" />
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700 flex justify-between items-center">
                      <span className="text-slate-400 font-semibold">Total Trip Days:</span>
                      <span className="text-rose-400 font-extrabold text-sm">{calculateDays(startDate, endDate)} Days Duration</span>
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Group Trip Budget (₹)</label>
                      <input type="number" required value={newTripBudget} onChange={e => setNewTripBudget(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl outline-none text-white font-mono" />
                    </div>
                    <button type="submit" className="w-full bg-rose-500 hover:bg-rose-600 text-white font-extrabold py-3.5 rounded-2xl transition shadow-xl mt-2 text-sm cursor-pointer">
                      Launch Room ({calculateDays(startDate, endDate)} Days Canvas) →
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {currentScreen === 'warroom' && currentTrip && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex items-center justify-between z-10">
            <div className="flex items-center space-x-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-black text-white text-base">{currentTrip.title}</h2>
                  <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded-lg border border-slate-700">{currentTrip.id}</span>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                  <MapPin className="w-3 h-3 text-rose-500" /><span>{currentTrip.destination}</span>
                  <span>•</span>
                  <span>Trip Budget: ₹{Number(tripBudget).toLocaleString()}</span>
                  <span>•</span>
                  <span className="text-rose-400 font-semibold">{totalTripDays} Days</span>
                </p>
              </div>

              {isTripBudgetExceeded && (
                <div className="hidden lg:flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                  <AlertCircle className="w-4 h-4" /><span>Budget Limit Exceeded! (Limit: ₹{tripBudget.toLocaleString()})</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {myRole === 'leader' && (
                <button 
                  onClick={() => setShowBudgetModal(true)}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Adjust Budget</span>
                </button>
              )}

              <div
                className="flex items-center bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-2xl text-xs font-semibold text-slate-300 space-x-2"
                title={activeUsers.join(', ')}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`}></span>
                <span>{activeUsers.length} Online</span>
              </div>
              <button onClick={() => setShowQrModal(true)} className="flex items-center space-x-1.5 bg-rose-500 hover:bg-rose-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-md cursor-pointer">
                <QrCode className="w-3.5 h-3.5" /><span>Invite QR</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-white text-xs uppercase">{currentTrip.destination} Catalog</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Click to pin into Day {activeDay}</p>
                </div>
                {myRole === 'viewer' && (
                  <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md">Read Only</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {activeCatalog.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-8 px-4 border border-dashed border-slate-800 rounded-2xl">
                    Loading AI venues for {currentTrip.destination}...
                  </div>
                ) : (
                  activeCatalog.map(venue => (
                    <div key={venue.id} className="bg-slate-800/40 border border-slate-700 rounded-2xl p-3.5">
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg">{venue.category}</span>
                        <span className="font-black text-amber-400 text-sm font-mono">₹{venue.price}</span>
                      </div>
                      <h4 className="font-bold text-white text-xs">{venue.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{venue.desc}</p>
                      <div className="mt-3.5 pt-2.5 border-t border-slate-700 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{venue.time}</span>
                        {myRole !== 'viewer' ? (
                          <button onClick={() => pinItem(venue)} className="flex items-center space-x-1 text-xs bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl font-bold transition cursor-pointer">
                            <Plus className="w-3.5 h-3.5" /><span>Pin Day {activeDay}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500">Viewer Only</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>

            <main className="flex-1 bg-slate-950 flex flex-col overflow-y-auto">
              <div className="bg-slate-900/40 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between overflow-x-auto">
                <div className="flex space-x-2">
                  {daysArray.map(d => (
                    <button 
                      key={d} 
                      onClick={() => setActiveDay(d)} 
                      className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition shrink-0 cursor-pointer ${
                        activeDay === d 
                          ? 'bg-rose-500 text-white shadow-lg' 
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Day {d}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400 hidden sm:inline">💡 Drag & drop cards between Morning/Afternoon/Evening slots</span>
              </div>

              <div className="p-6 space-y-5 flex-1">
                {['Morning', 'Afternoon', 'Evening'].map(slot => {
                  const slotItems = boardItems.filter(i => Number(i.day) === Number(activeDay) && i.slot.toLowerCase() === slot.toLowerCase());
                  const isConflict = slotItems.length > 1;
                  const isBeingDraggedOver = dragOverSlot === slot;

                  return (
                    <div 
                      key={slot} 
                      onDragOver={(e) => handleDragOver(e, slot)}
                      onDragLeave={() => setDragOverSlot(null)}
                      onDrop={(e) => handleDropOnSlot(e, slot)}
                      className={`rounded-3xl border p-5 transition-all ${
                        isBeingDraggedOver 
                          ? 'bg-rose-950/30 border-rose-500 border-dashed scale-[1.01]' 
                          : isConflict 
                            ? 'bg-amber-950/20 border-amber-500/40' 
                            : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">{slot} Block (Day {activeDay})</span>
                        {isConflict && (
                          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5" /><span>Proactive Clash Flagged: Vote to Resolve</span>
                          </div>
                        )}
                      </div>

                      {slotItems.length === 0 ? (
                        <div className="border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
                          Drop an item here or pin from catalog for Day {activeDay} ({slot}).
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {slotItems.map(item => {
                            const count = votes[item.id] || 0;
                            return (
                              <div 
                                key={item.id} 
                                draggable={myRole !== 'viewer' && !isLocked}
                                onDragStart={(e) => handleDragStart(e, item)}
                                className="p-4 bg-slate-800 border border-slate-700 rounded-2xl flex flex-col justify-between shadow-lg relative group cursor-grab active:cursor-grabbing hover:border-slate-500 transition"
                              >
                                <div>
                                  <div className="flex justify-between items-start">
                                    <div className="flex items-center space-x-1.5">
                                      <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                                      <h5 className="font-extrabold text-sm text-white">{item.title}</h5>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-[9px] font-mono text-slate-400">v{item.positionVersion || 1}</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${item.status === 'locked' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                                        {item.status}
                                      </span>
                                      {myRole !== 'viewer' && (
                                        <button 
                                          onClick={() => deleteItem(item.id)} 
                                          className="text-slate-500 hover:text-rose-400 transition p-1 rounded-lg hover:bg-slate-700 cursor-pointer"
                                          title="Remove this slot"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-1 pl-5">₹{item.price} • Pinned by <span className="font-semibold text-slate-200">{item.pinnedBy}</span></p>
                                </div>

                                {isConflict && (
                                  <div className="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between">
                                    <button onClick={() => castVote(item)} className="flex items-center space-x-1.5 bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 cursor-pointer">
                                      <ThumbsUp className="w-3.5 h-3.5 text-rose-400" />
                                      <span>Vote ({count})</span>
                                    </button>
                                    {myRole === 'leader' && (
                                      <button onClick={() => resolveVote(slot, item.id)} className="text-[11px] bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl font-bold cursor-pointer">
                                        Leader Lock
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </main>

            <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="flex border-b border-slate-800">
                <button onClick={() => setRightTab('chat')} className={`flex-1 py-3 text-xs font-extrabold flex items-center justify-center space-x-1.5 border-b-2 cursor-pointer ${rightTab === 'chat' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400'}`}>
                  <MessageSquare className="w-3.5 h-3.5" /><span>Squad Chat</span>
                </button>
                <button onClick={() => setRightTab('ai')} className={`flex-1 py-3 text-xs font-extrabold flex items-center justify-center space-x-1.5 border-b-2 cursor-pointer ${rightTab === 'ai' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400'}`}>
                  <Bot className="w-3.5 h-3.5" /><span>Gemini RAG</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.sender === (user?.name || '') ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-slate-500 mb-1 font-mono">{msg.sender}</span>
                    <div className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                      msg.sender.includes("Conflict") || msg.sender === "Voting Engine" || msg.sender === "Host Action"
                        ? 'bg-amber-950/70 border border-amber-500/50 text-amber-200'
                        : msg.isAi 
                          ? 'bg-indigo-950/60 border border-indigo-500/30 text-indigo-200' 
                          : (msg.sender === (user?.name || '') ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-200')
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isAiTyping && (
                  <div className="flex items-center space-x-2 text-xs text-indigo-400 p-2 font-mono">
                    <Sparkles className="w-4 h-4 animate-spin" /><span>Evaluating hard constraints...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-slate-800 bg-slate-900/60">
                {rightTab === 'chat' ? (
                  <div className="flex space-x-2">
                    <input type="text" value={inputMsg} onChange={e => setInputMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} placeholder="Squad chat..." className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-rose-500" />
                    <button onClick={sendChatMessage} className="bg-rose-500 hover:bg-rose-600 text-white p-2 rounded-xl cursor-pointer"><Send className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex space-x-2">
                    <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && askAiConcierge()} placeholder="Ask vegan/budget questions..." className="flex-1 bg-slate-800 border border-indigo-500/40 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                    <button onClick={askAiConcierge} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl cursor-pointer"><Sparkles className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <footer className="h-20 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between z-20">
            <div className="flex items-center space-x-8">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Total Plan Spend</span>
                <p className="text-xl font-black text-emerald-400 font-mono">₹{totalCost.toLocaleString()}</p>
              </div>
              <div className="border-l border-slate-800 pl-8">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Even Share ({friendCount} Active)</span>
                <p className="text-xl font-black text-sky-400 font-mono">₹{evenShare.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ friend</span></p>
              </div>
              <div className="hidden xl:flex flex-col w-48 space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-400">Trip Budget Meter (₹{tripBudget.toLocaleString()})</span>
                  <span className={isTripBudgetExceeded ? 'text-rose-400' : 'text-emerald-400'}>{budgetRatio}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${isTripBudgetExceeded ? 'bg-rose-500' : 'bg-emerald-400'}`} style={{ width: `${budgetRatio}%` }}></div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button onClick={() => setShowSplitModal(true)} className="flex items-center space-x-1.5 bg-slate-800 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /><span>Split Engine</span>
              </button>
              {myRole === 'leader' && (
                <button onClick={() => setIsLocked(!isLocked)} className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${isLocked ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                  <Lock className="w-3.5 h-3.5" /><span>{isLocked ? 'Unlock Room' : 'Lock Room'}</span>
                </button>
              )}
            </div>
          </footer>

          {showBudgetModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
              <div className="bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-700 text-xs shadow-2xl relative">
                <button onClick={() => setShowBudgetModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer">✕</button>
                <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h3 className="font-black text-white text-base mb-1">Adjust Group Trip Budget</h3>
                <p className="text-slate-400 mb-4">Set a higher or lower overall spending limit for this squad trip.</p>

                <div className="space-y-3 mb-4">
                  <label className="font-bold text-slate-300 block">New Trip Budget Target (₹)</label>
                  <input 
                    type="number" 
                    value={editBudgetValue} 
                    onChange={e => setEditBudgetValue(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl outline-none text-white font-mono text-sm"
                  />
                </div>

                <button 
                  onClick={handleUpdateBudget} 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold transition shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  Save & Broadcast to Squad
                </button>
              </div>
            </div>
          )}

          {showQrModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
              <div className="bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-700 text-center text-xs relative">
                <button onClick={() => setShowQrModal(false)} className="absolute top-4 right-4 text-slate-400 cursor-pointer">✕</button>
                <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Share2 className="w-6 h-6" />
                </div>
                <h3 className="font-black text-white text-base mb-1">Invite Friends</h3>
                <p className="text-slate-400 mb-4">Share this link: friends will login once and join permanently.</p>
                <div className="p-3 bg-white rounded-2xl inline-block mb-3 shadow-xl">
                  <img src={`[https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=$](https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=$){encodeURIComponent(shareableUrl)}`} alt="QR" className="w-32 h-32 mx-auto" />
                </div>
                <div className="font-mono bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-slate-400 break-all mb-4 text-left text-[11px]">{shareableUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(shareableUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-xl font-bold transition cursor-pointer">
                  {copied ? 'Link Copied!' : 'Copy Direct Link'}
                </button>
              </div>
            </div>
          )}

          {showSplitModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
              <div className="bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-slate-700 text-xs relative">
                <button onClick={() => setShowSplitModal(false)} className="absolute top-4 right-4 text-slate-400 cursor-pointer">✕</button>
                <h3 className="font-black text-white text-base mb-1">Group Budget Split Engine</h3>
                <p className="text-slate-400 mb-4">Airbnb PRD verified per-person reconciliation ledger</p>
                
                <div className="flex bg-slate-900 p-1 rounded-xl mb-4 font-bold">
                  <button onClick={() => setSplitMode('even')} className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${splitMode === 'even' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}>Even Split (1/N)</button>
                  <button onClick={() => setSplitMode('weighted')} className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${splitMode === 'weighted' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}>Weighted Custom</button>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-700 flex justify-between items-center">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Plan Spend</span>
                      <span className="text-base font-black text-white font-mono">₹{totalCost.toLocaleString()}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[11px]">Even Allocation</span>
                      <span className="text-base font-black text-sky-400 font-mono">₹{evenShare.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-700">
                    <span className="font-extrabold text-slate-300 block mb-2">Member Breakdown:</span>
                    {activeUsers.map(name => {
                      const share = splitMode === 'even' ? evenShare : (customWeights[name] || evenShare);
                      return (
                        <div key={name} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-300 font-semibold">{name}</span>
                            {name === currentTrip?.created_by && <Crown className="w-3 h-3 text-amber-400" />}
                          </div>
                          {splitMode === 'even' ? (
                            <span className="font-mono text-emerald-400 font-bold">₹{share.toLocaleString()}</span>
                          ) : (
                            <input 
                              type="number" 
                              value={customWeights[name] || evenShare} 
                              onChange={e => setCustomWeights({ ...customWeights, [name]: Number(e.target.value) })}
                              className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-mono text-right"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button onClick={() => setShowSplitModal(false)} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-bold cursor-pointer">
                  Save & Close
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}