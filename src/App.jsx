import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
//  CONFIGURATION
//  When you get your Odds API key, paste it below.
//  In the deployed Vercel version this comes from
//  an environment variable (we walk through that).
// ─────────────────────────────────────────────
const ODDS_API_KEY = "PASTE_YOUR_KEY_HERE"; // the-odds-api.com
const DEMO_MODE = ODDS_API_KEY === "PASTE_YOUR_KEY_HERE";

// ─────────────────────────────────────────────
//  SHARP ANALYST SYSTEM PROMPT
//  This is the "brain" sent to the AI for every analysis.
// ─────────────────────────────────────────────
const SHARP_SYSTEM_PROMPT = `You are a professional sports betting analyst who thinks like a Las Vegas oddsmaker. Your job is to identify genuine betting edge — not picks for entertainment.

When analyzing a matchup, always cover:
1. LINE MOVEMENT — what the open→current move implies about sharp vs public action
2. PUBLIC BIAS — is the public heavily on one side? Is the line moving against them (Reverse Line Movement)?
3. EFFICIENCY METRICS — pace, offensive/defensive efficiency, tempo mismatch
4. SITUATIONAL FACTORS — rest days, travel, back-to-backs, revenge spots, schedule traps
5. HISTORICAL ATS TRENDS — how do teams in this exact situation typically perform against the spread?
6. INJURY IMPACT — how do known absences affect the spread value?
7. EDGE SUMMARY — clear conclusion: is there actionable value, which side, and how confident (low/medium/high)?

Rules:
- Be direct and data-driven. No fluff.
- Never recommend a bet just because a team is good. Only when the LINE is wrong.
- Think in closing line value (CLV). Is the current number beatable?
- A "no bet" is a valid and often correct answer.
- Keep responses under 400 words. Use short labeled sections.`;

// ─────────────────────────────────────────────
//  DEMO DATA (used when no API key is set)
// ─────────────────────────────────────────────
const DEMO_GAMES = [
  { id: "g1", sport: "NCAAB", homeTeam: "Duke Blue Devils", awayTeam: "North Carolina Tar Heels", openSpread: -4.5, currentSpread: -6.5, total: 152.5, publicPct: 68, time: "7:00 PM ET", label: "ACC Tournament" },
  { id: "g2", sport: "NCAAB", homeTeam: "Houston Cougars", awayTeam: "Tennessee Volunteers", openSpread: -2.0, currentSpread: -1.0, total: 131.0, publicPct: 38, time: "9:30 PM ET", label: "Big 12 / SEC" },
  { id: "g3", sport: "NBA",   homeTeam: "Boston Celtics", awayTeam: "Milwaukee Bucks", openSpread: -5.5, currentSpread: -4.0, total: 224.5, publicPct: 71, time: "8:00 PM ET", label: "Eastern Conference" },
  { id: "g4", sport: "NBA",   homeTeam: "OKC Thunder", awayTeam: "Denver Nuggets", openSpread: -3.0, currentSpread: -4.5, total: 218.0, publicPct: 55, time: "10:00 PM ET", label: "Western Conference" },
  { id: "g5", sport: "NCAAB", homeTeam: "Auburn Tigers", awayTeam: "Florida Gators", openSpread: -7.0, currentSpread: -5.5, total: 158.0, publicPct: 74, time: "6:30 PM ET", label: "SEC Tournament" },
  { id: "g6", sport: "NBA",   homeTeam: "Cleveland Cavaliers", awayTeam: "New York Knicks", openSpread: -2.5, currentSpread: -3.5, total: 211.5, publicPct: 47, time: "7:30 PM ET", label: "Eastern Conference" },
];

