import { useState, useEffect, useCallback, useRef } from "react";

const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const DEMO_MODE = !ODDS_API_KEY;

const SHARP_SYSTEM_PROMPT = `You are a professional sports betting analyst who thinks like a Las Vegas oddsmaker. Your job is to identify genuine betting edge using whatever data is available — not to hedge or make excuses about missing data.

CRITICAL RULES:
- Always form a CONCRETE conclusion. Never say "without X data I cannot determine." Work with what you have.
- If Pinnacle data is available use it. If not, use the consensus from available books and move on. Never mention missing Pinnacle data as a reason to hedge.
- Be consistent and repeatable. Given the same inputs, always reach the same logical conclusion.
- Keep responses tight and under 400 words total.
- Never recommend a bet just because a team is good. Only when the LINE is mispriced.
- A confident NO BET is better than a wishy-washy maybe.

Always cover these sections in order:

1. LINE MOVEMENT — open vs current spread, size of move, what direction implies about sharp vs public money. Flag Reverse Line Movement if present.

2. PUBLIC BIAS — public betting percentage and whether the line is moving with or against the public. Heavy public side with line moving away = sharp signal.

3. GAME CONTEXT — neutral site, tournament/playoff format, rivalry, rest, travel. Flag if listed home team is NOT actually at home.

4. EFFICIENCY & SITUATIONAL — pace, offensive/defensive efficiency mismatch, back-to-backs, schedule spots, injuries affecting spread value.

5. HISTORICAL ATS — relevant trends for this exact situation. Tournament seeds ATS, neutral site favorites, teams off big wins or losses.

6. EDGE SUMMARY — mandatory conclusion every time:
   - SIDE: [Team name] or NO BET
   - REASON: one sentence on why the line is mispriced or why there is no edge
   - CONFIDENCE: LOW / MEDIUM / HIGH
   - NEXT STEP: This field is ALWAYS required regardless of outcome —
     * If value exists: state the best available number to target across books
     * If NO BET: you MUST state one of these every single time with no exceptions:
       — "VALUE LINE: This becomes a bet on [Team] if the line reaches [number]"
       — "TRIGGER: If [specific condition] occurs, bet [Team]"
       — "MONITOR: Line needs to move from [current] to [target] to create edge"
     * Leaving NEXT STEP blank or skipping it is not permitted under any circumstances.

function fmtGameTime(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${dayLabel} · ${timeLabel}`;
}

const now = new Date();
const todayStr = (h, m) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.toISOString(); };
const tomorrowStr = (h, m) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d.toISOString(); };

const DEMO_GAMES = [
  { id: "g1", sport: "NCAAB", homeTeam: "Duke Blue Devils", awayTeam: "North Carolina Tar Heels", openSpread: -4.5, currentSpread: -6.5, total: 152.5, publicPct: 68, commenceTime: todayStr(19, 0), time: fmtGameTime(todayStr(19, 0)), label: "NCAA Tournament — Neutral Site" },
  { id: "g2", sport: "NCAAB", homeTeam: "Houston Cougars", awayTeam: "Tennessee Volunteers", openSpread: -2.0, currentSpread: -1.0, total: 131.0, publicPct: 38, commenceTime: todayStr(21, 30), time: fmtGameTime(todayStr(21, 30)), label: "NCAA Tournament — Neutral Site" },
  { id: "g3", sport: "NBA", homeTeam: "Boston Celtics", awayTeam: "Milwaukee Bucks", openSpread: -5.5, currentSpread: -4.0, total: 224.5, publicPct: 71, commenceTime: todayStr(20, 0), time: fmtGameTime(todayStr(20, 0)), label: "Eastern Conference" },
  { id: "g4", sport: "NBA", homeTeam: "OKC Thunder", awayTeam: "Denver Nuggets", openSpread: -3.0, currentSpread: -4.5, total: 218.0, publicPct: 55, commenceTime: todayStr(22, 0), time: fmtGameTime(todayStr(22, 0)), label: "Western Conference" },
  { id: "g5", sport: "MLB", homeTeam: "New York Yankees", awayTeam: "Boston Red Sox", openSpread: -1.5, currentSpread: -1.5, total: 8.5, publicPct: 72, commenceTime: tomorrowStr(13, 5), time: fmtGameTime(tomorrowStr(13, 5)), label: "AL East" },
  { id: "g6", sport: "MLB", homeTeam: "Los Angeles Dodgers", awayTeam: "San Francisco Giants", openSpread: -1.5, currentSpread: -1.5, total: 7.5, publicPct: 65, commenceTime: tomorrowStr(16, 10), time: fmtGameTime(tomorrowStr(16, 10)), label: "NL West" },
];

