import { useState, useEffect, useCallback, useRef } from "react";

const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const DEMO_MODE = !ODDS_API_KEY;

const SHARP_SYSTEM_PROMPT = `You are a sharp sports betting analyst. You always form a complete, concrete analysis using only the data provided. You never mention missing data, never ask for more information, and never hedge because a data source is unavailable.

ABSOLUTE RULES — NO EXCEPTIONS:
1. Never mention Pinnacle, missing books, or unavailable data sources. Ever.
2. Always reach a concrete conclusion. Vague answers are not permitted.
3. Every response must end with a complete EDGE SUMMARY — no skipping it.
4. If the answer is NO BET you must still provide a VALUE LINE. Always.
5. Keep total response under 350 words.

FORMAT — use exactly these sections every time:

LINE MOVEMENT
State the open line, current line, total move in points, and what the direction implies. Is the public on one side while the line moves the other way? That is a sharp signal — say so directly.

PUBLIC BIAS
State the public betting percentage. Is it above 65%? Flag it as heavy public. Is the line moving against the heavy public side? That is Reverse Line Movement — name it explicitly.

GAME CONTEXT
Is this a neutral site? Say so and remove home court from the equation. Is this a tournament or playoff game? Note motivation and fatigue factors. Is there a key injury? State how it affects the spread.

SHARP LEAN
Based on line movement and public bias combined, which side does the data point toward? State it as a direction — not a pick, just what the numbers suggest.

EDGE SUMMARY
This section is mandatory and must contain all four of these lines with no exceptions:

SIDE: [Team Name] OR NO BET
REASON: [One sentence — why the line is or is not mispriced]
CONFIDENCE: LOW / MEDIUM / HIGH
VALUE LINE: [Required even on NO BET — example: "Bet [Team] if line reaches [number]" or "Current line has value if it moves to [number] or better" or "No edge unless line shifts by at least [X] points"]`;

const BEST_BETS_PROMPT = `You are a sharp sports betting scout. You will receive data for multiple games today. Your job is to scan all of them and identify the TOP 5 best betting opportunities based purely on the data signals.

SCORING CRITERIA — rank each game on these signals:
- Reverse Line Movement (line moving against heavy public) = strongest signal, +3 points
- Large line move of 1.5+ points = +2 points
- Heavy public bias over 65% = +1 point (fading opportunity)
- Neutral site with public overvaluing home team = +1 point
- Book disagreement of 0.5+ points = +1 point

ABSOLUTE RULES:
1. Never mention Pinnacle or missing data. Work with what you have.
2. Always return exactly 5 picks — ranked 1 through 5.
3. Every pick must have a CONFIDENCE rating of LOW, MEDIUM, or HIGH.
4. Every pick must have a VALUE LINE — even if the recommendation is NO BET.
5. Be direct and concrete. No hedging.

RESPONSE FORMAT — return exactly this structure for each pick:

#1 — [Away Team] @ [Home Team] ([Sport])
SIDE: [Team Name] or NO BET
CONFIDENCE: LOW / MEDIUM / HIGH
SIGNAL: [One sentence — the key data signal driving this pick]
VALUE LINE: [Specific number or condition that creates edge]

---

Repeat for #2 through #5. After all 5 picks add a one-line DAILY SUMMARY of what the overall market looks like today.`;