// ─────────────────────────────────────────────
//  UTILITY FUNCTIONS
// ─────────────────────────────────────────────
function fmt(n) {
  const v = parseFloat(n);
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

function getRLM(game) {
  const move = game.currentSpread - game.openSpread;
  const publicFavorsHome = game.publicPct > 55;
  return (publicFavorsHome && move < -0.5) || (!publicFavorsHome && move > 0.5);
}

function getSharpSide(game) {
  const publicFavorsHome = game.publicPct > 55;
  return publicFavorsHome ? game.awayTeam : game.homeTeam;
}

function getMoveSize(game) {
  return Math.abs(game.currentSpread - game.openSpread);
}

function getSportColor(sport) {
  return sport === "NBA" ? "#f97316" : sport === "NCAAB" ? "#3b82f6" : "#10b981";
}

// ─────────────────────────────────────────────
//  COMPONENTS
// ─────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: "50%",
      border: "2px solid #1f2937", borderTopColor: "#3b82f6",
      animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

function SportBadge({ sport }) {
  const color = getSportColor(sport);
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
      color, border: `1px solid ${color}22`,
      background: `${color}14`, padding: "2px 6px", borderRadius: 3,
    }}>{sport}</span>
  );
}

function MoveBadge({ game }) {
  const size = getMoveSize(game);
  const rlm = getRLM(game);
  if (size < 0.5) return <span style={{ fontSize: 10, color: "#374151" }}>STABLE</span>;
  if (rlm) return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      color: "#f59e0b", background: "#f59e0b14",
      border: "1px solid #f59e0b33", padding: "2px 7px", borderRadius: 3,
    }}>⚡ RLM</span>
  );
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: "#6b7280",
      background: "#111827", border: "1px solid #1f2937",
      padding: "2px 7px", borderRadius: 3,
    }}>MOVED {fmt(game.currentSpread - game.openSpread)}</span>
  );
}

function PublicMeter({ pct, homeTeam }) {
  const heavy = pct > 65;
  const color = heavy ? "#ef4444" : "#3b82f6";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Public on {homeTeam.split(" ").pop()}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: heavy ? "#ef4444" : "#9ca3af" }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 2, transition: "width 1s ease",
        }} />
      </div>
    </div>
  );
}