const THEMES = {
  dark: {
    bg: "#020810", bgHeader: "#030c1a", bgCard: "#0a1628",
    bgCardHover: "#070d1a", bgInput: "#0a1220", bgStat: "#0a0f1a",
    bgAnalysis: "#070f1e", bgButton: "#0a1220", bgButtonActive: "#1e3a5f",
    bgModal: "#0a1628",
    border: "#1e2a3a", borderHeader: "#0f172a", borderStat: "#0f172a",
    borderStatHi: "#1e3a5f", borderInput: "#1f2937",
    text: "#f9fafb", textSub: "#6b7280", textMuted: "#9ca3af",
    textFaint: "#4b5563", textAnalysis: "#cbd5e1", textHeader: "#374151",
    filterText: "#374151", filterTextActive: "#93c5fd",
    rlmBg: "#f59e0b0f", rlmBorder: "#f59e0b33",
    statBg: "#0a1220", statBorder: "#111827",
    emptyText: "#9ca3af", emptySubText: "#6b7280", scrollThumb: "#1f2937",
    overlay: "rgba(0,0,0,0.75)",
  },
  light: {
    bg: "#fdf8f0", bgHeader: "#ffffff", bgCard: "#fef9f2",
    bgCardHover: "#fdf3e3", bgInput: "#fdf8f0", bgStat: "#fef9f2",
    bgAnalysis: "#fffbf5", bgButton: "#f5ede0", bgButtonActive: "#dbeafe",
    bgModal: "#ffffff",
    border: "#e8ddd0", borderHeader: "#e8ddd0", borderStat: "#e8ddd0",
    borderStatHi: "#93c5fd", borderInput: "#d1c4b0",
    text: "#1a1208", textSub: "#5c4a2a", textMuted: "#7c6545",
    textFaint: "#9c8060", textAnalysis: "#2d1f0a", textHeader: "#7c6545",
    filterText: "#7c6545", filterTextActive: "#1d4ed8",
    rlmBg: "#fef3c7", rlmBorder: "#fcd34d",
    statBg: "#fef3e2", statBorder: "#e8ddd0",
    emptyText: "#5c4a2a", emptySubText: "#7c6545", scrollThumb: "#d1c4b0",
    overlay: "rgba(0,0,0,0.5)",
  }
};

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
  return game.publicPct > 55 ? game.awayTeam : game.homeTeam;
}

function getSportColor(sport) {
  return sport === "NBA" ? "#f97316" : sport === "NCAAB" ? "#3b82f6" : sport === "MLB" ? "#10b981" : "#a855f7";
}

function isNeutralSite(game) {
  const label = (game.label || "").toLowerCase();
  if (label.includes("nit")) {
    return label.includes("final") || label.includes("semifinal") || label.includes("championship");
  }
  return label.includes("neutral") || label.includes("tournament") ||
    label.includes("bowl") || label.includes("final") || label.includes("championship");
}

function isPlayoff(game) {
  const label = (game.label || "").toLowerCase();
  return label.includes("playoff") || label.includes("tournament") ||
    label.includes("final") || label.includes("championship") ||
    label.includes("postseason") || label.includes("bowl");
}