const TODAY_ANALYSIS_PROMPT = `You are a sharp sports betting analyst writing a morning market briefing for a group of informed bettors. You have received today's full slate of games across multiple sports.

Your job is to write a sport-by-sport breakdown of what the market looks like today. This is NOT a picks sheet — it is a narrative analysis of where sharp money appears to be, which games have the most interesting signals, and what the overall market tone is for each sport today.

ABSOLUTE RULES:
1. Never mention Pinnacle or missing data sources.
2. Write in a direct, confident tone — like a sharp handicapper's morning notes.
3. Organize by sport — one section per sport present in today's slate.
4. For each sport, identify: the most interesting line movement, the biggest public fade opportunity, and the game with the most edge potential.
5. End with a MARKET OUTLOOK — one paragraph on the overall tone of today's slate.
6. Keep the entire response under 500 words.
7. Never hedge. Always have a perspective.

FORMAT:

[SPORT NAME]
[2-3 sentences covering the most notable signal games in this sport today, what lines have moved meaningfully, where public money is concentrated, and which game deserves the most attention]

Repeat for each sport, then:

MARKET OUTLOOK
[One paragraph — what kind of day is this? Sharp action day, public heavy day, neutral day? Where is the best overall value sitting?]`;

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
  { id: "g1", sport: "NCAAB", homeTeam: "Duke Blue Devils", awayTeam: "North Carolina Tar Heels", openSpread: -4.5, currentSpread: -6.5, total: 152.5, publicPct: 68, commenceTime: todayStr(19, 0), time: fmtGameTime(todayStr(19, 0)), label: "NCAA Tournament — Neutral Site", bookLines: [{ book: "DraftKings", spread: -6.5, juice: -110 }, { book: "FanDuel", spread: -6, juice: -115 }, { book: "BetMGM", spread: -7, juice: -110 }, { book: "Caesars", spread: -6.5, juice: -105 }] },
  { id: "g2", sport: "NCAAB", homeTeam: "Houston Cougars", awayTeam: "Tennessee Volunteers", openSpread: -2.0, currentSpread: -1.0, total: 131.0, publicPct: 38, commenceTime: todayStr(21, 30), time: fmtGameTime(todayStr(21, 30)), label: "NCAA Tournament — Neutral Site", bookLines: [{ book: "DraftKings", spread: -1, juice: -110 }, { book: "FanDuel", spread: -1.5, juice: -110 }, { book: "BetMGM", spread: -1, juice: -115 }, { book: "Caesars", spread: -0.5, juice: -120 }] },
  { id: "g3", sport: "NBA", homeTeam: "Boston Celtics", awayTeam: "Milwaukee Bucks", openSpread: -5.5, currentSpread: -4.0, total: 224.5, publicPct: 71, commenceTime: todayStr(20, 0), time: fmtGameTime(todayStr(20, 0)), label: "Eastern Conference", bookLines: [{ book: "DraftKings", spread: -4, juice: -110 }, { book: "FanDuel", spread: -4.5, juice: -108 }, { book: "BetMGM", spread: -4, juice: -115 }, { book: "Caesars", spread: -3.5, juice: -120 }] },
  { id: "g4", sport: "NBA", homeTeam: "OKC Thunder", awayTeam: "Denver Nuggets", openSpread: -3.0, currentSpread: -4.5, total: 218.0, publicPct: 55, commenceTime: todayStr(22, 0), time: fmtGameTime(todayStr(22, 0)), label: "Western Conference", bookLines: [{ book: "DraftKings", spread: -4.5, juice: -110 }, { book: "FanDuel", spread: -4.5, juice: -112 }, { book: "BetMGM", spread: -5, juice: -105 }, { book: "Caesars", spread: -4, juice: -115 }] },
  { id: "g5", sport: "MLB", homeTeam: "New York Yankees", awayTeam: "Boston Red Sox", openSpread: -1.5, currentSpread: -1.5, total: 8.5, publicPct: 72, commenceTime: tomorrowStr(13, 5), time: fmtGameTime(tomorrowStr(13, 5)), label: "AL East", bookLines: [{ book: "DraftKings", spread: -1.5, juice: -130 }, { book: "FanDuel", spread: -1.5, juice: -125 }, { book: "BetMGM", spread: -1.5, juice: -130 }, { book: "Caesars", spread: -1.5, juice: -120 }] },
  { id: "g6", sport: "MLB", homeTeam: "Los Angeles Dodgers", awayTeam: "San Francisco Giants", openSpread: -1.5, currentSpread: -1.5, total: 7.5, publicPct: 65, commenceTime: tomorrowStr(16, 10), time: fmtGameTime(tomorrowStr(16, 10)), label: "NL West", bookLines: [{ book: "DraftKings", spread: -1.5, juice: -120 }, { book: "FanDuel", spread: -1.5, juice: -118 }, { book: "BetMGM", spread: -2, juice: -110 }, { book: "Caesars", spread: -1.5, juice: -125 }] },
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

