// ===================== DATA =====================
const TEAMS = ["Northside", "Southside", "Central", "NRB", "RSA", "REF", "PF"];

const POINT_VALUES = {
  attendanceEarly: 2,
  attendanceOnTime: 1,
  attendanceBase: 10,
  themeDayPerPerson: 5,
  socialPerPerson: 5,
  preSessionFirst: 100,
  preSessionSecond: 60,
  preSessionThird: 30,
};

const WORD_REFRESH_SECONDS = 90;
const QR_REFRESH_SECONDS = 240;
const EARLY_CUTOFF_MINUTES = 5;
const WORD_BANK = [
  "compass", "lantern", "harbor", "thicket", "meridian", "kestrel",
  "granite", "willow", "beacon", "tundra", "ember", "cascade",
];

const SAMPLE_ROSTERS = {
  Northside: ["Alex K.", "Priya S.", "Jordan M.", "Sam T.", "Devon R."],
  Southside: ["Maya L.", "Chris B.", "Nadia F.", "Omar H.", "Lily W."],
  Central: ["Jamie C.", "Rui Z.", "Ella P.", "Kofi A.", "Tara V."],
  NRB: ["Ben O.", "Sana I.", "Leo D.", "Fatima N."],
  RSA: ["Noor A.", "Theo G.", "Ivy M."],
  REF: ["Marco T.", "Yuki H."],
  PF: ["Elias", "Marcus", "Demi", "Sam", "Aline"],
};
const ROSTER_SIZES = { Northside: 17, Southside: 16, Central: 18, NRB: 15, RSA: 14, REF: 12, PF: 20 };

const SRSS_PASSCODE = "FISST2026"; // shared passcode — change before real rollout

// ===================== HELPERS =====================
function slugify(str) {
  return String(str)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
  return hash;
}

// ===================== DEBUG LOG =====================
window.__rtcDebug = window.__rtcDebug || [];
function debugLog(entry) {
  const line = `${new Date().toLocaleTimeString()} - ${entry}`;
  window.__rtcDebug = [...window.__rtcDebug, line].slice(-50);
  renderDebugPanel();
}

// ===================== DATA MODEL =====================
function emptySessionConfig() {
  return {
    rtcActive: true,
    sessionName: "",
    teamTimes: TEAMS.reduce((acc, t) => { acc[t] = null; return acc; }, {}),
  };
}

function makeEmptyDay(dayLabel) {
  return {
    label: dayLabel,
    sessionConfig: { AM: emptySessionConfig(), PM: emptySessionConfig() },
    attendanceRecords: { AM: [], PM: [] },
    rejectedCheckIns: [],
    themeDay: TEAMS.map((team) => ({ team, roster: SAMPLE_ROSTERS[team] || [], onTheme: [] })),
    socials: TEAMS.map((team) => ({ team, roster: SAMPLE_ROSTERS[team] || [], attendees: [] })),
    preSessionAM: null,
    preSessionPM: null,
    arbitraryAwards: [],
    rosterSizes: { ...ROSTER_SIZES },
    excused: {
      AM: TEAMS.reduce((a, t) => { a[t] = 0; return a; }, {}),
      PM: TEAMS.reduce((a, t) => { a[t] = 0; return a; }, {}),
    },
  };
}

function groupTeamsByTime(teamTimes) {
  const groups = {};
  TEAMS.forEach((team) => {
    const t = teamTimes[team];
    if (!t) return;
    const key = `${t.hour}:${t.minute}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(team);
  });
  return groups;
}

function sessionIsLive(sessionConfig) {
  return TEAMS.every((team) => sessionConfig.teamTimes[team] !== null);
}

// ===================== POINT CALCULATION =====================
function calculateCumulativeTotals(days) {
  const totals = {};
  TEAMS.forEach((team) => { totals[team] = { attendance: 0, themeDay: 0, social: 0, preSession: 0, arbitrary: 0 }; });

  days.forEach((day) => {
    ["AM", "PM"].forEach((sessionWindow) => {
      if (!day.sessionConfig[sessionWindow].rtcActive) return;
      day.attendanceRecords[sessionWindow].forEach((rec) => {
        if (rec.tier === "early") totals[rec.team].attendance += POINT_VALUES.attendanceBase * POINT_VALUES.attendanceEarly;
        else if (rec.tier === "on-time") totals[rec.team].attendance += POINT_VALUES.attendanceBase * POINT_VALUES.attendanceOnTime;
      });
    });

    day.themeDay.forEach((row) => { totals[row.team].themeDay += row.onTheme.length * POINT_VALUES.themeDayPerPerson; });
    day.socials.forEach((row) => { totals[row.team].social += row.attendees.length * POINT_VALUES.socialPerPerson; });

    [day.preSessionAM, day.preSessionPM].forEach((session) => {
      if (!session) return;
      if (session.first && totals[session.first]) totals[session.first].preSession += POINT_VALUES.preSessionFirst;
      if (session.second && totals[session.second]) totals[session.second].preSession += POINT_VALUES.preSessionSecond;
      if (session.third && totals[session.third]) totals[session.third].preSession += POINT_VALUES.preSessionThird;
    });

    day.arbitraryAwards.forEach((award) => { totals[award.team].arbitrary += award.points; });
  });

  return totals;
}

// ===================== FIRESTORE STORAGE LAYER =====================
// Each RSSTI day is stored as ONE document, keyed by a safe slugified label
// (e.g. "day-1"). This keeps reads/writes cheap and matches the proven
// pattern from the bingo app: one document per unit of data, real retry
// logic on both reads and writes, no silent failures.

function dayDocRef(label) {
  const { db, doc } = window.__firebase;
  return doc(db, "rtcDays", slugify(label));
}

async function loadDay(label, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const { getDoc } = window.__firebase;
  try {
    const snap = await getDoc(dayDocRef(label));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    const isTransient = /unavailable|timeout|network|internal/i.test(e.message || "");
    if (isTransient && attempt < MAX_ATTEMPTS) {
      debugLog(`loadDay(${label}) attempt ${attempt} failed (${e.message}), retrying...`);
      await sleep(400 * attempt);
      return loadDay(label, attempt + 1);
    }
    debugLog(`loadDay(${label}) FAILED: ${e.message || e}`);
    return null;
  }
}

async function saveDay(label, dayData, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const { setDoc } = window.__firebase;
  try {
    await setDoc(dayDocRef(label), dayData);
    debugLog(`saveDay(${label}) -> ok`);
    return true;
  } catch (e) {
    const isRateLimit = /rate limit|resource-exhausted/i.test(e.message || "");
    const isTransient = isRateLimit || /unavailable|timeout|network|internal/i.test(e.message || "");
    if (isTransient && attempt < MAX_ATTEMPTS) {
      const waitMs = isRateLimit ? 1500 * attempt : 400 * attempt;
      debugLog(`saveDay(${label}) attempt ${attempt} failed (${e.message}), retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      return saveDay(label, dayData, attempt + 1);
    }
    debugLog(`saveDay(${label}) FAILED: ${e.message || e}`);
    throw e;
  }
}

// The "index" doc tracks which day labels exist and their order, so we know
// how many days have been recorded without needing to guess/scan.
async function loadDayIndex() {
  try {
    const res = await loadDay("__index__");
    return res && res.labels ? res.labels : null;
  } catch {
    return null;
  }
}