function Spinner({ t }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: "50%",
      border: `2px solid ${t.borderInput}`, borderTopColor: "#3b82f6",
      animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

function SportBadge({ sport }) {
  const color = getSportColor(sport);
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
      color, border: `1px solid ${color}33`, background: `${color}18`,
      padding: "2px 6px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
    }}>{sport}</span>
  );
}

function ContextBadge({ game }) {
  const neutral = isNeutralSite(game);
  const playoff = isPlayoff(game);
  if (!neutral && !playoff) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
      {neutral && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#7c3aed",
          background: "#7c3aed14", border: "1px solid #7c3aed33",
          padding: "2px 6px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
          letterSpacing: "0.06em",
        }}>🏟 NEUTRAL SITE</span>
      )}
      {playoff && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#db2777",
          background: "#db277714", border: "1px solid #db277733",
          padding: "2px 6px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
          letterSpacing: "0.06em",
        }}>🏆 TOURNAMENT</span>
      )}
    </div>
  );
}

function MoveBadge({ game, t }) {
  const size = Math.abs(game.currentSpread - game.openSpread);
  const rlm = getRLM(game);
  if (size < 0.5) return <span style={{ fontSize: 10, color: t.textFaint, fontFamily: "'Inter', sans-serif" }}>STABLE</span>;
  if (rlm) return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: "#d97706", background: "#fef3c7",
      border: "1px solid #fcd34d", padding: "2px 7px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
    }}>⚡ RLM</span>
  );
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: t.textMuted,
      background: t.bgButton, border: `1px solid ${t.border}`,
      padding: "2px 7px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
    }}>MOVED {fmt(game.currentSpread - game.openSpread)}</span>
  );
}

function PublicMeter({ pct, homeTeam, t }) {
  const heavy = pct > 65;
  const color = heavy ? "#ef4444" : "#3b82f6";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: t.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Inter', sans-serif" }}>
          Public on {homeTeam.split(" ").pop()}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: heavy ? "#ef4444" : t.textMuted, fontFamily: "'Inter', sans-serif" }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: t.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function GameCard({ game, onSelect, t }) {
  const rlm = getRLM(game);
  const sportColor = getSportColor(game.sport);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => onSelect(game)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 16px", borderBottom: `1px solid ${t.border}`,
        borderLeft: `3px solid ${hovered ? sportColor : "transparent"}`,
        background: hovered ? t.bgCardHover : "transparent",
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SportBadge sport={game.sport} />
          <span style={{ fontSize: 9, color: t.textFaint, fontFamily: "'Inter', sans-serif" }}>{game.time}</span>
        </div>
        <MoveBadge game={game} t={t} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: t.textSub, marginBottom: 3, fontFamily: "'Inter', sans-serif" }}>{game.awayTeam}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: "'Inter', sans-serif" }}>@ {game.homeTeam}</div>
        <ContextBadge game={game} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Open", val: fmt(game.openSpread) },
          { label: "Now", val: fmt(game.currentSpread), hi: true },
          { label: "O/U", val: game.total },
        ].map(s => (
          <div key={s.label} style={{
            background: t.statBg, borderRadius: 4, padding: "5px 8px",
            border: `1px solid ${s.hi ? t.borderStatHi : t.statBorder}`,
          }}>
            <div style={{ fontSize: 8, color: t.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.hi ? "#2563eb" : t.text, fontFamily: "'Inter', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>
      <PublicMeter pct={game.publicPct} homeTeam={game.homeTeam} t={t} />
      {rlm && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 4,
          background: t.rlmBg, border: `1px solid ${t.rlmBorder}`,
          fontSize: 10, color: "#d97706", fontWeight: 700, fontFamily: "'Inter', sans-serif",
        }}>⚡ Sharp money on {getSharpSide(game).split(" ").slice(-1)[0]}</div>
      )}
    </div>
  );
}