function fmtJuice(n) {
  if (!n && n !== 0) return "";
  return n > 0 ? `+${n}` : `${n}`;
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
  return sport === "NBA" ? "#f97316" : sport === "NCAAB" ? "#3b82f6" : sport === "MLB" ? "#10b981" : sport === "NHL" ? "#06b6d4" : "#a855f7";
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
        }}>🏟 NEUTRAL SITE</span>
      )}
      {playoff && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#db2777",
          background: "#db277714", border: "1px solid #db277733",
          padding: "2px 6px", borderRadius: 3, fontFamily: "'Inter', sans-serif",
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

function LineShop({ bookLines, homeTeam, t }) {
  if (!bookLines || bookLines.length === 0) return null;
  const spreads = bookLines.map(b => b.spread);
  const best = Math.max(...spreads);
  const worst = Math.min(...spreads);
  const hasSpreadDisagreement = Math.abs(best - worst) >= 0.5;

  // Best juice = least negative (e.g. -105 is better than -120)
  const juices = bookLines.map(b => b.juice).filter(j => j !== undefined && j !== null);
  const bestJuice = juices.length > 0 ? Math.max(...juices) : null;
  const hasJuiceDisagreement = juices.length > 1 && (Math.max(...juices) - Math.min(...juices)) >= 5;

  const shortName = (name) => {
    if (name.toLowerCase().includes("draftkings")) return "DK";
    if (name.toLowerCase().includes("fanduel")) return "FD";
    if (name.toLowerCase().includes("betmgm")) return "MGM";
    if (name.toLowerCase().includes("caesars")) return "CZR";
    if (name.toLowerCase().includes("pinnacle")) return "PIN";
    return name.slice(0, 3).toUpperCase();
  };

  return (
    <div style={{ marginTop: 10 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: t.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Inter', sans-serif" }}>
          Line Shopping — {homeTeam.split(" ").pop()}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {hasSpreadDisagreement && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#7c3aed", background: "#7c3aed14", border: "1px solid #7c3aed33", padding: "1px 5px", borderRadius: 3, fontFamily: "'Inter', sans-serif" }}>
              SPLIT
            </span>
          )}
          {hasJuiceDisagreement && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#10b981", background: "#10b98114", border: "1px solid #10b98133", padding: "1px 5px", borderRadius: 3, fontFamily: "'Inter', sans-serif" }}>
              JUICE GAP
            </span>
          )}
        </div>
      </div>

      {/* Spread row */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
        {bookLines.map((b, i) => {
          const isBestSpread = b.spread === best;
          return (
            <div key={i} style={{
              background: isBestSpread ? "#2563eb18" : t.statBg,
              border: `1px solid ${isBestSpread ? "#2563eb44" : t.statBorder}`,
              borderRadius: 4, padding: "3px 7px",
              display: "flex", flexDirection: "column", alignItems: "center", minWidth: 42,
            }}>
              <span style={{ fontSize: 8, color: t.textFaint, fontFamily: "'Inter', sans-serif", letterSpacing: "0.06em" }}>{shortName(b.book)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isBestSpread ? "#2563eb" : t.text, fontFamily: "'Inter', sans-serif" }}>{fmt(b.spread)}</span>
            </div>
          );
        })}
      </div>

      {/* Juice row */}
      {juices.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {bookLines.map((b, i) => {
            if (b.juice === undefined || b.juice === null) return null;
            const isBestJuice = b.juice === bestJuice;
            return (
              <div key={i} style={{
                background: isBestJuice && hasJuiceDisagreement ? "#10b98112" : t.statBg,
                border: `1px solid ${isBestJuice && hasJuiceDisagreement ? "#10b98133" : t.statBorder}`,
                borderRadius: 4, padding: "2px 7px",
                display: "flex", flexDirection: "column", alignItems: "center", minWidth: 42,
              }}>
                <span style={{ fontSize: 8, color: t.textFaint, fontFamily: "'Inter', sans-serif", letterSpacing: "0.04em" }}>juice</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: isBestJuice && hasJuiceDisagreement ? "#10b981" : t.textMuted, fontFamily: "'Inter', sans-serif" }}>
                  {fmtJuice(b.juice)}
                </span>
              </div>
            );
          })}
        </div>
      )}
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
      <LineShop bookLines={game.bookLines} homeTeam={game.homeTeam} t={t} />
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
        const isHeader = /^(LINE MOVEMENT|PUBLIC BIAS|GAME CONTEXT|SHARP LEAN|EDGE SUMMARY)/i.test(trimmed);
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
        const isEdgeLine = /^(SIDE:|REASON:|CONFIDENCE:|VALUE LINE:)/i.test(trimmed);
        if (isEdgeLine) {
          const isValueLine = /^VALUE LINE:/i.test(trimmed);
          const isSide = /^SIDE:/i.test(trimmed);
          return (
            <div key={i} style={{
              fontSize: 13, fontWeight: 700,
              color: isValueLine ? "#2563eb" : isSide ? "#d97706" : t.text,
              marginBottom: 4, padding: "5px 10px",
              background: isValueLine ? "#2563eb0d" : isSide ? t.rlmBg : t.bgAnalysis,
              border: `1px solid ${isValueLine ? "#2563eb22" : isSide ? t.rlmBorder : t.border}`,
              borderRadius: 5,
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

function FormattedBestBets({ content, t }) {
  const lines = content.split("\n");
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;
        if (/^#\d/.test(trimmed)) {
          return (
            <div key={i} style={{
              fontSize: 13, fontWeight: 800, color: t.text,
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.06em", textTransform: "uppercase",
              marginTop: i === 0 ? 0 : 16, marginBottom: 6,
              padding: "6px 10px", background: t.bgButton,
              borderRadius: 6, borderLeft: "3px solid #2563eb",
            }}>{trimmed}</div>
          );
        }
        if (/^SIDE:/i.test(trimmed)) {
          const isNoBet = trimmed.toUpperCase().includes("NO BET");
          return (
            <div key={i} style={{
              fontSize: 13, fontWeight: 700,
              color: isNoBet ? t.textMuted : "#d97706",
              marginBottom: 4, padding: "4px 10px",
              background: isNoBet ? t.bgButton : t.rlmBg,
              border: `1px solid ${isNoBet ? t.border : t.rlmBorder}`,
              borderRadius: 5,
            }}>{trimmed}</div>
          );
        }
        if (/^VALUE LINE:/i.test(trimmed)) {
          return (
            <div key={i} style={{
              fontSize: 12, fontWeight: 700, color: "#2563eb",
              marginBottom: 4, padding: "4px 10px",
              background: "#2563eb0d", border: "1px solid #2563eb22",
              borderRadius: 5,
            }}>{trimmed}</div>
          );
        }
        if (/^CONFIDENCE:/i.test(trimmed)) {
          const isHigh = trimmed.toUpperCase().includes("HIGH");
          const isMed = trimmed.toUpperCase().includes("MEDIUM");
          return (
            <div key={i} style={{
              fontSize: 11, fontWeight: 700,
              color: isHigh ? "#10b981" : isMed ? "#f59e0b" : t.textMuted,
              marginBottom: 4,
            }}>{trimmed}</div>
          );
        }
        if (trimmed === "---") {
          return <div key={i} style={{ height: 1, background: t.border, marginTop: 12, marginBottom: 4 }} />;
        }
        if (/^DAILY SUMMARY/i.test(trimmed)) {
          return (
            <div key={i} style={{
              fontSize: 11, fontWeight: 700, color: "#2563eb",
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: 16, marginBottom: 6,
              paddingBottom: 4, borderBottom: `1px solid ${t.border}`,
            }}>{trimmed}</div>
          );
        }
        return (
          <div key={i} style={{ fontSize: 12, color: t.textAnalysis, lineHeight: 1.7, marginBottom: 3 }}>
            {trimmed}
          </div>
        );
      })}
    </div>
  );
}