async function saveDayIndex(labels) {
  return saveDay("__index__", { labels });
}

// ===================== GLOBAL ERROR SAFETY NET =====================
// Catches anything that slips past individual try/catch blocks, so we never
// end up staring at a blank/stuck screen with zero information about why.
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
  if (state.loading) {
    state.loading = false;
    state.storageError = true;
    state.lastBootError = `${event.error?.name || "Error"}: ${event.error?.message || event.message}`;
    render();
  }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  if (state.loading) {
    state.loading = false;
    state.storageError = true;
    state.lastBootError = `Unhandled promise rejection: ${event.reason?.message || String(event.reason)}`;
    render();
  }
});

// ===================== APP STATE =====================
const state = {
  loading: true,
  storageError: false,
  days: [],
  currentUser: "admin-check", // not really used, placeholder for future per-user features
  view: "public", // public | admin
  publicTab: "leaderboard", // leaderboard | checkin
  adminTab: "leaderboard",
  showGate: false,
  gateError: "",
  // live QR/word state, keyed by groupKey -> { word, wordSecondsLeft, qrToken, qrSecondsLeft }
  liveCodes: {},
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function today() {
  return state.days[state.days.length - 1];
}

// ===================== LIVE QR/WORD GENERATION =====================
// Each distinct time-group gets its own independent word/QR cycle, keyed by
// a stable groupKey so multiple simultaneous groups never collide.
function ensureLiveCode(groupKey) {
  if (state.liveCodes[groupKey]) return state.liveCodes[groupKey];
  const startIndex = Math.abs(hashCode(groupKey)) % WORD_BANK.length;
  const code = {
    wordIndex: startIndex,
    word: WORD_BANK[startIndex],
    wordSecondsLeft: WORD_REFRESH_SECONDS,
    qrToken: 1,
    qrSecondsLeft: QR_REFRESH_SECONDS,
  };
  state.liveCodes[groupKey] = code;
  return code;
}

function tickLiveCodes() {
  let changed = false;
  Object.keys(state.liveCodes).forEach((key) => {
    const code = state.liveCodes[key];
    code.wordSecondsLeft -= 1;
    if (code.wordSecondsLeft <= 0) {
      code.wordIndex = (code.wordIndex + 1) % WORD_BANK.length;
      code.word = WORD_BANK[code.wordIndex];
      code.wordSecondsLeft = WORD_REFRESH_SECONDS;
      changed = true;
    }
    code.qrSecondsLeft -= 1;
    if (code.qrSecondsLeft <= 0) {
      code.qrToken += 1;
      code.qrSecondsLeft = QR_REFRESH_SECONDS;
      changed = true;
    }
  });
  if (changed || Object.keys(state.liveCodes).length > 0) renderDisplayScreensIfVisible();
}

function renderDisplayScreensIfVisible() {
  // Only re-render the timer bars/words in place, not a full app re-render,
  // to avoid disrupting any in-progress form input elsewhere on screen.
  document.querySelectorAll("[data-group-card]").forEach((el) => {
    const key = el.dataset.groupCard;
    const code = state.liveCodes[key];
    if (!code) return;
    const wordEl = el.querySelector("[data-word]");
    const qrEl = el.querySelector("[data-qr]");
    const wordBarEl = el.querySelector("[data-word-bar]");
    const qrBarEl = el.querySelector("[data-qr-bar]");
    if (wordEl) wordEl.textContent = code.word;
    if (wordBarEl) wordBarEl.style.width = `${(code.wordSecondsLeft / WORD_REFRESH_SECONDS) * 100}%`;
    if (qrBarEl) qrBarEl.style.width = `${(code.qrSecondsLeft / QR_REFRESH_SECONDS) * 100}%`;
    if (qrEl) qrEl.innerHTML = renderQRVisual(code.qrToken);
  });
}

function renderQRVisual(token) {
  const size = 21;
  const cells = [];
  let seed = token * 9301 + 49297;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < size * size; i++) cells.push(rand() > 0.55);
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  let inner = `<rect width="${size}" height="${size}" fill="#fff"/>`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFinder(r, c)) continue;
      if (cells[r * size + c]) inner += `<rect x="${c}" y="${r}" width="1" height="1" fill="#001E51"/>`;
    }
  }
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([fr, fc]) => {
    inner += `<rect x="${fc}" y="${fr}" width="7" height="7" fill="#001E51"/>`;
    inner += `<rect x="${fc + 1}" y="${fr + 1}" width="5" height="5" fill="#fff"/>`;
    inner += `<rect x="${fc + 2}" y="${fr + 2}" width="3" height="3" fill="#001E51"/>`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="160" height="160" style="display:block">${inner}</svg>`;
}

// ===================== BOOT =====================
async function boot() {
  try {
    const labels = await loadDayIndex();
    if (!labels || labels.length === 0) {
      // First-ever load: seed a real empty Day 1 (no fake sample data in the
      // real deployment — that was only for the React demo).
      const day1 = makeEmptyDay("Day 1");
      await saveDay("Day 1", day1);
      await saveDayIndex(["Day 1"]);
      state.days = [day1];
    } else {
      const loaded = await Promise.all(labels.map((l) => loadDay(l)));
      state.days = loaded.map((d, i) => d || makeEmptyDay(labels[i]));
    }
    state.loading = false;
    state.storageError = false;
    render();
  } catch (e) {
    console.error("Boot failed:", e);
    state.loading = false;
    state.storageError = true;
    state.lastBootError = `${e.name || "Error"}: ${e.message || String(e)}`;
    render();
  }
}

// (boot sequence moved to end of file, after all render/wire functions are defined)

// ===================== RENDER =====================
const root = document.getElementById("root");

function render() {
  if (state.loading) {
    root.innerHTML = `<div class="loading-shell"><p class="loading-text">Loading RTC...</p></div>`;
    return;
  }
  if (state.storageError) {
    const lastLogs = (window.__rtcDebug || []).slice(-8);
    root.innerHTML = `
      <div class="loading-shell">
        <div class="error-box">
          <p class="error-title">Couldn't connect to storage</p>
          <p class="error-sub">Something went wrong loading RTC data. Check your connection and try again.</p>
          ${state.lastBootError ? `<p style="font-size:11px;color:#b3422a;margin-top:10px;word-break:break-word;background:#fff0ed;padding:8px;border-radius:6px">${escapeHtml(state.lastBootError)}</p>` : `<p style="font-size:11px;color:#8a8a7e;margin-top:10px">No specific error captured — this suggests the app failed before it could log anything.</p>`}
          <button class="submit-btn" style="margin-top:16px" id="retry-btn">Try again</button>
          ${lastLogs.length > 0 ? `<div style="margin-top:16px;text-align:left;font-family:monospace;font-size:10px;background:#0a0a0a;color:#6f6;padding:8px;border-radius:6px;max-height:150px;overflow-y:auto">${lastLogs.map((l) => escapeHtml(l)).join("<br/>")}</div>` : ""}
        </div>
      </div>`;
    document.getElementById("retry-btn").onclick = () => { state.loading = true; state.lastBootError = null; render(); boot(); };
    return;
  }

  root.innerHTML = state.view === "admin" ? renderAdminHtml() : renderPublicHtml();
  wireAll();
  renderDebugPanel();
}

function renderDebugPanel() {
  const el = document.getElementById("debug-panel-body");
  if (!el) return;
  const lines = window.__rtcDebug || [];
  el.innerHTML = lines.length === 0 ? "<p>No storage activity yet.</p>" : lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
}

function debugBarHtml() {
  return `
    <div class="tab-bar" style="margin-bottom:8px">
      <button class="tab-btn" id="debug-toggle" type="button">🐛 Debug log</button>
    </div>
    <div class="card" id="debug-panel" style="display:none;max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;background:#0a0a0a;color:#6f6;margin-bottom:16px">
      <div id="debug-panel-body"></div>
    </div>`;
}

// ---------- Public (RSS-facing) view ----------
function renderPublicHtml() {
  let html = `
    <div class="shell">
      ${debugBarHtml()}
      <header class="header">
        <p class="eyebrow">RSSTI - RESIDENCE TRAINING COMPETITION</p>
        <h1 class="title">RTC</h1>
        <p class="sub">Live standings</p>
      </header>
      <div class="tab-bar">
        <button class="tab-btn ${state.publicTab === "leaderboard" ? "tab-btn-active" : ""}" data-public-tab="leaderboard">🏆 Leaderboard</button>
        <button class="tab-btn ${state.publicTab === "checkin" ? "tab-btn-active" : ""}" data-public-tab="checkin">📱 Check-In</button>
        <button class="srss-link" id="srss-login-btn">SRSS Login</button>
      </div>`;

  if (state.publicTab === "leaderboard") html += renderPublicLeaderboardHtml();
  if (state.publicTab === "checkin") html += renderCheckInFormHtml();

  if (state.showGate) html += renderPasscodeGateHtml();

  html += `</div>`;
  return html;
}

function renderPublicLeaderboardHtml() {
  const totals = calculateCumulativeTotals(state.days);
  const rows = TEAMS.map((team) => {
    const t = totals[team];
    const total = t.attendance + t.themeDay + t.social + t.preSession + t.arbitrary;
    return { team, total, ...t };
  }).sort((a, b) => b.total - a.total);

  return `
    <div class="card">
      <p class="card-note">RTC standings - updated as SRSS logs points throughout each day.</p>
      <table>
        <thead><tr><th>Rank</th><th>Team</th><th>Total</th><th>Attendance</th><th>Theme Day</th><th>Social</th><th>Pre-Session</th></tr></thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr class="${i === 0 ? "tr-first" : ""}">
              <td>${i + 1}</td>
              <td style="font-weight:700">${escapeHtml(row.team)}</td>
              <td style="font-weight:700;color:#0080A2">${row.total}</td>
              <td>${row.attendance}</td>
              <td>${row.themeDay}</td>
              <td>${row.social}</td>
              <td>${row.preSession}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderPasscodeGateHtml() {
  return `
    <div class="modal-backdrop" id="gate-backdrop">
      <div class="form-card" style="max-width:380px" id="gate-inner">
        <p class="form-eyebrow">SRSS Only</p>
        <h2 class="form-title">Enter admin passcode</h2>
        <input type="password" id="gate-input" placeholder="Passcode" />
        ${state.gateError ? `<p class="form-error">${escapeHtml(state.gateError)}</p>` : ""}
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="submit-btn" id="gate-cancel" style="background:transparent;color:#001E51;border:2px solid #001E51">Cancel</button>
          <button class="submit-btn" id="gate-submit">Unlock</button>
        </div>
      </div>
    </div>`;
}

// ---------- Check-in form state (module-level, since it's a simple form) ----------
const checkinFormState = { name: "", team: "", window: "AM", enteredWord: "", result: null };

function renderCheckInFormHtml() {
  const day = today();
  const result = checkinFormState.result;

  if (result && (result.status === "success" || result.status === "late")) {
    return `
      <div class="form-shell">
        <div class="form-card">
          <p class="result-icon">${result.status === "success" ? "✅" : "⏱"}</p>
          <h2 class="result-title">${result.status === "success" ? "You're checked in!" : "Checked in - no points"}</h2>
          <p class="result-message">${escapeHtml(result.message)}</p>
          <p class="result-detail">${escapeHtml(checkinFormState.name)} · ${escapeHtml(checkinFormState.team)} · ${checkinFormState.window}</p>
          <button class="submit-btn" id="checkin-reset" style="margin-top:16px">Log another check-in (demo)</button>
        </div>
      </div>`;
  }

  return `
    <div class="form-shell">
      <div class="form-card">
        <p class="form-eyebrow">RTC CHECK-IN</p>
        <h2 class="form-title">Confirm your attendance</h2>
        <p class="demo-note">Demo note: in the real deployed version, "window" and the correct word are determined automatically by which QR code you scan. Here, pick them manually to test the flow.</p>
        <label class="field-label">Window (auto-detected from QR in real version)</label>
        <select id="checkin-window">
          <option value="AM" ${checkinFormState.window === "AM" ? "selected" : ""}>AM</option>
          <option value="PM" ${checkinFormState.window === "PM" ? "selected" : ""}>PM</option>
        </select>
        <label class="field-label">Your name</label>
        <input type="text" id="checkin-name" placeholder="e.g. Priya Sharma" value="${escapeHtml(checkinFormState.name)}" />
        <label class="field-label">Your team</label>
        <select id="checkin-team">
          <option value="">— choose your team —</option>
          ${TEAMS.map((t) => `<option value="${t}" ${checkinFormState.team === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <label class="field-label">Word shown on your group's display screen</label>
        <input type="text" id="checkin-word" placeholder="Type the word" value="${escapeHtml(checkinFormState.enteredWord)}" />
        ${result && result.status === "error" ? `<p class="form-error">${escapeHtml(result.message)}</p>` : ""}
        <button class="submit-btn" id="checkin-submit">Check In</button>
      </div>
    </div>`;
}

function computeTierForTeamTime(teamTime) {
  const sessionStart = new Date();
  sessionStart.setHours(teamTime.hour, teamTime.minute, 0, 0);
  const now = new Date();
  const diffMinutes = (sessionStart - now) / (60 * 1000);
  if (diffMinutes >= EARLY_CUTOFF_MINUTES) return "early";
  if (diffMinutes >= 0) return "on-time";
  return "late";
}

async function submitCheckIn() {
  const name = checkinFormState.name.trim();
  const team = checkinFormState.team;
  const sessionWindow = checkinFormState.window;
  const enteredWord = checkinFormState.enteredWord.trim();

  if (!name || !team) {
    checkinFormState.result = { status: "error", message: "Please fill in your name and team." };
    render();
    return;
  }

  const day = today();
  const config = day.sessionConfig[sessionWindow];
  if (!sessionIsLive(config)) {
    checkinFormState.result = { status: "error", message: `${sessionWindow} check-in isn't open today - not every team has a session this window.` };
    render();
    return;
  }
  const teamTime = config.teamTimes[team];
  if (!teamTime) {
    await addRejectedCheckIn(name, team, sessionWindow, "No session configured for this team this window");
    checkinFormState.result = { status: "error", message: `Your team doesn't have a ${sessionWindow} session today.` };
    render();
    return;
  }
  if (!enteredWord) {
    checkinFormState.result = { status: "error", message: "Please enter the word shown on your group's display screen." };
    render();
    return;
  }

  const tier = computeTierForTeamTime(teamTime);

  if (tier === "late") {
    await addAttendanceRecord(name, team, sessionWindow, tier);
    checkinFormState.result = { status: "late", message: "You're checked in, but this session's window has passed - no points awarded." };
  } else {
    await addAttendanceRecord(name, team, sessionWindow, tier);
    const rtcActive = config.rtcActive;
    checkinFormState.result = {
      status: "success", tier,
      message: !rtcActive
        ? "Checked in - attendance recorded."
        : tier === "early"
        ? "Checked in early! Your team earns double points for this one."
        : "Checked in on time. Your team earns standard points for this one.",
    };
  }
  render();
}

// ---------- Display Screen ----------
function renderDisplayScreenHtml(sessionWindow) {
  const day = today();
  const config = day.sessionConfig[sessionWindow];
  const live = sessionIsLive(config);

  if (!live) {
    return `
      <div class="display-shell">
        <p class="display-eyebrow">RSSTI - RESIDENCE TRAINING COMPETITION</p>
        <h1 class="display-title">${sessionWindow} Check-In</h1>
        <p style="color:#fff;font-size:15px">Not all teams have a ${sessionWindow} session configured today - check-in is closed for this window.</p>
      </div>`;
  }

  const groups = groupTeamsByTime(config.teamTimes);
  let cardsHtml = "";
  Object.entries(groups).forEach(([timeKey, teams]) => {
    const [hour, minute] = timeKey.split(":").map(Number);
    const groupKey = `${day.label}-${sessionWindow}-${timeKey}`;
    const code = ensureLiveCode(groupKey);
    const timeLabel = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${minute.toString().padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
    cardsHtml += `
      <div class="group-card" data-group-card="${groupKey}">
        <p class="group-card-teams">${teams.join(" + ")}</p>
        <p class="group-card-time">Starts ${timeLabel}</p>
        <div class="group-card-row">
          <div>
            <div class="qr-wrap" data-qr>${renderQRVisual(code.qrToken)}</div>
            <div class="timer-bar-small"><div class="timer-fill" data-qr-bar style="width:${(code.qrSecondsLeft / QR_REFRESH_SECONDS) * 100}%;background:#0080A2"></div></div>
          </div>
          <div class="word-block-small">
            <p class="word-label-small">Word</p>
            <p class="word-small" data-word>${code.word}</p>
            <div class="timer-bar-small"><div class="timer-fill" data-word-bar style="width:${(code.wordSecondsLeft / WORD_REFRESH_SECONDS) * 100}%;background:#FAC507"></div></div>
          </div>
        </div>
      </div>`;
  });

  return `
    <div class="display-shell">
      <p class="display-eyebrow">RSSTI - RESIDENCE TRAINING COMPETITION</p>
      <h1 class="display-title">${escapeHtml(config.sessionName || `${sessionWindow} Check-In`)}</h1>
      <div class="group-grid">${cardsHtml}</div>
      <p class="footnote">Words refresh every ${WORD_REFRESH_SECONDS}s · QR codes refresh every ${QR_REFRESH_SECONDS / 60} min · each group's screen is independent</p>
    </div>`;
}

// ---------- Admin Dashboard ----------
function renderAdminHtml() {
  const day = today();
  const totals = calculateCumulativeTotals(state.days);

  let html = `
    <div class="shell">
      ${debugBarHtml()}
      <div class="lock-bar"><button class="lock-btn" id="lock-btn">🔒 Lock & Return to Public View</button></div>
      <header class="header">
        <p class="eyebrow">SRSS ADMIN · RESIDENCE TRAINING COMPETITION</p>
        <h1 class="title">RTC Dashboard</h1>
        <p class="sub">Live data, saved to Firestore</p>
      </header>
      <div class="day-bar">
        <span class="day-badge">📅 Currently logging: ${escapeHtml(day.label)}</span>
        <button class="new-day-btn" id="new-day-btn">+ Start New Day</button>
        <span class="cutoff-hint">${state.days.length} day${state.days.length !== 1 ? "s" : ""} recorded</span>
      </div>
      <div class="tab-bar">
        ${["leaderboard", "session setup", "attendance records", "manual entry", "display"].map((tab) => `
          <button class="tab-btn ${state.adminTab === tab ? "tab-btn-active" : ""}" data-admin-tab="${tab}">
            ${tab === "leaderboard" ? "🏆 Leaderboard" : tab === "session setup" ? "⏰ Session Setup" : tab === "attendance records" ? "📋 Attendance Records" : tab === "manual entry" ? "✏️ Manual Entry" : "🖥 Display Screens"}
          </button>`).join("")}
      </div>`;

  if (state.adminTab !== "display") {
    html += `
      <div class="export-row">
        <button class="export-btn" id="export-btn">⬇ Export to Excel</button>
        <span class="export-hint">Exports cumulative totals across all ${state.days.length} day${state.days.length !== 1 ? "s" : ""}, plus a Rejected Check-Ins tab</span>
      </div>`;
  }

  if (state.adminTab === "leaderboard") html += renderAdminLeaderboardHtml(totals, day);
  if (state.adminTab === "session setup") html += renderSessionSetupHtml(day);
  if (state.adminTab === "attendance records") html += renderAttendanceRecordsHtml(day);
  if (state.adminTab === "manual entry") html += renderManualEntryHtml(day);
  if (state.adminTab === "display") html += renderDisplayTabHtml(day);

  html += `</div>`;
  return html;
}

function renderAdminLeaderboardHtml(totals, day) {
  const rows = TEAMS.map((team) => {
    const t = totals[team];
    const total = t.attendance + t.themeDay + t.social + t.preSession + t.arbitrary;
    return { team, total, ...t };
  }).sort((a, b) => b.total - a.total);

  return `
    <div class="card">
      <p class="card-note">Cumulative totals across all ${state.days.length} day${state.days.length !== 1 ? "s" : ""}.</p>
      <table>
        <thead><tr><th>Rank</th><th>Team</th><th>Total</th><th>Attendance</th><th>Theme Day</th><th>Social</th><th>Pre-Session</th><th>Arbitrary</th></tr></thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr class="${i === 0 ? "tr-first" : ""}">
              <td>${i + 1}</td>
              <td style="font-weight:700">${escapeHtml(row.team)}</td>
              <td style="font-weight:700;color:#0080A2">${row.total}</td>
              <td>${row.attendance}</td>
              <td>${row.themeDay}</td>
              <td>${row.social}</td>
              <td>${row.preSession}</td>
              <td style="color:${row.arbitrary < 0 ? "#b3422a" : "#2B2B2B"}">${row.arbitrary}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div style="margin-top:14px">
        ${["AM", "PM"].map((w) => `
          <p class="card-note">${w} today: ${sessionIsLive(day.sessionConfig[w]) ? "live" : "not running (missing team times)"} · RTC points ${day.sessionConfig[w].rtcActive ? "ON" : "OFF"} this window</p>
        `).join("")}
      </div>
    </div>`;
}

function renderSessionSetupHtml(day) {
  let html = `<div class="card"><p class="card-note">Set each team's start time for today. If ANY team is left blank for a window, that whole window won't run for anyone (fairness rule) - no check-in opens, no one earns attendance points.</p>`;

  ["AM", "PM"].forEach((sessionWindow) => {
    const config = day.sessionConfig[sessionWindow];
    const live = sessionIsLive(config);
    html += `
      <div class="session-setup-block">
        <div class="header-row">
          <p class="section-label">${sessionWindow} Window ${live ? '<span class="live-badge">● LIVE TODAY</span>' : '<span class="not-live-badge">Not running today</span>'}</p>
          <label class="toggle-label"><input type="checkbox" data-toggle-rtc="${sessionWindow}" ${config.rtcActive ? "checked" : ""}/> Counts toward RTC points today</label>
        </div>
        <div style="margin-bottom:12px">
          <label class="form-label">Session name (shown to RSS on the display screen)</label>
          <input type="text" data-session-name="${sessionWindow}" placeholder="e.g. Fire Safety Training" value="${escapeHtml(config.sessionName)}" style="max-width:320px"/>
        </div>
        <div class="team-time-grid">
          ${TEAMS.map((team) => {
            const t = config.teamTimes[team];
            if (t) {
              return `
                <div class="team-time-row">
                  <span class="team-time-label">${team}</span>
                  <span class="time-picker-wrap">
                    <select class="cutoff-select" data-time-hour="${sessionWindow}|${team}">
                      ${Array.from({ length: 12 }, (_, i) => i + 7).map((h) => `<option value="${h}" ${t.hour === h ? "selected" : ""}>${h > 12 ? h - 12 : h}${h >= 12 ? " PM" : " AM"}</option>`).join("")}
                    </select>
                    <span class="time-picker-colon">:</span>
                    <select class="cutoff-select" data-time-minute="${sessionWindow}|${team}">
                      ${[0, 15, 30, 45].map((m) => `<option value="${m}" ${t.minute === m ? "selected" : ""}>${m.toString().padStart(2, "0")}</option>`).join("")}
                    </select>
                    <button class="clear-time-btn" data-clear-time="${sessionWindow}|${team}">Clear</button>
                  </span>
                </div>`;
            }
            return `
              <div class="team-time-row">
                <span class="team-time-label">${team}</span>
                <button class="set-time-btn" data-set-time="${sessionWindow}|${team}">+ Set time</button>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  });

  html += `</div>`;
  return html;
}

function renderAttendanceRecordsHtml(day) {
  const w = state.attendanceRecordsWindow || "AM";
  let html = `
    <div class="card">
      <p class="card-note">Individual check-in records. Click a record to correct its tier, add a note, or remove it (e.g. proxy-attendance, someone left after scanning).</p>
      <div class="sub-tab-bar">
        ${["AM", "PM"].map((win) => `<button class="sub-tab-btn ${w === win ? "sub-tab-btn-active" : ""}" data-records-window="${win}">${win} ${!day.sessionConfig[win].rtcActive ? "(RTC off)" : ""}</button>`).join("")}
      </div>`;

  TEAMS.forEach((team) => {
    const records = day.attendanceRecords[w].filter((r) => r.team === team);
    html += `<div class="team-block"><p class="section-label">${team} - ${records.length} check-in${records.length !== 1 ? "s" : ""}</p>`;
    if (records.length === 0) {
      html += `<p class="card-note">No check-ins yet.</p>`;
    } else {
      html += `<table><thead><tr><th>Name</th><th>Tier</th><th>Time</th><th>Notes</th><th></th></tr></thead><tbody>`;
      records.forEach((rec, i) => {
        const editKey = `${w}|${team}|${i}`;
        const isEditing = state.editingRecord === editKey;
        if (isEditing) {
          html += `
            <tr>
              <td>${escapeHtml(rec.name)}</td>
              <td>
                <select id="edit-tier-${editKey.replace(/\|/g, "-")}">
                  ${["early", "on-time", "late", "removed"].map((t) => `<option value="${t}" ${rec.tier === t ? "selected" : ""}>${t}</option>`).join("")}
                </select>
              </td>
              <td>${new Date(rec.timestamp).toLocaleTimeString()}</td>
              <td><input type="text" id="edit-notes-${editKey.replace(/\|/g, "-")}" value="${escapeHtml(rec.notes || "")}"/></td>
              <td><button class="mini-btn" data-save-record="${editKey}">Save</button></td>
            </tr>`;
        } else {
          html += `
            <tr>
              <td style="font-weight:700">${escapeHtml(rec.name)}</td>
              <td>${rec.tier}</td>
              <td>${new Date(rec.timestamp).toLocaleTimeString()}</td>
              <td>${escapeHtml(rec.notes || "—")}</td>
              <td><button class="adjust-btn" data-edit-record="${editKey}">✎</button></td>
            </tr>`;
        }
      });
      html += `</tbody></table>`;
    }
    html += `
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <input type="text" placeholder="Add a manual record - name" style="max-width:180px" id="manual-name-${team}"/>
        <select id="manual-tier-${team}"><option value="early">early</option><option value="on-time" selected>on-time</option><option value="late">late</option></select>
        <button class="submit-btn" data-add-manual="${w}|${team}">+ Add</button>
      </div>
    </div>`;
  });

  html += `</div>`;
  return html;
}

function renderManualEntryHtml(day) {
  const cat = state.manualEntryCategory || "theme-day";
  const categories = [
    { key: "theme-day", label: "Theme Day" },
    { key: "social", label: "Social Attendance" },
    { key: "pre-session", label: "Pre-Session Activity" },
    { key: "arbitrary", label: "Arbitrary Award" },
    { key: "excused", label: "Roster & Excused" },
  ];

  let html = `<div class="sub-tab-bar">${categories.map((c) => `<button class="sub-tab-btn ${cat === c.key ? "sub-tab-btn-active" : ""}" data-manual-cat="${c.key}">${c.label}</button>`).join("")}</div><div class="card">`;

  if (cat === "theme-day") {
    html += `<p class="card-note">Tap each individual confirmed dressed on-theme today (${day.label}). Points earned per person.</p>`;
    day.themeDay.forEach((row) => {
      html += `
        <div class="team-block">
          <p class="section-label">${row.team} - ${row.onTheme.length}/${row.roster.length} on-theme (+${row.onTheme.length * POINT_VALUES.themeDayPerPerson} pts)</p>
          <div class="team-grid">
            ${row.roster.map((person) => {
              const isOn = row.onTheme.some((e) => e.name === person);
              return `<button class="team-toggle ${isOn ? "team-toggle-active" : ""}" data-theme-toggle="${row.team}|${person}"><span>${escapeHtml(person)}</span><span>${isOn ? "✅ On-theme" : "Not yet"}</span></button>`;
            }).join("")}
          </div>
        </div>`;
    });
  }

  if (cat === "social") {
    html += `<p class="card-note">Tap each individual confirmed present 30+ min at today's social (${day.label}).</p>`;
    day.socials.forEach((row) => {
      html += `
        <div class="team-block">
          <p class="section-label">${row.team} - ${row.attendees.length}/${row.roster.length} attended (+${row.attendees.length * POINT_VALUES.socialPerPerson} pts)</p>
          <div class="team-grid">
            ${row.roster.map((person) => {
              const isIn = row.attendees.some((e) => e.name === person);
              return `<button class="team-toggle ${isIn ? "team-toggle-active" : ""}" data-social-toggle="${row.team}|${person}"><span>${escapeHtml(person)}</span><span>${isIn ? "✅ Attended" : "Not yet"}</span></button>`;
            }).join("")}
          </div>
        </div>`;
    });
  }

  if (cat === "pre-session") {
    html += `<p class="card-note">Record today's pre-session winners, if one happened. Not every session has one.</p>`;
    ["AM", "PM"].forEach((sessionKey) => {
      const session = day[`preSession${sessionKey}`];
      const hasActivity = session !== null;
      html += `
        <div class="session-setup-block">
          <div class="header-row">
            <p class="section-label">${sessionKey} Session</p>
            <label class="toggle-label"><input type="checkbox" data-no-activity="${sessionKey}" ${!hasActivity ? "checked" : ""}/> No activity today</label>
          </div>
          ${hasActivity ? `
            <div class="rank-row">
              ${["first", "second", "third"].map((place, pi) => `
                <div class="rank-picker">
                  <label class="rank-label">${["1st", "2nd", "3rd"][pi]}</label>
                  <select data-rank="${sessionKey}|${place}">
                    <option value="">—</option>
                    ${TEAMS.map((t) => `<option value="${t}" ${session[place] === t ? "selected" : ""}>${t}</option>`).join("")}
                  </select>
                </div>`).join("")}
            </div>` : ""}
        </div>`;
    });
  }

  if (cat === "arbitrary") {
    html += `
      <p class="card-note">Log a one-off point award or deduction (${day.label}). Use a negative number to subtract points.</p>
      <div class="form-grid">
        <div><label class="form-label">Team</label><select id="arb-team">${TEAMS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></div>
        <div><label class="form-label">Points (negative to subtract)</label><input type="number" id="arb-points" value="10"/></div>
        <div style="grid-column:1/-1"><label class="form-label">Note</label><input type="text" id="arb-note" placeholder="e.g. Great question during Session 3"/></div>
        <div><label class="form-label">Entered by</label><input type="text" id="arb-entered-by" placeholder="e.g. CA - Jess"/></div>
      </div>
      <button class="submit-btn" id="arb-submit">+ Add Entry</button>
      <p class="card-note" style="margin-top:20px">Today's log:</p>
      <table><thead><tr><th>Team</th><th>Points</th><th>Note</th><th>Entered By</th></tr></thead><tbody>
        ${day.arbitraryAwards.map((a) => `
          <tr>
            <td style="font-weight:700">${escapeHtml(a.team)}</td>
            <td style="color:${a.points < 0 ? "#b3422a" : "#2B2B2B"}">${a.points > 0 ? "+" : ""}${a.points}</td>
            <td>${escapeHtml(a.note)}</td>
            <td>${escapeHtml(a.enteredBy)}</td>
          </tr>`).join("")}
      </tbody></table>`;
  }

  if (cat === "excused") {
    html += `
      <p class="card-note">Adjust roster size if a team's headcount changes. Excused absences are per session/day and reset automatically.</p>
      <table><thead><tr><th>Team</th><th>Roster</th><th>Excused (AM)</th><th>Excused (PM)</th></tr></thead><tbody>
        ${TEAMS.map((team) => `
          <tr>
            <td style="font-weight:700">${team}</td>
            <td><button class="adjust-btn" data-roster="${team}|-1">−</button><span class="adjust-value">${day.rosterSizes[team]}</span><button class="adjust-btn" data-roster="${team}|1">+</button></td>
            <td><button class="adjust-btn" data-excused="AM|${team}|-1">−</button><span class="adjust-value">${day.excused.AM[team]}</span><button class="adjust-btn" data-excused="AM|${team}|1">+</button></td>
            <td><button class="adjust-btn" data-excused="PM|${team}|-1">−</button><span class="adjust-value">${day.excused.PM[team]}</span><button class="adjust-btn" data-excused="PM|${team}|1">+</button></td>
          </tr>`).join("")}
      </tbody></table>`;
  }

  html += `</div>`;
  return html;
}

function renderDisplayTabHtml(day) {
  return `
    <p class="card-note">Preview of both windows' display screens. In real deployment, each group's card would be shown on its own physical screen in its own room.</p>
    ${renderDisplayScreenHtml("AM")}
    ${renderDisplayScreenHtml("PM")}
    <p class="card-note">Test the check-in flow (simulates scanning a QR and landing on the form):</p>
    ${renderCheckInFormHtml()}`;
}



// ===================== DATA MUTATIONS (all persist to Firestore) =====================
async function persistToday() {
  const day = today();
  try {
    await saveDay(day.label, day);
  } catch (e) {
    console.error("Failed to save day:", e);
  }
}

async function addAttendanceRecord(name, team, sessionWindow, tier) {
  const day = today();
  day.attendanceRecords[sessionWindow].push({ name, team, timestamp: Date.now(), tier, notes: "" });
  await persistToday();
}

async function addRejectedCheckIn(name, team, sessionWindow, reason) {
  const day = today();
  day.rejectedCheckIns.push({ name, team, session: sessionWindow, timestamp: Date.now(), reason });
  await persistToday();
}

async function setTeamTime(sessionWindow, team, time) {
  const day = today();
  day.sessionConfig[sessionWindow].teamTimes[team] = time;
  await persistToday();
  render();
}

async function toggleRtcActive(sessionWindow) {
  const day = today();
  day.sessionConfig[sessionWindow].rtcActive = !day.sessionConfig[sessionWindow].rtcActive;
  await persistToday();
  render();
}

async function setSessionName(sessionWindow, name) {
  const day = today();
  day.sessionConfig[sessionWindow].sessionName = name;
  await persistToday();
}

async function editAttendanceRecord(sessionWindow, team, index, patch) {
  const day = today();
  const teamRecords = day.attendanceRecords[sessionWindow].filter((r) => r.team === team);
  const target = teamRecords[index];
  const globalIndex = day.attendanceRecords[sessionWindow].indexOf(target);
  if (globalIndex === -1) return;
  day.attendanceRecords[sessionWindow][globalIndex] = { ...target, ...patch };
  await persistToday();
  render();
}

async function addManualAttendanceRecord(sessionWindow, team, name, tier) {
  const day = today();
  day.attendanceRecords[sessionWindow].push({ name, team, timestamp: Date.now(), tier, notes: "Manually added by SRSS" });
  await persistToday();
  render();
}

async function addArbitraryAward(team, points, note, enteredBy) {
  const day = today();
  day.arbitraryAwards.push({ team, points, note, enteredBy, timestamp: Date.now() });
  await persistToday();
  render();
}

async function toggleThemeDay(team, person) {
  const day = today();
  const row = day.themeDay.find((r) => r.team === team);
  const existingIndex = row.onTheme.findIndex((e) => e.name === person);
  if (existingIndex >= 0) row.onTheme.splice(existingIndex, 1);
  else row.onTheme.push({ name: person, timestamp: Date.now() });
  await persistToday();
  render();
}

async function toggleSocial(team, person) {
  const day = today();
  const row = day.socials.find((r) => r.team === team);
  const existingIndex = row.attendees.findIndex((e) => e.name === person);
  if (existingIndex >= 0) row.attendees.splice(existingIndex, 1);
  else row.attendees.push({ name: person, timestamp: Date.now() });
  await persistToday();
  render();
}

async function setPreSessionRank(sessionKey, value) {
  const day = today();
  day[`preSession${sessionKey}`] = value ? { ...value, timestamp: Date.now() } : null;
  await persistToday();
  render();
}

async function adjustExcused(sessionWindow, team, delta) {
  const day = today();
  day.excused[sessionWindow][team] = Math.max(0, day.excused[sessionWindow][team] + delta);
  await persistToday();
  render();
}

async function adjustRoster(team, delta) {
  const day = today();
  day.rosterSizes[team] = Math.max(0, day.rosterSizes[team] + delta);
  await persistToday();
  render();
}

async function startNewDay() {
  const newLabel = `Day ${state.days.length + 1}`;
  const newDay = makeEmptyDay(newLabel);
  state.days.push(newDay);
  const labels = state.days.map((d) => d.label);
  await saveDay(newLabel, newDay);
  await saveDayIndex(labels);
  render();
}

// ===================== EXCEL EXPORT =====================
function exportToExcel() {
  const wb = XLSX.utils.book_new();
  const totals = calculateCumulativeTotals(state.days);

  const leaderboardRows = TEAMS.map((team) => {
    const t = totals[team];
    const total = t.attendance + t.themeDay + t.social + t.preSession + t.arbitrary;
    return {
      Team: team, "Total Points": total, "Attendance Pts": t.attendance, "Theme Day Pts": t.themeDay,
      "Social Pts": t.social, "Pre-Session Pts": t.preSession, "Arbitrary Award Pts": t.arbitrary,
    };
  }).sort((a, b) => b["Total Points"] - a["Total Points"]);
  const ws1 = XLSX.utils.json_to_sheet(leaderboardRows);
  ws1["!cols"] = [{ wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 15 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Cumulative Leaderboard");

  const logRows = [];
  state.days.forEach((day) => {
    ["AM", "PM"].forEach((sessionWindow) => {
      const active = day.sessionConfig[sessionWindow].rtcActive;
      const sessionLabel = day.sessionConfig[sessionWindow].sessionName
        ? `Attendance (${sessionWindow} - ${day.sessionConfig[sessionWindow].sessionName})`
        : `Attendance (${sessionWindow})`;
      day.attendanceRecords[sessionWindow].forEach((rec) => {
        const pts = !active ? 0 : rec.tier === "early" ? POINT_VALUES.attendanceBase * POINT_VALUES.attendanceEarly
          : rec.tier === "on-time" ? POINT_VALUES.attendanceBase * POINT_VALUES.attendanceOnTime : 0;
        logRows.push({
          Day: day.label, Team: rec.team, Category: sessionLabel, Points: pts,
          Note: `${rec.name} - ${rec.tier}${active ? "" : " (RTC off this window)"}${rec.notes ? " - " + rec.notes : ""} - logged ${new Date(rec.timestamp).toLocaleTimeString()}`,
          "Entered By": "System",
        });
      });
    });
    day.arbitraryAwards.forEach((award) => {
      logRows.push({ Day: day.label, Team: award.team, Category: "Arbitrary Award", Points: award.points, Note: `${award.note} (logged ${new Date(award.timestamp).toLocaleTimeString()})`, "Entered By": award.enteredBy });
    });
    day.themeDay.forEach((row) => {
      row.onTheme.forEach((entry) => {
        logRows.push({ Day: day.label, Team: row.team, Category: "Theme Day", Points: POINT_VALUES.themeDayPerPerson, Note: `${entry.name} dressed on-theme (logged ${new Date(entry.timestamp).toLocaleTimeString()})`, "Entered By": "SRSS" });
      });
    });
    day.socials.forEach((row) => {
      row.attendees.forEach((entry) => {
        logRows.push({ Day: day.label, Team: row.team, Category: "Social Attendance", Points: POINT_VALUES.socialPerPerson, Note: `${entry.name} attended (30+ min, logged ${new Date(entry.timestamp).toLocaleTimeString()})`, "Entered By": "SRSS" });
      });
    });
    [["AM", day.preSessionAM], ["PM", day.preSessionPM]].forEach(([label, session]) => {
      if (!session) return;
      [[session.first, POINT_VALUES.preSessionFirst, "1st"], [session.second, POINT_VALUES.preSessionSecond, "2nd"], [session.third, POINT_VALUES.preSessionThird, "3rd"]]
        .forEach(([team, pts, place]) => {
          if (team) logRows.push({ Day: day.label, Team: team, Category: `Pre-Session (${label})`, Points: pts, Note: `Placed ${place}`, "Entered By": "SRSS" });
        });
    });
  });
  const ws2 = XLSX.utils.json_to_sheet(logRows);
  ws2["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 50 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Point Log");

  const rejectedRows = [];
  state.days.forEach((day) => {
    day.rejectedCheckIns.forEach((entry) => {
      rejectedRows.push({ Day: day.label, Name: entry.name, Team: entry.team, Session: entry.session, Time: new Date(entry.timestamp).toLocaleTimeString(), Reason: entry.reason });
    });
  });
  const ws3 = XLSX.utils.json_to_sheet(rejectedRows.length > 0 ? rejectedRows : [{ Day: "", Name: "", Team: "", Session: "", Time: "", Reason: "No rejected check-ins recorded" }]);
  ws3["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Rejected Check-Ins");

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `RTC-Leaderboard-${dateStr}.xlsx`);
}

// ===================== WIRING =====================
function wireAll() {
  // Debug panel toggle
  const debugToggle = document.getElementById("debug-toggle");
  if (debugToggle) {
    debugToggle.onclick = () => {
      const panel = document.getElementById("debug-panel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
  }

  // Public view tabs
  document.querySelectorAll("[data-public-tab]").forEach((el) => {
    el.onclick = () => { state.publicTab = el.dataset.publicTab; checkinFormState.result = null; render(); };
  });

  const srssLoginBtn = document.getElementById("srss-login-btn");
  if (srssLoginBtn) srssLoginBtn.onclick = () => { state.showGate = true; state.gateError = ""; render(); };

  // Passcode gate
  const gateBackdrop = document.getElementById("gate-backdrop");
  if (gateBackdrop) {
    gateBackdrop.onclick = () => { state.showGate = false; render(); };
    const gateInner = document.getElementById("gate-inner");
    if (gateInner) gateInner.onclick = (e) => e.stopPropagation();
    const gateCancel = document.getElementById("gate-cancel");
    if (gateCancel) gateCancel.onclick = () => { state.showGate = false; render(); };
    const gateSubmit = document.getElementById("gate-submit");
    const gateInput = document.getElementById("gate-input");
    const submitGate = () => {
      if (gateInput.value === SRSS_PASSCODE) {
        state.view = "admin"; state.showGate = false; state.gateError = ""; state.adminTab = "leaderboard";
        render();
      } else {
        state.gateError = "That passcode doesn't match. Try again.";
        render();
      }
    };
    if (gateSubmit) gateSubmit.onclick = submitGate;
    if (gateInput) gateInput.onkeydown = (e) => { if (e.key === "Enter") submitGate(); };
  }

  // Lock button (admin -> public)
  const lockBtn = document.getElementById("lock-btn");
  if (lockBtn) lockBtn.onclick = () => { state.view = "public"; render(); };

  // New day
  const newDayBtn = document.getElementById("new-day-btn");
  if (newDayBtn) newDayBtn.onclick = () => startNewDay();

  // Admin tabs
  document.querySelectorAll("[data-admin-tab]").forEach((el) => {
    el.onclick = () => { state.adminTab = el.dataset.adminTab; render(); };
  });

  // Export
  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) exportBtn.onclick = () => exportToExcel();

  // Check-in form
  wireCheckInForm();

  // Session setup
  document.querySelectorAll("[data-toggle-rtc]").forEach((el) => {
    el.onchange = () => toggleRtcActive(el.dataset.toggleRtc);
  });
  document.querySelectorAll("[data-session-name]").forEach((el) => {
    el.onblur = () => setSessionName(el.dataset.sessionName, el.value);
  });
  document.querySelectorAll("[data-set-time]").forEach((el) => {
    el.onclick = () => {
      const [w, team] = el.dataset.setTime.split("|");
      setTeamTime(w, team, { hour: 9, minute: 0 });
    };
  });
  document.querySelectorAll("[data-clear-time]").forEach((el) => {
    el.onclick = () => {
      const [w, team] = el.dataset.clearTime.split("|");
      setTeamTime(w, team, null);
    };
  });
  document.querySelectorAll("[data-time-hour]").forEach((el) => {
    el.onchange = () => {
      const [w, team] = el.dataset.timeHour.split("|");
      const day = today();
      const current = day.sessionConfig[w].teamTimes[team];
      setTeamTime(w, team, { hour: Number(el.value), minute: current ? current.minute : 0 });
    };
  });
  document.querySelectorAll("[data-time-minute]").forEach((el) => {
    el.onchange = () => {
      const [w, team] = el.dataset.timeMinute.split("|");
      const day = today();
      const current = day.sessionConfig[w].teamTimes[team];
      setTeamTime(w, team, { hour: current ? current.hour : 9, minute: Number(el.value) });
    };
  });

  // Attendance records
  document.querySelectorAll("[data-records-window]").forEach((el) => {
    el.onclick = () => { state.attendanceRecordsWindow = el.dataset.recordsWindow; render(); };
  });
  document.querySelectorAll("[data-edit-record]").forEach((el) => {
    el.onclick = () => { state.editingRecord = el.dataset.editRecord; render(); };
  });
  document.querySelectorAll("[data-save-record]").forEach((el) => {
    el.onclick = () => {
      const key = el.dataset.saveRecord;
      const safeKey = key.replace(/\|/g, "-");
      const tierSelect = document.getElementById(`edit-tier-${safeKey}`);
      const notesInput = document.getElementById(`edit-notes-${safeKey}`);
      const [w, team, indexStr] = key.split("|");
      editAttendanceRecord(w, team, Number(indexStr), { tier: tierSelect.value, notes: notesInput.value });
      state.editingRecord = null;
    };
  });
  document.querySelectorAll("[data-add-manual]").forEach((el) => {
    el.onclick = () => {
      const [w, team] = el.dataset.addManual.split("|");
      const nameInput = document.getElementById(`manual-name-${team}`);
      const tierSelect = document.getElementById(`manual-tier-${team}`);
      if (!nameInput.value.trim()) return;
      addManualAttendanceRecord(w, team, nameInput.value.trim(), tierSelect.value);
    };
  });

  // Manual entry sub-tabs
  document.querySelectorAll("[data-manual-cat]").forEach((el) => {
    el.onclick = () => { state.manualEntryCategory = el.dataset.manualCat; render(); };
  });
  document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
    el.onclick = () => { const [team, person] = el.dataset.themeToggle.split("|"); toggleThemeDay(team, person); };
  });
  document.querySelectorAll("[data-social-toggle]").forEach((el) => {
    el.onclick = () => { const [team, person] = el.dataset.socialToggle.split("|"); toggleSocial(team, person); };
  });
  document.querySelectorAll("[data-no-activity]").forEach((el) => {
    el.onchange = () => {
      const sessionKey = el.dataset.noActivity;
      const day = today();
      const hasActivity = day[`preSession${sessionKey}`] !== null;
      setPreSessionRank(sessionKey, hasActivity ? null : { first: null, second: null, third: null });
    };
  });
  document.querySelectorAll("[data-rank]").forEach((el) => {
    el.onchange = () => {
      const [sessionKey, place] = el.dataset.rank.split("|");
      const day = today();
      const session = day[`preSession${sessionKey}`] || { first: null, second: null, third: null };
      setPreSessionRank(sessionKey, { ...session, [place]: el.value || null });
    };
  });

  const arbSubmit = document.getElementById("arb-submit");
  if (arbSubmit) {
    arbSubmit.onclick = () => {
      const team = document.getElementById("arb-team").value;
      const points = Number(document.getElementById("arb-points").value);
      const note = document.getElementById("arb-note").value.trim();
      const enteredBy = document.getElementById("arb-entered-by").value.trim();
      if (!note || !enteredBy) return;
      addArbitraryAward(team, points, note, enteredBy);
    };
  }

  document.querySelectorAll("[data-roster]").forEach((el) => {
    el.onclick = () => { const [team, delta] = el.dataset.roster.split("|"); adjustRoster(team, Number(delta)); };
  });
  document.querySelectorAll("[data-excused]").forEach((el) => {
    el.onclick = () => { const [w, team, delta] = el.dataset.excused.split("|"); adjustExcused(w, team, Number(delta)); };
  });
}

function wireCheckInForm() {
  const windowSelect = document.getElementById("checkin-window");
  if (windowSelect) windowSelect.onchange = () => { checkinFormState.window = windowSelect.value; };
  const nameInput = document.getElementById("checkin-name");
  if (nameInput) nameInput.oninput = () => { checkinFormState.name = nameInput.value; };
  const teamSelect = document.getElementById("checkin-team");
  if (teamSelect) teamSelect.onchange = () => { checkinFormState.team = teamSelect.value; };
  const wordInput = document.getElementById("checkin-word");
  if (wordInput) wordInput.oninput = () => { checkinFormState.enteredWord = wordInput.value; };
  const submitBtn = document.getElementById("checkin-submit");
  if (submitBtn) submitBtn.onclick = () => submitCheckIn();
  const resetBtn = document.getElementById("checkin-reset");
  if (resetBtn) {
    resetBtn.onclick = () => {
      checkinFormState.name = ""; checkinFormState.team = ""; checkinFormState.enteredWord = ""; checkinFormState.result = null;
      render();
    };
  }
}

// ===================== BOOT SEQUENCE (runs last, after all functions defined) =====================
if (window.__firebaseInitError) {
  document.getElementById("root").innerHTML = `
    <div class="loading-shell">
      <div class="error-box">
        <p class="error-title">Couldn't load Firebase</p>
        <p class="error-sub">The Firebase connection itself failed to start up.</p>
        <p style="font-size:11px;color:#8a8a7e;margin-top:10px;word-break:break-word">${escapeHtml(window.__firebaseInitError)}</p>
      </div>
    </div>`;
} else {
  boot();
  setInterval(tickLiveCodes, 1000);
  setTimeout(() => {
    if (state.loading) {
      console.error("Boot failsafe triggered");
      state.loading = false;
      state.storageError = true;
      render();
    }
  }, 15000);
}