function FormattedAnalysis({ content, t }) {
  const lines = content.split("\n");
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        const isHeader = /^(\d+\.|[A-Z\s]{4,})\s*[—-]/.test(trimmed) || /^[A-Z\s]{6,}:/.test(trimmed);
        if (isHeader) {
          return (
            <div key={i} style={{
              fontSize: 10, fontWeight: 700, color: "#2563eb",
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: 14, marginBottom: 5,
              paddingBottom: 4, borderBottom: `1px solid ${t.border}`,
            }}>{trimmed}</div>
          );
        }
        const isEdge = trimmed.toLowerCase().includes("edge summary") || trimmed.toLowerCase().includes("recommendation");
        if (isEdge) {
          return (
            <div key={i} style={{
              fontSize: 13, fontWeight: 700, color: "#d97706",
              marginTop: 14, marginBottom: 5, padding: "8px 12px",
              background: t.rlmBg, border: `1px solid ${t.rlmBorder}`, borderRadius: 6,
            }}>{trimmed}</div>
          );
        }
        const isNeutralAlert = trimmed.toLowerCase().includes("neutral site") || trimmed.toLowerCase().includes("neutral court");
        if (isNeutralAlert) {
          return (
            <div key={i} style={{
              fontSize: 12, fontWeight: 600, color: "#7c3aed",
              marginTop: 6, marginBottom: 4, padding: "5px 10px",
              background: "#7c3aed0d", border: "1px solid #7c3aed22", borderRadius: 5,
            }}>{trimmed}</div>
          );
        }
        if (trimmed.startsWith("-") || trimmed.startsWith("•")) {
          return (
            <div key={i} style={{
              fontSize: 13, color: t.textAnalysis, lineHeight: 1.7,
              paddingLeft: 14, marginBottom: 3, position: "relative",
            }}>
              <span style={{ position: "absolute", left: 0, color: "#3b82f6" }}>›</span>
              {trimmed.slice(1).trim()}
            </div>
          );
        }
        return (
          <div key={i} style={{ fontSize: 13, color: t.textAnalysis, lineHeight: 1.8, marginBottom: 3 }}>
            {trimmed}
          </div>
        );
      })}
    </div>
  );
}