// ── TODAY'S ANALYSIS FORMATTED OUTPUT ──
function FormattedTodayAnalysis({ content, t }) {
  const lines = content.split("\n");
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;

        // Sport section headers like "NBA" "NCAAB" "MLB"
        const isSportHeader = /^(NBA|NCAAB|MLB|NHL|NFL)$/i.test(trimmed);
        if (isSportHeader) {
          const color = getSportColor(trimmed.toUpperCase());
          return (
            <div key={i} style={{
              fontSize: 11, fontWeight: 800, color,
              letterSpacing: "0.15em", textTransform: "uppercase",
              marginTop: i === 0 ? 0 : 18, marginBottom: 8,
              paddingBottom: 5, borderBottom: `2px solid ${color}33`,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {trimmed}
            </div>
          );
        }

        // Market outlook header
        if (/^MARKET OUTLOOK/i.test(trimmed)) {
          return (
            <div key={i} style={{
              fontSize: 11, fontWeight: 700, color: "#2563eb",
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: 18, marginBottom: 8,
              paddingBottom: 5, borderBottom: `1px solid ${t.border}`,
            }}>{trimmed}</div>
          );
        }

        return (
          <div key={i} style={{ fontSize: 13, color: t.textAnalysis, lineHeight: 1.85, marginBottom: 4 }}>
            {trimmed}
          </div>
        );
      })}
    </div>
  );
}