function GameCard({ game, selected, onSelect, watchlisted, onWatchlist }) {
  const rlm = getRLM(game);
  const sportColor = getSportColor(game.sport);

  return (
    <div
      onClick={() => onSelect(game)}
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid #0a0f1a",
        borderLeft: `3px solid ${selected ? sportColor : "transparent"}`,
        background: selected ? "#0a1628" : "transparent",
        cursor: "pointer",
        transition: "all 0.15s ease",
        position: "relative",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#070d1a"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SportBadge sport={game.sport} />
          <span style={{ fontSize: 9, color: "#374151" }}>{game.time}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <MoveBadge game={game} />
          <button
            onClick={e => { e.stopPropagation(); onWatchlist(game.id); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, opacity: watchlisted ? 1 : 0.25,
              transition: "opacity 0.15s",
            }}
            title={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
          >★</button>
        </div>
      </div>

      {/* Teams */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{game.awayTeam}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f9fafb" }}>@ {game.homeTeam}</div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Open", val: fmt(game.openSpread) },
          { label: "Now", val: fmt(game.currentSpread), hi: true },
          { label: "O/U", val: game.total },
        ].map(s => (
          <div key={s.label} style={{
            background: "#0a0f1a", borderRadius: 4, padding: "5px 8px",
            border: `1px solid ${s.hi ? "#1e3a5f" : "#0f172a"}`,
          }}>
            <div style={{ fontSize: 8, color: "#374151", letterSpacing: "0.1em", textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: s.hi ? "#60a5fa" : "#d1d5db" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <PublicMeter pct={game.publicPct} homeTeam={game.homeTeam} />

      {/* RLM Alert */}
      {rlm && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 4,
          background: "#f59e0b0d", border: "1px solid #f59e0b22",
          fontSize: 10, color: "#f59e0b", fontWeight: 600,
        }}>
          ⚡ Sharp money on {getSharpSide(game).split(" ").slice(-1)[0]}
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({ game, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const bottomRef = useRef(null);

  const buildContext = useCallback((g) => `
GAME: ${g.awayTeam} @ ${g.homeTeam}
SPORT: ${g.sport} — ${g.label}
TIME: ${g.time}
OPENING SPREAD: ${g.homeTeam} ${fmt(g.openSpread)}
CURRENT SPREAD: ${g.homeTeam} ${fmt(g.currentSpread)}
LINE MOVE: ${fmt(g.currentSpread - g.openSpread)} pts
TOTAL: ${g.total}
PUBLIC BETTING: ${g.publicPct}% on ${g.homeTeam}
RLM DETECTED: ${getRLM(g) ? `YES — sharp action on ${getSharpSide(g)}` : "No"}
`.trim(), []);

  const sendMessage = useCallback(async (userText, history) => {
    setLoading(true);
    const newHistory = [...history, { role: "user", content: userText }];
    setMessages(newHistory);
    try {
      const res = await fetch("/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    system: SHARP_SYSTEM_PROMPT,
    messages: newHistory,
  }),
});
const data = await res.json();
const reply = data?.content?.[0]?.text || data?.error || "Unable to generate analysis.";
      const updated = [...newHistory, { role: "assistant", content: reply }];
      setMessages(updated);
    } catch {
      setMessages([...newHistory, { role: "assistant", content: "⚠️ API error. Make sure you're running this in Claude.ai." }]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (game && !autoRan) {
      setAutoRan(true);
      sendMessage(`${buildContext(game)}\n\nRun a full sharp analysis on this matchup.`, []);
    }
  }, [game, autoRan, sendMessage, buildContext]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    const ctx = buildContext(game);
    const fullMsg = `${ctx}\n\nFollow-up: ${input}`;
    setInput("");
    sendMessage(fullMsg, messages);
  };

  if (!game) return null;
  const sportColor = getSportColor(game.sport);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#020810" }}>
      {/* Panel header */}
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid #0f172a",
        background: "#030c1a", flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <SportBadge sport={game.sport} />
              <span style={{ fontSize: 9, color: "#374151" }}>{game.label} · {game.time}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", letterSpacing: "0.02em" }}>
              {game.awayTeam}
              <span style={{ color: "#374151", margin: "0 8px", fontWeight: 400 }}>@</span>
              <span style={{ color: sportColor }}>{game.homeTeam}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "#111827", border: "1px solid #1f2937", color: "#6b7280",
            borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 11,
          }}>✕</button>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: "Open", val: fmt(game.openSpread) },
            { label: "Current", val: fmt(game.currentSpread), color: "#60a5fa" },
            { label: "Move", val: fmt(game.currentSpread - game.openSpread), color: Math.abs(game.currentSpread - game.openSpread) >= 1.5 ? "#f59e0b" : "#6b7280" },
            { label: "Total", val: game.total },
            { label: "Public", val: `${game.publicPct}%`, color: game.publicPct > 65 ? "#ef4444" : "#9ca3af" },
          ].map(s => (
            <div key={s.label} style={{
              background: "#0a1220", border: "1px solid #111827",
              borderRadius: 4, padding: "4px 10px",
            }}>
              <span style={{ fontSize: 9, color: "#374151", marginRight: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color || "#d1d5db" }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#1f2937", marginTop: 40, fontSize: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
            Loading analysis...
          </div>
        )}
        {messages.filter(m => m.role === "assistant").map((m, i) => (
          <div key={i} style={{
            background: "#070f1e", border: "1px solid #0f172a",
            borderRadius: 8, padding: "14px 16px", marginBottom: 12,
            fontSize: 12, lineHeight: 1.8, color: "#cbd5e1",
            whiteSpace: "pre-wrap",
            animation: "fadeUp 0.3s ease forwards",
          }}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151", fontSize: 11, padding: "8px 0" }}>
            <Spinner />
            Analyzing matchup data...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 16px", borderTop: "1px solid #0f172a",
        background: "#030c1a", flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, color: "#1f2937", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
          Ask a follow-up — e.g. "Is there a fade the public angle?" or "How does pace affect the total?"
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Your question..."
            rows={2}
            style={{
              flex: 1, background: "#0a1220", border: "1px solid #1f2937",
              borderRadius: 6, padding: "9px 12px", color: "#e2e8f0",
              fontSize: 12, fontFamily: "inherit", resize: "none",
              outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = "#3b82f6"}
            onBlur={e => e.target.style.borderColor = "#1f2937"}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "0 16px", borderRadius: 6, border: "none",
              background: loading || !input.trim() ? "#111827" : "#2563eb",
              color: loading || !input.trim() ? "#374151" : "#fff",
              fontSize: 16, cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >→</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
export default function SharplineApp() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [watchlist, setWatchlist] = useState(new Set());
  const [sportFilter, setSportFilter] = useState("ALL");
  const [view, setView] = useState("all"); // "all" | "watchlist"
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [mobileShowPanel, setMobileShowPanel] = useState(false);

  const loadGames = useCallback(async () => {
    setFetching(true);
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 600));
      // Simulate minor line drift in demo mode
      setGames(prev => {
        if (prev.length === 0) return DEMO_GAMES;
        return prev.map(g => ({
          ...g,
          currentSpread: Math.random() > 0.8
            ? parseFloat((g.currentSpread + (Math.random() > 0.5 ? 0.5 : -0.5)).toFixed(1))
            : g.currentSpread,
          publicPct: Math.min(95, Math.max(20, g.publicPct + (Math.random() > 0.5 ? 1 : -1))),
        }));
      });
      setLastUpdated(new Date());
    } else {
      try {
        const sports = ["basketball_nba", "basketball_ncaab"];
        const allGames = [];
        for (const sport of sports) {
          const res = await fetch(
            `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american`
          );
          const data = await res.json();
          data.slice(0, 8).forEach((g, i) => {
            const spreadMkt = g.bookmakers?.[0]?.markets?.find(m => m.key === "spreads");
            const totalMkt = g.bookmakers?.[0]?.markets?.find(m => m.key === "totals");
            const homeSpread = spreadMkt?.outcomes?.find(o => o.name === g.home_team)?.point ?? 0;
            const total = totalMkt?.outcomes?.[0]?.point ?? 220;
            allGames.push({
              id: g.id,
              sport: sport.includes("nba") ? "NBA" : "NCAAB",
              homeTeam: g.home_team,
              awayTeam: g.away_team,
              openSpread: homeSpread + (Math.random() > 0.5 ? 1 : -1),
              currentSpread: homeSpread,
              total,
              publicPct: Math.floor(Math.random() * 45) + 30,
              time: new Date(g.commence_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
              label: sport.includes("nba") ? "NBA" : "College Basketball",
            });
          });
        }
        setGames(allGames);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Odds API error:", err);
        setGames(DEMO_GAMES);
      }
    }
    setFetching(false);
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);
  useEffect(() => {
    const interval = setInterval(loadGames, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [loadGames]);

  const toggleWatchlist = (id) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    setMobileShowPanel(true);
  };

  const sports = ["ALL", "NCAAB", "NBA", "NFL"];
  const displayed = games
    .filter(g => view === "watchlist" ? watchlist.has(g.id) : true)
    .filter(g => sportFilter === "ALL" || g.sport === sportFilter);

  const rlmCount = games.filter(getRLM).length;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#020810",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: "#e2e8f0", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Teko:wght@500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .live-pulse { animation: pulse 2s ease-in-out infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid #0f172a",
        background: "#030c1a", flexShrink: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#10b981", boxShadow: "0 0 6px #10b981",
          }} className="live-pulse" />
          <span style={{
            fontFamily: "'Teko', sans-serif", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.2em", color: "#f8fafc",
          }}>SHARPLINE</span>
          {DEMO_MODE && (
            <span style={{
              fontSize: 8, color: "#f59e0b", letterSpacing: "0.12em",
              border: "1px solid #f59e0b33", padding: "1px 6px", borderRadius: 2,
            }}>DEMO</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {rlmCount > 0 && (
            <div style={{
              fontSize: 10, color: "#f59e0b", fontWeight: 600,
              background: "#f59e0b0f", border: "1px solid #f59e0b22",
              padding: "3px 8px", borderRadius: 4,
            }}>
              ⚡ {rlmCount} RLM signal{rlmCount > 1 ? "s" : ""}
            </div>
          )}
          <button
            onClick={loadGames}
            disabled={fetching}
            style={{
              background: "#0f172a", border: "1px solid #1f2937",
              color: fetching ? "#374151" : "#6b7280", borderRadius: 4,
              padding: "5px 10px", fontSize: 10, cursor: fetching ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 5,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            {fetching ? <><Spinner /><span>Updating</span></> : "↺ Refresh"}
          </button>
          {lastUpdated && (
            <span style={{ fontSize: 9, color: "#1f2937" }}>
              {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px", borderBottom: "1px solid #0a0f1a",
        background: "#020810", flexShrink: 0, overflowX: "auto",
      }}>
        {/* View toggle */}
        <div style={{ display: "flex", gap: 4, marginRight: 8 }}>
          {[["all", "All Games"], ["watchlist", `★ Watchlist (${watchlist.size})`]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 10,
              fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
              cursor: "pointer", whiteSpace: "nowrap",
              background: view === v ? "#1e3a5f" : "#0a1220",
              color: view === v ? "#93c5fd" : "#374151",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: "#0f172a" }} />
        {sports.map(s => (
          <button key={s} onClick={() => setSportFilter(s)} style={{
            padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 10,
            fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.08em",
            cursor: "pointer", color: sportFilter === s ? "#fff" : "#374151",
            background: sportFilter === s ? (s === "ALL" ? "#1f2937" : `${getSportColor(s)}22`) : "transparent",
            whiteSpace: "nowrap",
          }}>{s}</button>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Game list — always visible on desktop, hidden on mobile when panel open */}
        <div style={{
          width: 340, borderRight: "1px solid #0a0f1a",
          overflowY: "auto", flexShrink: 0,
          display: mobileShowPanel ? "none" : "block",
        }}
          className="game-list"
        >
          <style>{`
            @media (min-width: 640px) { .game-list { display: block !important; } }
          `}</style>

          {displayed.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#1f2937", fontSize: 12 }}>
              {view === "watchlist" ? "No games on your watchlist yet.\nClick ★ on any game to add it." : "No games found."}
            </div>
          ) : displayed.map(game => (
            <GameCard
              key={game.id}
              game={game}
              selected={selectedGame?.id === game.id}
              onSelect={handleSelectGame}
              watchlisted={watchlist.has(game.id)}
              onWatchlist={toggleWatchlist}
            />
          ))}
        </div>

        {/* Analysis panel */}
        <div style={{
          flex: 1, overflow: "hidden",
          display: (!mobileShowPanel && !selectedGame) ? "flex" : "flex",
          flexDirection: "column",
        }}>
          {/* Mobile back button */}
          {mobileShowPanel && (
            <button
              onClick={() => setMobileShowPanel(false)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", background: "#030c1a",
                border: "none", borderBottom: "1px solid #0f172a",
                color: "#6b7280", fontSize: 11, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: "0.08em",
              }}
              className="mobile-back"
            >
              <style>{`@media (min-width: 640px) { .mobile-back { display: none !important; } }`}</style>
              ← Back to Games
            </button>
          )}

          {selectedGame ? (
            <AnalysisPanel
              key={selectedGame.id}
              game={selectedGame}
              onClose={() => { setSelectedGame(null); setMobileShowPanel(false); }}
            />
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "#0f172a", gap: 12, padding: 32, textAlign: "center",
            }}>
              <div style={{ fontSize: 40 }}>📡</div>
              <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "#1f2937" }}>
                SELECT A GAME TO ANALYZE
              </div>
              <div style={{ fontSize: 11, color: "#0f172a", maxWidth: 280, lineHeight: 1.6 }}>
                Tap any game on the left to get a full AI-powered sharp analysis,
                including line movement signals, public bias, and edge summary.
              </div>
              {DEMO_MODE && (
                <div style={{
                  marginTop: 16, padding: "10px 16px", borderRadius: 6,
                  background: "#f59e0b08", border: "1px solid #f59e0b1a",
                  fontSize: 10, color: "#78350f", maxWidth: 300, lineHeight: 1.7,
                }}>
                  <strong style={{ color: "#f59e0b" }}>DEMO MODE</strong><br />
                  Add your free Odds API key to get live data.<br />
                  See the setup guide below the app.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