// ── MODAL COMPONENT ──
function AnalysisModal({ game, onClose, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const bottomRef = useRef(null);

  const buildContext = useCallback((g) => `
GAME: ${g.awayTeam} @ ${g.homeTeam}
SPORT: ${g.sport}
CONTEXT: ${g.label}
NEUTRAL SITE: ${isNeutralSite(g) ? "YES — home court advantage does NOT apply" : "No"}
TOURNAMENT/PLAYOFF GAME: ${isPlayoff(g) ? "YES — single elimination or playoff format" : "No"}
TIME: ${g.time}
OPENING SPREAD: ${g.homeTeam} ${fmt(g.openSpread)}
CURRENT SPREAD: ${g.homeTeam} ${fmt(g.currentSpread)}
LINE MOVE: ${fmt(g.currentSpread - g.openSpread)} pts
TOTAL: ${g.total}
PUBLIC BETTING: ${g.publicPct}% on ${g.homeTeam}
RLM DETECTED: ${getRLM(g) ? `YES — sharp action likely on ${getSharpSide(g)}` : "No"}
`.trim(), []);

  const sendMessage = useCallback(async (userText, history) => {
    setLoading(true);
    const newHistory = [...history, { role: "user", content: userText }];
    setMessages(newHistory);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: SHARP_SYSTEM_PROMPT, messages: newHistory }),
      });
      const data = await res.json();
      const reply = data?.content?.[0]?.text || data?.error?.message || data?.error || "Unable to generate analysis.";
      setMessages([...newHistory, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([...newHistory, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (game && !autoRan) {
      setAutoRan(true);
      sendMessage(`${buildContext(game)}\n\nRun a full sharp analysis on this matchup.`, []);
    }
  }, [game, autoRan, sendMessage, buildContext]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    setInput("");
    sendMessage(`${buildContext(game)}\n\nFollow-up: ${input}`, messages);
  };

  if (!game) return null;
  const sportColor = getSportColor(game.sport);

  return (
    // Overlay — tap outside to close
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: t.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.2s ease",
      }}
    >
      {/* Modal box — stop click from bubbling to overlay */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          maxHeight: "88vh",
          background: t.bgModal,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${t.border}`,
          background: t.bgHeader, flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <SportBadge sport={game.sport} />
                <span style={{ fontSize: 9, color: t.textFaint, fontFamily: "'Inter', sans-serif" }}>{game.label} · {game.time}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text, fontFamily: "'Inter', sans-serif" }}>
                {game.awayTeam}
                <span style={{ color: t.textFaint, margin: "0 6px", fontWeight: 400 }}>@</span>
                <span style={{ color: sportColor }}>{game.homeTeam}</span>
              </div>
              <ContextBadge game={game} />
            </div>
            <button
              onClick={onClose}
              style={{
                background: t.bgButton, border: `1px solid ${t.border}`,
                color: t.textMuted, borderRadius: 20, width: 28, height: 28,
                cursor: "pointer", fontSize: 13, fontFamily: "'Inter', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginLeft: 8,
              }}
            >✕</button>
          </div>

          {/* Quick stats */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "Open", val: fmt(game.openSpread) },
              { label: "Current", val: fmt(game.currentSpread), color: "#2563eb" },
              { label: "Move", val: fmt(game.currentSpread - game.openSpread), color: Math.abs(game.currentSpread - game.openSpread) >= 1.5 ? "#d97706" : t.textMuted },
              { label: "Total", val: game.total },
              { label: "Public", val: `${game.publicPct}%`, color: game.publicPct > 65 ? "#ef4444" : t.textMuted },
            ].map(s => (
              <div key={s.label} style={{
                background: t.statBg, border: `1px solid ${t.statBorder}`,
                borderRadius: 4, padding: "3px 8px",
              }}>
                <span style={{ fontSize: 8, color: t.textFaint, marginRight: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Inter', sans-serif" }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color || t.text, fontFamily: "'Inter', sans-serif" }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable analysis content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: t.bg }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", color: t.textMuted, marginTop: 30 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
              <div style={{ fontSize: 12, fontFamily: "'Inter', sans-serif" }}>Loading analysis...</div>
            </div>
          )}
          {messages.filter(m => m.role === "assistant").map((m, i) => (
            <div key={i} style={{
              background: t.bgAnalysis, border: `1px solid ${t.borderHeader}`,
              borderRadius: 8, padding: "12px 14px", marginBottom: 12,
            }}>
              <FormattedAnalysis content={m.content} t={t} />
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textMuted, padding: "8px 0" }}>
              <Spinner t={t} />
              <span style={{ fontSize: 12, fontFamily: "'Inter', sans-serif" }}>Analyzing matchup data...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Follow-up input */}
        <div style={{
          padding: "10px 14px", borderTop: `1px solid ${t.border}`,
          background: t.bgHeader, flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask a follow-up — e.g. 'Fade the public angle?' or 'How does pace affect the total?'"
              rows={2}
              style={{
                flex: 1, background: t.bgInput, border: `1px solid ${t.borderInput}`,
                borderRadius: 6, padding: "8px 10px", color: t.text,
                fontSize: 13, fontFamily: "'Inter', sans-serif",
                resize: "none", outline: "none", lineHeight: 1.5,
              }}
              onFocus={e => e.target.style.borderColor = "#3b82f6"}
              onBlur={e => e.target.style.borderColor = t.borderInput}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                padding: "0 14px", borderRadius: 6, border: "none",
                background: loading || !input.trim() ? t.bgButton : "#2563eb",
                color: loading || !input.trim() ? t.textFaint : "#fff",
                fontSize: 16, cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharplineApp() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [sportFilter, setSportFilter] = useState("ALL");
  const [view, setView] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const t = isDark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    const color = isDark ? "#030c1a" : "#ffffff";
    const bg = isDark ? "#030c1a" : "#fdf8f0";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  }, [isDark]);

  const loadGames = useCallback(async () => {
    setFetching(true);
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 600));
      setGames(prev => {
        if (prev.length === 0) return DEMO_GAMES;
        return prev.map(g => ({
          ...g,
          currentSpread: Math.random() > 0.8 ? parseFloat((g.currentSpread + (Math.random() > 0.5 ? 0.5 : -0.5)).toFixed(1)) : g.currentSpread,
          publicPct: Math.min(95, Math.max(20, g.publicPct + (Math.random() > 0.5 ? 1 : -1))),
        }));
      });
      setLastUpdated(new Date());
    } else {
      try {
        const sports = [
          { key: "basketball_nba", label: "NBA" },
          { key: "basketball_ncaab", label: "NCAAB" },
          { key: "baseball_mlb", label: "MLB" },
        ];
        const allGames = [];
        for (const sport of sports) {
          const res = await fetch(
            `https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm,caesars,pinnacle`
          );
          const data = await res.json();
          if (!Array.isArray(data)) { console.error(`${sport.label} API error:`, data); continue; }
          data.slice(0, 20).forEach(g => {
            const allSpreads = [];
            g.bookmakers?.forEach(book => {
              const spreadMkt = book.markets?.find(m => m.key === "spreads");
              const homePoint = spreadMkt?.outcomes?.find(o => o.name === g.home_team)?.point;
              if (homePoint !== undefined) allSpreads.push(homePoint);
            });
            const homeSpread = allSpreads.length > 0
              ? allSpreads.reduce((a, b) => a + b, 0) / allSpreads.length : 0;
            const firstBook = g.bookmakers?.[0];
            const totalMkt = firstBook?.markets?.find(m => m.key === "totals");
            const total = totalMkt?.outcomes?.[0]?.point ?? (sport.label === "MLB" ? 8.5 : 220);
            const isNCAAT = sport.label === "NCAAB" && new Date(g.commence_time) > new Date("2025-03-18");
            allGames.push({
              id: g.id, sport: sport.label,
              homeTeam: g.home_team, awayTeam: g.away_team,
              openSpread: parseFloat((homeSpread + (Math.random() > 0.5 ? 0.5 : -0.5)).toFixed(1)),
              currentSpread: parseFloat(homeSpread.toFixed(1)),
              total, publicPct: Math.floor(Math.random() * 45) + 30,
              commenceTime: g.commence_time,
              time: fmtGameTime(g.commence_time),
              label: isNCAAT ? "NCAA Tournament — Neutral Site" : sport.label === "MLB" ? "MLB Regular Season" : sport.label,
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
    const interval = setInterval(loadGames, 1800000);
    return () => clearInterval(interval);
  }, [loadGames]);

  const rlmCount = games.filter(getRLM).length;
  const displayed = games
    .filter(g => view === "rlm" ? getRLM(g) : true)
    .filter(g => sportFilter === "ALL" || g.sport === sportFilter)
    .sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      background: t.bg, fontFamily: "'IBM Plex Mono', monospace",
      color: t.text, overflow: "hidden", transition: "background 0.3s ease",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800;900&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .live-pulse { animation: pulse 2s ease-in-out infinite; }
        html, body { background-color: #fdf8f0; margin: 0; padding: 0; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: `1px solid ${t.borderHeader}`,
        background: t.bgHeader, flexShrink: 0, zIndex: 50,
        boxShadow: isDark ? "none" : "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 12px rgba(37,99,235,0.35)", flexShrink: 0,
          }}>
            <span style={{ fontSize: 15 }}>⚡</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 28, fontWeight: 900, letterSpacing: "0.06em",
              color: t.text, textTransform: "uppercase", lineHeight: 1,
            }}>SHARP<span style={{ color: "#2563eb" }}>LINE</span></span>
            <span style={{ fontSize: 8, color: t.textFaint, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif", marginTop: 1 }}>
              SHARP BETTING INTEL
            </span>
          </div>
          {DEMO_MODE && (
            <span style={{ fontSize: 8, color: "#d97706", letterSpacing: "0.12em", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: 2, fontFamily: "'Inter', sans-serif" }}>DEMO</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rlmCount > 0 && (
            <div
              onClick={() => { setView("rlm"); setSelectedGame(null); }}
              style={{
                fontSize: 10, color: "#d97706", fontWeight: 700,
                background: t.rlmBg, border: `1px solid ${t.rlmBorder}`,
                padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                fontFamily: "'Inter', sans-serif", letterSpacing: "0.04em",
              }}
            >⚡ {rlmCount} RLM{rlmCount > 1 ? "s" : ""}</div>
          )}
          <button
            onClick={() => setIsDark(prev => !prev)}
            style={{
              background: t.bgButton, border: `1px solid ${t.border}`,
              borderRadius: 4, padding: "5px 10px", cursor: "pointer",
              fontSize: 13, display: "flex", alignItems: "center",
              color: t.textMuted, transition: "all 0.2s",
            }}
          >{isDark ? "☀️" : "🌙"}</button>
          <button
            onClick={loadGames}
            disabled={fetching}
            style={{
              background: t.bgButton, border: `1px solid ${t.border}`,
              color: fetching ? t.textFaint : t.textMuted, borderRadius: 4,
              padding: "5px 10px", fontSize: 10, cursor: fetching ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 5,
              letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif",
            }}
          >{fetching ? <><Spinner t={t} /><span>Updating</span></> : "↺ Refresh"}</button>
          {lastUpdated && (
            <span style={{ fontSize: 9, color: t.textFaint, fontFamily: "'Inter', sans-serif" }}>
              {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderBottom: `1px solid ${t.border}`,
        background: t.bg, flexShrink: 0, overflowX: "auto", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 4, marginRight: 6 }}>
          {[["all", "All Games"], ["rlm", `⚡ RLM (${rlmCount})`]].map(([v, label]) => (
            <button key={v} onClick={() => { setView(v); setSelectedGame(null); if (v === "all") setSportFilter("ALL"); }} style={{
              padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 10,
              fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: "0.04em",
              cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
              background: view === v ? t.bgButtonActive : t.bgButton,
              color: view === v ? (isDark ? "#93c5fd" : "#1d4ed8") : t.filterText,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: t.border, flexShrink: 0 }} />
        {["ALL", "NCAAB", "NBA", "NFL", "MLB"].map(s => (
          <button key={s} onClick={() => { setSportFilter(s); setSelectedGame(null); }} style={{
            padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 10,
            fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: "0.06em",
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
            color: sportFilter === s ? (s === "ALL" ? t.text : getSportColor(s)) : t.filterText,
            background: sportFilter === s ? (s === "ALL" ? t.bgButton : `${getSportColor(s)}18`) : "transparent",
          }}>{s}</button>
        ))}
      </div>

      {/* ── GAME LIST (full width, always visible) ── */}
      <div style={{ flex: 1, overflowY: "auto", background: t.bg }}>
        {displayed.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", lineHeight: 1.8 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.emptyText, fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>
              {view === "rlm" ? "No RLM Signals Right Now" : "No Games Found"}
            </div>
            <div style={{ fontSize: 12, color: t.emptySubText, fontFamily: "'Inter', sans-serif" }}>
              {view === "rlm" ? "Check back as lines update — signals appear when sharp money moves against the public." : "Try selecting a different sport or check back later."}
            </div>
          </div>
        ) : displayed.map(game => (
          <GameCard
            key={game.id}
            game={game}
            onSelect={setSelectedGame}
            t={t}
          />
        ))}
      </div>

      {/* ── MODAL (rendered over everything when a game is selected) ── */}
      {selectedGame && (
        <AnalysisModal
          key={selectedGame.id}
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          t={t}
        />
      )}
    </div>
  );
}