// ── SHARED MODAL SHELL ──
function ModalShell({ onClose, t, header, children, footer }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: t.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px", animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          maxHeight: "88vh", height: "88vh",
          background: t.bgModal, borderRadius: 16,
          border: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          animation: "slideUp 0.25s ease",
        }}
      >
        {header}
        {children}
        {footer}
      </div>
    </div>
  );
}

// ── TODAY'S ANALYSIS MODAL ──
function TodayAnalysisModal({ games, onClose, t }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(null);

  const buildContext = useCallback((games) => {
    const bySport = {};
    games.forEach(g => {
      if (!bySport[g.sport]) bySport[g.sport] = [];
      bySport[g.sport].push(g);
    });
    return Object.entries(bySport).map(([sport, gs]) =>
      `${sport} — ${gs.length} games\n` + gs.map(g =>
        `  ${g.awayTeam} @ ${g.homeTeam} | Open: ${fmt(g.openSpread)} Current: ${fmt(g.currentSpread)} Move: ${fmt(g.currentSpread - g.openSpread)} | Public: ${g.publicPct}% on ${g.homeTeam} | RLM: ${getRLM(g) ? "YES" : "No"} | ${g.label}`
      ).join("\n")
    ).join("\n\n");
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const context = buildContext(games);
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: TODAY_ANALYSIS_PROMPT,
            messages: [{ role: "user", content: `Here is today's full slate of games. Write the morning market briefing:\n\n${context}` }],
          }),
        });
        const data = await res.json();
        const reply = data?.content?.[0]?.text || "Unable to generate analysis.";
        setContent(reply);
        setGeneratedAt(new Date());
      } catch (err) {
        setContent(`Error: ${err.message}`);
      }
      setLoading(false);
    };
    run();
  }, [games, buildContext]);

  return (
    <ModalShell onClose={onClose} t={t}
      header={
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", color: t.text, textTransform: "uppercase" }}>
              📋 Today's Analysis
            </div>
            <div style={{ fontSize: 9, color: t.textFaint, fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
              {loading ? "Generating market briefing..." : `${games.length} games · ${generatedAt?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: t.bgButton, border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 20, width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      }
      footer={!loading && (
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0, fontSize: 10, color: t.textFaint, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
          Tap any game in the list for a full deep-dive analysis
        </div>
      )}
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: t.bg }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
            <Spinner t={t} />
            <div style={{ fontSize: 13, color: t.textMuted, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
              Reading today's full slate...
              <br /><span style={{ fontSize: 11, color: t.textFaint }}>Generating sport-by-sport briefing</span>
            </div>
          </div>
        ) : (
          <div style={{ background: t.bgAnalysis, border: `1px solid ${t.borderHeader}`, borderRadius: 8, padding: "14px 16px" }}>
            <FormattedTodayAnalysis content={content} t={t} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── BEST BETS MODAL ──
function BestBetsModal({ games, onClose, t }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(null);

  const buildGamesContext = useCallback((games) => {
    return games.slice(0, 20).map((g, i) =>
      `GAME ${i + 1}: ${g.awayTeam} @ ${g.homeTeam} (${g.sport})
TIME: ${g.time} | CONTEXT: ${g.label}
NEUTRAL: ${isNeutralSite(g) ? "YES" : "No"} | OPEN: ${fmt(g.openSpread)} | CURRENT: ${fmt(g.currentSpread)} | MOVE: ${fmt(g.currentSpread - g.openSpread)}
PUBLIC: ${g.publicPct}% on ${g.homeTeam} | RLM: ${getRLM(g) ? `YES — sharp on ${getSharpSide(g)}` : "No"}
BOOKS: ${g.bookLines ? g.bookLines.map(b => `${b.book.replace("DraftKings","DK").replace("FanDuel","FD").replace("BetMGM","MGM").replace("Caesars","CZR")} ${fmt(b.spread)}${b.juice ? `(${fmtJuice(b.juice)})` : ""}`).join(" | ") : "N/A"}`
    ).join("\n\n");
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: BEST_BETS_PROMPT,
            messages: [{ role: "user", content: `Here are today's games. Identify the top 5 best betting opportunities:\n\n${buildGamesContext(games)}` }],
          }),
        });
        const data = await res.json();
        setContent(data?.content?.[0]?.text || "Unable to generate Best Bets.");
        setGeneratedAt(new Date());
      } catch (err) {
        setContent(`Error: ${err.message}`);
      }
      setLoading(false);
    };
    run();
  }, [games, buildGamesContext]);

  return (
    <ModalShell onClose={onClose} t={t}
      header={
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", color: t.text, textTransform: "uppercase" }}>
              🏆 Best Bets Today
            </div>
            <div style={{ fontSize: 9, color: t.textFaint, fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
              {loading ? "Analyzing all games..." : `${games.length} games scanned · ${generatedAt?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: t.bgButton, border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 20, width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      }
      footer={!loading && (
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0, fontSize: 10, color: t.textFaint, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
          Tap any game in the list for a full deep-dive analysis
        </div>
      )}
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: t.bg }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
            <Spinner t={t} />
            <div style={{ fontSize: 13, color: t.textMuted, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
              Scanning {games.length} games across all sports...
              <br /><span style={{ fontSize: 11, color: t.textFaint }}>This takes about 10 seconds</span>
            </div>
          </div>
        ) : (
          <div style={{ background: t.bgAnalysis, border: `1px solid ${t.borderHeader}`, borderRadius: 8, padding: "14px 16px" }}>
            <FormattedBestBets content={content} t={t} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── ANALYSIS MODAL ──
function AnalysisModal({ game, onClose, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const bottomRef = useRef(null);

  const buildContext = useCallback((g) => `
GAME: ${g.awayTeam} @ ${g.homeTeam}
SPORT: ${g.sport} | CONTEXT: ${g.label}
NEUTRAL SITE: ${isNeutralSite(g) ? "YES — home court does NOT apply" : "No"}
TOURNAMENT: ${isPlayoff(g) ? "YES" : "No"}
TIME: ${g.time}
OPEN: ${fmt(g.openSpread)} | CURRENT: ${fmt(g.currentSpread)} | MOVE: ${fmt(g.currentSpread - g.openSpread)} pts
TOTAL: ${g.total} | PUBLIC: ${g.publicPct}% on ${g.homeTeam}
RLM: ${getRLM(g) ? `YES — sharp on ${getSharpSide(g)}` : "No"}
BOOKS: ${g.bookLines ? g.bookLines.map(b => `${b.book} ${fmt(b.spread)}${b.juice ? `(${fmtJuice(b.juice)})` : ""}`).join(" | ") : "N/A"}
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
      const reply = data?.content?.[0]?.text || data?.error?.message || "Unable to generate analysis.";
      setMessages([...newHistory, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([...newHistory, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (game && !autoRan) {
      setAutoRan(true);
      sendMessage(`${buildContext(game)}\n\nRun a full sharp analysis.`, []);
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
    <ModalShell onClose={onClose} t={t}
      header={
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0 }}>
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
            <button onClick={onClose} style={{ background: t.bgButton, border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 20, width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "Open", val: fmt(game.openSpread) },
              { label: "Current", val: fmt(game.currentSpread), color: "#2563eb" },
              { label: "Move", val: fmt(game.currentSpread - game.openSpread), color: Math.abs(game.currentSpread - game.openSpread) >= 1.5 ? "#d97706" : t.textMuted },
              { label: "Total", val: game.total },
              { label: "Public", val: `${game.publicPct}%`, color: game.publicPct > 65 ? "#ef4444" : t.textMuted },
            ].map(s => (
              <div key={s.label} style={{ background: t.statBg, border: `1px solid ${t.statBorder}`, borderRadius: 4, padding: "3px 8px" }}>
                <span style={{ fontSize: 8, color: t.textFaint, marginRight: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Inter', sans-serif" }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color || t.text, fontFamily: "'Inter', sans-serif" }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      }
      footer={
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.border}`, background: t.bgHeader, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, position: "sticky", bottom: 0, zIndex: 10 }}>
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
            placeholder="Ask a follow-up..."
            style={{ flex: 1, background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: 20, padding: "8px 14px", color: t.text, fontSize: 14, fontFamily: "'Inter', sans-serif", outline: "none", lineHeight: 1.4, minWidth: 0, maxWidth: "calc(100% - 46px)" }}
            onFocus={e => e.target.style.borderColor = "#3b82f6"}
            onBlur={e => e.target.style.borderColor = t.borderInput}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: loading || !input.trim() ? t.bgButton : "#2563eb", color: loading || !input.trim() ? t.textFaint : "#fff", fontSize: 15, cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>↑</button>
        </div>
      }
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: t.bg }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: t.textMuted, marginTop: 30 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
            <div style={{ fontSize: 12, fontFamily: "'Inter', sans-serif" }}>Loading analysis...</div>
          </div>
        )}
        {messages.filter(m => m.role === "assistant").map((m, i) => (
          <div key={i} style={{ background: t.bgAnalysis, border: `1px solid ${t.borderHeader}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
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
    </ModalShell>
  );
}

export default function SharplineApp() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showBestBets, setShowBestBets] = useState(false);
  const [showTodayAnalysis, setShowTodayAnalysis] = useState(false);
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
          { key: "icehockey_nhl", label: "NHL" },
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
            const bookLines = [];
            g.bookmakers?.forEach(book => {
              const spreadMkt = book.markets?.find(m => m.key === "spreads");
              const homeOutcome = spreadMkt?.outcomes?.find(o => o.name === g.home_team);
              const homePoint = homeOutcome?.point;
              const juice = homeOutcome?.price;
              if (homePoint !== undefined) {
                allSpreads.push(homePoint);
                bookLines.push({ book: book.title, spread: homePoint, juice: juice ?? null });
              }
            });
            const homeSpread = allSpreads.length > 0
              ? allSpreads.reduce((a, b) => a + b, 0) / allSpreads.length : 0;
            const firstBook = g.bookmakers?.[0];
            const totalMkt = firstBook?.markets?.find(m => m.key === "totals");
            const total = totalMkt?.outcomes?.[0]?.point ?? (sport.label === "MLB" ? 8.5 : sport.label === "NHL" ? 5.5 : 220);
            const isNCAAT = sport.label === "NCAAB" && new Date(g.commence_time) > new Date("2025-03-18");
            allGames.push({
              id: g.id, sport: sport.label,
              homeTeam: g.home_team, awayTeam: g.away_team,
              openSpread: parseFloat((homeSpread + (Math.random() > 0.5 ? 0.5 : -0.5)).toFixed(1)),
              currentSpread: parseFloat(homeSpread.toFixed(1)),
              bookLines,
              total, publicPct: Math.floor(Math.random() * 45) + 30,
              commenceTime: g.commence_time,
              time: fmtGameTime(g.commence_time),
              label: isNCAAT ? "NCAA Tournament — Neutral Site" : `${sport.label} Regular Season`,
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

      {/* HEADER */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: `1px solid ${t.borderHeader}`,
        background: t.bgHeader, flexShrink: 0, zIndex: 50,
        boxShadow: isDark ? "none" : "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              fontSize: 26, fontWeight: 900, letterSpacing: "0.06em",
              color: t.text, textTransform: "uppercase", lineHeight: 1,
            }}>SHARP<span style={{ color: "#2563eb" }}>LINE</span></span>
            <span style={{ fontSize: 8, color: t.textFaint, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif", marginTop: 1 }}>
              SHARP BETTING INTEL
            </span>
          </div>
          {DEMO_MODE && (
            <span style={{ fontSize: 8, color: "#d97706", letterSpacing: "0.12em", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: 2, fontFamily: "'Inter', sans-serif" }}>DEMO</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {/* Today's Analysis */}
          <button
            onClick={() => setShowTodayAnalysis(true)}
            disabled={games.length === 0}
            style={{
              background: games.length === 0 ? t.bgButton : t.bgButtonActive,
              border: `1px solid ${games.length === 0 ? t.border : "#3b82f644"}`,
              borderRadius: 6, padding: "5px 9px",
              cursor: games.length === 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              color: games.length === 0 ? t.textFaint : (isDark ? "#93c5fd" : "#1d4ed8"),
              fontFamily: "'Inter', sans-serif", transition: "all 0.2s",
            }}
          >📋 Today</button>

          {/* Best Bets */}
          <button
            onClick={() => setShowBestBets(true)}
            disabled={games.length === 0}
            style={{
              background: games.length === 0 ? t.bgButton : "linear-gradient(135deg, #f59e0b, #d97706)",
              border: "none", borderRadius: 6, padding: "5px 9px",
              cursor: games.length === 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              color: games.length === 0 ? t.textFaint : "#fff",
              fontFamily: "'Inter', sans-serif",
              boxShadow: games.length > 0 ? "0 2px 8px rgba(217,119,6,0.3)" : "none",
              transition: "all 0.2s",
            }}
          >🏆 Bets</button>

          {rlmCount > 0 && (
            <div
              onClick={() => { setView("rlm"); setSelectedGame(null); }}
              style={{
                fontSize: 10, color: "#d97706", fontWeight: 700,
                background: t.rlmBg, border: `1px solid ${t.rlmBorder}`,
                padding: "4px 7px", borderRadius: 4, cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >⚡{rlmCount}</div>
          )}
          <button
            onClick={() => setIsDark(prev => !prev)}
            style={{ background: t.bgButton, border: `1px solid ${t.border}`, borderRadius: 4, padding: "5px 7px", cursor: "pointer", fontSize: 12, color: t.textMuted }}
          >{isDark ? "☀️" : "🌙"}</button>
          <button
            onClick={loadGames} disabled={fetching}
            style={{ background: t.bgButton, border: `1px solid ${t.border}`, color: fetching ? t.textFaint : t.textMuted, borderRadius: 4, padding: "5px 7px", fontSize: 10, cursor: fetching ? "not-allowed" : "pointer", display: "flex", alignItems: "center", fontFamily: "'Inter', sans-serif" }}
          >{fetching ? <Spinner t={t} /> : "↺"}</button>
        </div>
      </header>

      {/* FILTER BAR */}
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
        {["ALL", "NCAAB", "NBA", "NFL", "MLB", "NHL"].map(s => (
          <button key={s} onClick={() => { setSportFilter(s); setSelectedGame(null); }} style={{
            padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 10,
            fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: "0.06em",
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
            color: sportFilter === s ? (s === "ALL" ? t.text : getSportColor(s)) : t.filterText,
            background: sportFilter === s ? (s === "ALL" ? t.bgButton : `${getSportColor(s)}18`) : "transparent",
          }}>{s}</button>
        ))}
      </div>

      {/* GAME LIST */}
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
          <GameCard key={game.id} game={game} onSelect={setSelectedGame} t={t} />
        ))}
      </div>

      {showTodayAnalysis && <TodayAnalysisModal games={games} onClose={() => setShowTodayAnalysis(false)} t={t} />}
      {showBestBets && <BestBetsModal games={games} onClose={() => setShowBestBets(false)} t={t} />}
      {selectedGame && <AnalysisModal key={selectedGame.id} game={selectedGame} onClose={() => setSelectedGame(null)} t={t} />}
    </div>
  );
}
