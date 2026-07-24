// ===================== DATA =====================
const TEAMS = ["Northside", "Southside", "Central", "NRB", "RSA", "REF", "PF"];

// Points now work as a FIXED POOL per team per category, not a flat
// per-person rate. Every team can earn the exact same maximum regardless of
// roster size — the pool is divided evenly across however many people are
// eligible to earn it. Per-person shares stay fractional; rounding only
// happens at the point of display (never on individual contributions), so a
// full team's total always lands exactly on the pool amount.
const POINT_VALUES = {
  attendancePoolOnTime: 100, // full team, all on-time -> 100
  attendancePoolEarly: 200, // full team, all early -> 200 (the "double points" case)
  themeDayPool: 40,
  socialPool: 50,
  preSessionFirst: 100,
  preSessionSecond: 60,
  preSessionThird: 30,
};

const WORD_REFRESH_SECONDS = 25;
const QR_REFRESH_SECONDS = 240; // no longer used for QR regeneration, kept for reference
const EARLY_CUTOFF_MINUTES = 5;
// Anything more than this many minutes before a team's start time gets
// flagged for SRSS review on the Attendance Records view — the tier itself
// still correctly computes as "early" (that's a legitimate category), but a
// check-in this far ahead of schedule is worth a human glance, since it's
// the kind of gap a forwarded word could exploit.
const SUSPICIOUS_EARLY_MINUTES = 20;
const WORD_BANK = [
  "compass", "lantern", "harbor", "thicket", "meridian", "kestrel",
  "granite", "willow", "beacon", "tundra", "ember", "cascade",
  "juniper", "prairie", "falcon", "quartz", "driftwood", "canyon",
  "marlin", "opal", "sable", "yonder", "birch", "glacier",
  "hollow", "amber", "ridge", "cobalt", "wren", "thistle",
  "basalt", "spruce", "delta", "haven", "solstice", "pinnacle",
  "coral", "linden", "vellum", "moraine",
];

const SAMPLE_ROSTERS = {
  Northside: ["Juna Abutaha", "Suryansh Baichoo", "Cielo Barrera Amacifuen", "Xavier Blache", "Saif Cheema", "Rayanna Clarke", "Mackenzie Geith", "Javonte Hunter", "Eilin Kulinich", "Sonakshi Mitra", "Georgina Murray", "Adegheosa Omorogiuwa", "Shahzaib Sheikh", "Khue Tran"],
  Southside: ["Amelia Alam", "Spencer Brodie", "Dilni Dissanayake", "Jenny Dong", "Irha Hassan", "Munkhzul Jargalsaikhan", "Tishma Joarder", "Farhada Khaled", "Mairin McConnell", "Helya Rassouli", "Karisa Sol-Edeigba", "Kels Themens", "Raisha Valezka", "Ji-in Yun", "Aisling MacQuarrie", "Maria Paula Garzon", "Sofia Benard"],
  Central: ["Divine Aine", "Hoor Atique", "Ximena Castillo Ramirez", "Ava Jalali", "Julia Kary", "Oona Kauppinen", "Rachel Rui Liang", "Siddharth Naik", "Daphne Nguyen", "Mitaansh Niverthi", "Areesh Noman", "Senad Sadik", "Kaitlyn Stevens", "Jacelynn Su", "Krish Thakur"],
  NRB: ["Katia Al Shehadeh", "Riana Banks", "Ava Boston", "Aryan Garg", "Tia Girolametto", "Sabea Larson", "Sarah McGinn", "Presley McLeod", "Emma-Marie Meyer", "Giulia Nuvoloni", "Semilore Olafare", "Princess Olawale", "Sreyasi Rahman", "Aurora Thompson", "Gio Williams"],
  RSA: ["Divva Achpilya", "Reese Cameron", "MJ Comuzzi", "Olivia Dalla Zanna", "Avery Harvey", "Madeline Kelly", "Heeje Kim", "Karina Kosareva", "Kartika Kumala", "Hamad Malik", "Ghazlia Mehdi", "Lawrene Naval", "Michelle Omitayo", "Fehintoluwa Omotunde", "Princess Owusu Ansah", "Blake Pederson", "Matthew Pichocki", "Krisha Shah", "Darsh Singh", "Natran Tewoldemedhin", "Kayla Viveiros", "Akaila Wright"],
  REF: ["Vera Allue", "Amina Djibrine Sy", "Elif Ekizoglu", "Josie Fratarcangeli", "Ana Giceva", "Saba Halabisaz", "Winston Han", "Adriana Izilein", "Aashritha Kadiri", "Harshita Kakkar", "Saurabh Nair", "Demi Ogundele", "Weedad Okpala", "Olamide Olajide", "Gabrielle Omoyinbo", "Surya Pusapati", "Emily Savoie", "Nola Ryissa Scott", "Xin Wren Shan", "Muhammad Umar", "Rohan Verma"],
  PF: ["Demi Akinleye-Abraham", "Marcus Anastacio", "Lucy Chen Chen", "Iris Cioban", "Elias Perianza Robles", "Aizhanym Shaikhiyeva", "Zahra Simpson-Stairs", "Samantha Venegas Guillen"],
};
const ROSTER_SIZES = { Northside: 17, Southside: 14, Central: 15, NRB: 15, RSA: 22, REF: 21, PF: 8 };

const SRSS_PASSCODE = "FISST2026"; // shared passcode — change before real rollout

// Real RSSTI 2026 schedule — used to generate day labels/dates automatically
// as SRSS clicks "Start New Day," so dates and theme names don't need to be
// typed in manually each morning.
const RSSTI_SCHEDULE = [
  { date: "2026-08-20", theme: "Beach Day" },
  { date: "2026-08-21", theme: "Sparky Day" },
  { date: "2026-08-24", theme: "Pekka Day" },
  { date: "2026-08-25", theme: "Royals Day" },
  { date: "2026-08-26", theme: "Knight Day" },
  { date: "2026-08-27", theme: "Baby Dragon Day" },
  { date: "2026-08-28", theme: "Archer Day" },
  { date: "2026-08-31", theme: "Skelly Day" },
  { date: "2026-09-01", theme: "Sport Team Day" },
  { date: "2026-09-02", theme: "Wild West Day" },
  { date: "2026-09-03", theme: "SHRL Spirit Day" },
];

function formatScheduleDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
    // Keyed by "hour:minute" (matching groupTeamsByTime's key format), so
    // each distinct time-group can have its own session name — e.g. DONs at
    // 9:00 might be "Colman Cup Committees" while PFs+REFs at 9:30 are
    // "Supporting Students," both technically still "AM."
    sessionNames: {},
    teamTimes: TEAMS.reduce((acc, t) => { acc[t] = null; return acc; }, {}),
  };
}

function makeEmptyDay(dayIndex) {
  const schedule = RSSTI_SCHEDULE[dayIndex - 1]; // dayIndex is 1-based
  const dateStr = schedule ? formatScheduleDate(schedule.date) : null;
  const themeName = schedule ? schedule.theme : null;
  const label = dateStr ? `Day ${dayIndex} - ${dateStr}` : `Day ${dayIndex}`;
  return {
    dayIndex,
    label,
    date: schedule ? schedule.date : null,
    themeName,
    sessionConfig: { AM: emptySessionConfig(), PM: emptySessionConfig() },
    attendanceRecords: { AM: [], PM: [] },
    rejectedCheckIns: [],
    themeDay: TEAMS.map((team) => ({ team, roster: SAMPLE_ROSTERS[team] || [], onTheme: [] })),
    socials: TEAMS.map((team) => ({ team, roster: SAMPLE_ROSTERS[team] || [], attendees: [] })),
    preSessionAM: null,
    preSessionPM: null,
    arbitraryAwards: [],
    rosterSizes: { ...ROSTER_SIZES },
    // Excused absences are now tracked by NAME, not just a count — this lets
    // the check-in flow reject a proxy attempt for someone who's marked
    // excused, and means "expected" is always accurate (roster minus however
    // many real names are actually excused), not a manually-tracked number.
    excused: {
      AM: TEAMS.reduce((a, t) => { a[t] = []; return a; }, {}),
      PM: TEAMS.reduce((a, t) => { a[t] = []; return a; }, {}),
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

// Whether the window has AT LEAST ONE team scheduled — this gates whether
// the QR/check-in mechanism can exist at all for a given team. A team with
// no time set simply has nothing to check into (handled separately by the
// rejection flow); teams that DO have a time can check in regardless of
// whether every other team also has one.
function hasAnyTeamTime(sessionConfig) {
  return TEAMS.some((team) => sessionConfig.teamTimes[team] !== null);
}

// Whether EVERY team has a time set — this is now used only as a fairness
// signal for RTC scoring decisions (shown to SRSS in Session Setup), not as
// a gate on whether check-in itself works.
function sessionIsLive(sessionConfig) {
  return TEAMS.every((team) => sessionConfig.teamTimes[team] !== null);
}

// ===================== POINT CALCULATION =====================
// Excused people don't count against a team's ability to earn the full
// Attendance or Theme Day pool (they're not expected to show up), but they
// DO still count against Social, since social attendance is optional for
// everyone — nobody is "excused" from an optional event.

// Attendance excused is tracked per-window (AM/PM). Theme Day isn't
// windowed, so a person counts as excused for the day if they're excused
// from EITHER window that day.
function excusedForAttendance(day, sessionWindow, team) {
  return (day.excused[sessionWindow][team] || []).length;
}
function excusedForThemeDay(day, team) {
  const am = day.excused.AM[team] || [];
  const pm = day.excused.PM[team] || [];
  return new Set([...am, ...pm]).size;
}

// Guards against divide-by-zero (e.g. a roster misconfigured to 0, or
// everyone on a tiny team excused at once).
function effectiveRosterCount(rosterSize, excusedCount) {
  return Math.max(1, rosterSize - excusedCount);
}

function calculateCumulativeTotals(days) {
  const totals = {};
  TEAMS.forEach((team) => { totals[team] = { attendance: 0, themeDay: 0, social: 0, preSession: 0, arbitrary: 0 }; });

  days.forEach((day) => {
    ["AM", "PM"].forEach((sessionWindow) => {
      if (!day.sessionConfig[sessionWindow].rtcActive) return;
      day.attendanceRecords[sessionWindow].forEach((rec) => {
        if (rec.tier !== "early" && rec.tier !== "on-time") return;
        const pool = rec.tier === "early" ? POINT_VALUES.attendancePoolEarly : POINT_VALUES.attendancePoolOnTime;
        const roster = effectiveRosterCount(day.rosterSizes[rec.team], excusedForAttendance(day, sessionWindow, rec.team));
        totals[rec.team].attendance += pool / roster;
      });
    });

    day.themeDay.forEach((row) => {
      const roster = effectiveRosterCount(day.rosterSizes[row.team], excusedForThemeDay(day, row.team));
      totals[row.team].themeDay += row.onTheme.length * (POINT_VALUES.themeDayPool / roster);
    });
    day.socials.forEach((row) => {
      const roster = effectiveRosterCount(day.rosterSizes[row.team], 0); // excused doesn't apply — social is optional
      totals[row.team].social += row.attendees.length * (POINT_VALUES.socialPool / roster);
    });

    [day.preSessionAM, day.preSessionPM].forEach((session) => {
      if (!session) return;
      if (session.first && totals[session.first]) totals[session.first].preSession += POINT_VALUES.preSessionFirst;
      if (session.second && totals[session.second]) totals[session.second].preSession += POINT_VALUES.preSessionSecond;
      if (session.third && totals[session.third]) totals[session.third].preSession += POINT_VALUES.preSessionThird;
    });

    day.arbitraryAwards.forEach((award) => { totals[award.team].arbitrary += award.points; });
  });

  // Round only at the point of returning displayable totals — never round
  // an individual person's contribution, or a full team could end up
  // showing MORE than the pool (e.g. 200) due to compounding round-up error.
  TEAMS.forEach((team) => {
    totals[team].attendance = Math.round(totals[team].attendance);
    totals[team].themeDay = Math.round(totals[team].themeDay);
    totals[team].social = Math.round(totals[team].social);
  });

  return totals;
}

// ===================== FIRESTORE STORAGE LAYER =====================
// Each RSSTI day is stored as ONE document, keyed by its numeric day index
// (e.g. "day-1"), NOT by its display label — this keeps the storage key
// stable even if the label's date/theme text changes, and matches the
// proven pattern from the bingo app: one document per unit of data, real
// retry logic on both reads and writes, no silent failures.

function dayStorageKey(dayIndex) {
  return `day-${dayIndex}`;
}

function dayDocRef(label) {
  const { db, doc } = window.__firebase;
  return doc(db, "rtcDays", slugify(label));
}

// ===================== BACKUP LAYER =====================
// Two independent safety nets against Firestore data loss/corruption, on top
// of the primary "rtcDays" collection:
//  1. A live MIRROR — every successful save is also written to a separate
//     collection, so if the primary doc is ever accidentally deleted or a
//     bad write corrupts it, an up-to-date copy still exists elsewhere.
//  2. An IMMUTABLE SNAPSHOT taken once when a day is closed out (SRSS clicks
//     "Start New Day") — this one is never overwritten again, so even if the
//     mirror above also got corrupted by a later bad write, there's still a
//     frozen copy of that day exactly as it stood when it ended.
// Both are best-effort: a backup failure is logged but never blocks or
// throws into the main save path, since the primary write succeeding is
// what matters most in the moment.
// NOTE: these write to NEW Firestore collections ("rtcDaysBackup",
// "rtcDaySnapshots") — if your Firestore security rules are scoped
// specifically to the "rtcDays" collection, add matching allow rules for
// these two as well, or these writes will silently fail (visible in the
// debug log, but won't interrupt anything).
function backupDayDocRef(label) {
  const { db, doc } = window.__firebase;
  return doc(db, "rtcDaysBackup", slugify(label));
}
function snapshotDocRef(snapshotId) {
  const { db, doc } = window.__firebase;
  return doc(db, "rtcDaySnapshots", slugify(snapshotId));
}

async function mirrorDayBackup(label, dayData) {
  const { setDoc } = window.__firebase;
  try {
    await setDoc(backupDayDocRef(label), { ...dayData, __backedUpAt: Date.now() });
    debugLog(`mirrorDayBackup(${label}) -> ok`);
  } catch (e) {
    debugLog(`mirrorDayBackup(${label}) FAILED (non-blocking): ${e.message || e}`);
  }
}

async function snapshotDayClose(day) {
  const { setDoc } = window.__firebase;
  const snapshotId = `${dayStorageKey(day.dayIndex)}-closed-${Date.now()}`;
  try {
    await setDoc(snapshotDocRef(snapshotId), { ...day, __snapshotAt: Date.now() });
    debugLog(`snapshotDayClose(${snapshotId}) -> ok`);
  } catch (e) {
    debugLog(`snapshotDayClose FAILED (non-blocking): ${e.message || e}`);
  }
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
    if (label !== "__index__") mirrorDayBackup(label, dayData); // fire-and-forget, doesn't block the caller
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

// ===================== REAL-TIME SYNC (admin-only) =====================
// RSS check-in phones deliberately do NOT use a live listener — they submit
// once and leave, so a plain one-time read/write keeps read costs flat no
// matter how many people check in. A live listener is only worth it for the
// small number of devices that stay open and watching data continuously:
// the SRSS dashboard and Display Screens. Both of those live inside the
// admin view, so a single listener on the currently-viewed day covers both.
let unsubscribeDayListener = null;

function detachDayListener() {
  if (unsubscribeDayListener) {
    unsubscribeDayListener();
    unsubscribeDayListener = null;
  }
}

function attachDayListenerForCurrentView() {
  detachDayListener();
  const { onSnapshot } = window.__firebase || {};
  if (typeof onSnapshot !== "function") return; // older cached page / SDK without onSnapshot — degrade silently to manual refresh
  const dayIndex = state.viewingDayIndex || (state.days.length ? state.days[state.days.length - 1].dayIndex : null);
  if (!dayIndex) return;
  try {
    unsubscribeDayListener = onSnapshot(dayDocRef(dayStorageKey(dayIndex)), (snap) => {
      if (!snap.exists()) return;
      const updated = snap.data();
      const idx = state.days.findIndex((d) => d.dayIndex === dayIndex);
      if (idx === -1) return;
      state.days[idx] = updated;
      debugLog(`live update received for day ${dayIndex}`);
      render();
    }, (err) => {
      debugLog(`day listener error: ${err.message || err}`);
    });
  } catch (e) {
    debugLog(`attachDayListenerForCurrentView failed: ${e.message || e}`);
  }
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
  if (state.viewingDayIndex) {
    const found = state.days.find((d) => d.dayIndex === state.viewingDayIndex);
    if (found) return found;
  }
  return state.days[state.days.length - 1];
}

// Always the real, current day — never affected by whichever day an SRSS
// happens to be browsing in the admin dashboard. The public check-in flow
// must always use this, not today(), so a real RSS check-in can never
// accidentally get recorded against a past day just because an admin was
// reviewing it in another tab on the same device.
function latestDay() {
  return state.days[state.days.length - 1];
}

// ===================== LIVE WORD GENERATION =====================
// Each distinct time-group gets its own independent word cycle, keyed by a
// stable groupKey. The word is DETERMINISTIC — computed purely from the
// current time and the groupKey — rather than a random counter that only
// exists in one device's memory. This means any device (the Display Screen
// AND a phone that scanned the QR) can independently compute "what's the
// correct word right now" just from the clock, with no Firestore write
// needed to keep them in sync, and no risk of the check-in device having a
// stale/never-updated word to validate against.
function currentWordForGroup(groupKey) {
  const bucket = Math.floor(Date.now() / (WORD_REFRESH_SECONDS * 1000));
  const index = Math.abs(hashCode(groupKey + ":" + bucket)) % WORD_BANK.length;
  return WORD_BANK[index];
}

function secondsUntilNextWordRefresh() {
  const nowMs = Date.now();
  const bucketMs = WORD_REFRESH_SECONDS * 1000;
  const msIntoBucket = nowMs % bucketMs;
  return Math.ceil((bucketMs - msIntoBucket) / 1000);
}

function ensureLiveCode(groupKey) {
  if (!state.liveCodes[groupKey]) state.liveCodes[groupKey] = {};
  const code = state.liveCodes[groupKey];
  code.word = currentWordForGroup(groupKey);
  code.wordSecondsLeft = secondsUntilNextWordRefresh();
  return code;
}

function tickLiveCodes() {
  if (Object.keys(state.liveCodes).length === 0) return;
  Object.keys(state.liveCodes).forEach((key) => { ensureLiveCode(key); });
  renderDisplayScreensIfVisible();
}

function renderDisplayScreensIfVisible() {
  // Only re-render the word/timer in place, not a full app re-render, to
  // avoid disrupting any in-progress form input elsewhere on screen. The QR
  // itself never needs to change, so it's not touched here.
  document.querySelectorAll("[data-group-card]").forEach((el) => {
    const key = el.dataset.groupCard;
    const code = state.liveCodes[key];
    if (!code) return;
    const wordEl = el.querySelector("[data-word]");
    const wordBarEl = el.querySelector("[data-word-bar]");
    if (wordEl) wordEl.textContent = code.word;
    if (wordBarEl) wordBarEl.style.width = `${(code.wordSecondsLeft / WORD_REFRESH_SECONDS) * 100}%`;
  });
}

// Generates a real, scannable QR code encoding a deep-link URL back into
// this same app — e.g. "?checkin=AM|9:0" — so scanning it lands directly on
// the check-in form pre-filled for that specific window/time-group, instead
// of asking the person to manually pick window/word.
function renderQRVisual(sessionWindow, timeKey) {
  if (typeof qrcode === "undefined") {
    // The QR library failed to load (bad CDN URL, network issue, etc.) —
    // show a clear inline message instead of throwing and breaking the
    // whole Display Screen tab.
    debugLog("QR library not loaded — qrcode is undefined. Check the CDN script tag in index.html.");
    return `<div style="background:#fff0ed;color:#b3422a;padding:16px;border-radius:8px;font-size:12px;max-width:160px">QR library failed to load. Check console/debug log.</div>`;
  }
  try {
    const day = today();
    const baseUrl = window.location.origin + window.location.pathname;
    // Encoding the day label makes each day's QR genuinely unique — a
    // screenshot of today's QR won't still work tomorrow, even though the
    // window/time-group (e.g. "AM, 9:00") repeats daily.
    const deepLink = `${baseUrl}?checkin=${encodeURIComponent(sessionWindow)}|${encodeURIComponent(timeKey)}|${encodeURIComponent(day.label)}`;
    debugLog(`renderQRVisual: encoding URL (${deepLink.length} chars): ${deepLink}`);
    // Type 0 (auto-detect) has been unreliable for longer URLs in this
    // library version — try increasing explicit type numbers instead,
    // which sidesteps whatever internal calculation was failing.
    let qr = null;
    let lastError = null;
    for (let typeNumber = 4; typeNumber <= 10; typeNumber++) {
      try {
        const candidate = qrcode(typeNumber, "M");
        candidate.addData(deepLink);
        candidate.make();
        qr = candidate;
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!qr) throw lastError || new Error("Could not generate QR at any type number 4-10");
    // createSvgTag renders a real scannable QR as inline SVG markup.
    // This version's signature is (cellSize, margin) as positional args,
    // not a config object — passing an object here was the actual bug.
    return qr.createSvgTag(4, 4);
  } catch (e) {
    debugLog(`renderQRVisual failed: ${e.message || e}`);
    return `<div style="background:#fff0ed;color:#b3422a;padding:16px;border-radius:8px;font-size:12px;max-width:160px">Couldn't generate QR: ${escapeHtml(e.message || String(e))}</div>`;
  }
}

// ===================== BOOT =====================
async function boot() {
  try {
    const indices = await loadDayIndex(); // now an array of numbers, e.g. [1, 2, 3]
    if (!indices || indices.length === 0) {
      // First-ever load: seed a real empty Day 1 (no fake sample data in the
      // real deployment — that was only for the React demo).
      const day1 = makeEmptyDay(1);
      await saveDay(dayStorageKey(1), day1);
      await saveDayIndex([1]);
      state.days = [day1];
    } else {
      const loaded = await Promise.all(indices.map((i) => loadDay(dayStorageKey(i))));
      state.days = loaded.map((d, i) => d || makeEmptyDay(indices[i]));
    }
    state.loading = false;
    state.storageError = false;
    parseCheckInDeepLink();
    if (checkinFormState.deepLinkTeams || checkinFormState.invalidLink || checkinFormState.staleDayLink) state.publicTab = "checkin";
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
const checkinFormState = { name: "", team: "", window: "AM", enteredWord: "", result: null, deepLinkTimeKey: null, deepLinkTeams: null };

// Parses "?checkin=AM|9:0" from the URL, if present, and locks the form to
// that specific window/time-group — this is what makes scanning a real QR
// actually take someone to a pre-filled, relevant form instead of a blank
// one asking them to manually pick everything.
function parseCheckInDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("checkin");
  if (!raw) return;
  const [sessionWindow, timeKey, dayLabel] = raw.split("|");
  // Any malformed/incomplete link is treated as invalid, NOT as "no link at
  // all" — a URL with a checkin= param that fails to parse must never fall
  // through to the unrestricted manual form, since that would let someone
  // check in as any team from a broken or tampered link.
  if (!sessionWindow || !timeKey) { checkinFormState.invalidLink = true; return; }
  const day = latestDay();
  // Reject a scan from a previous day's QR — a screenshot of today's code
  // shouldn't still work tomorrow, even though "AM, 9:00" repeats daily.
  if (dayLabel && dayLabel !== day.label) {
    checkinFormState.staleDayLink = true;
    return;
  }
  const config = day.sessionConfig[sessionWindow];
  if (!config) { checkinFormState.invalidLink = true; return; }
  const groups = groupTeamsByTime(config.teamTimes);
  const teamsInGroup = groups[timeKey];
  if (!teamsInGroup) { checkinFormState.invalidLink = true; return; } // stale/invalid link
  checkinFormState.window = sessionWindow;
  checkinFormState.deepLinkTimeKey = timeKey;
  checkinFormState.deepLinkTeams = teamsInGroup;
  // If the group is a single team, pre-select it — no need to ask.
  if (teamsInGroup.length === 1) checkinFormState.team = teamsInGroup[0];
}

function renderCheckInFormHtml(isAdminPreview = false) {
  const day = latestDay();
  const result = checkinFormState.result;
  const isDeepLink = !!checkinFormState.deepLinkTeams;

  // RSS should only ever reach a working check-in form by scanning a real
  // QR code. If someone just taps the "Check-In" tab directly without a
  // valid scan, show a clear redirect message instead of an open form that
  // would otherwise let anyone check in without actually being at a
  // session. The admin's embedded testing preview is exempt, since that's
  // specifically meant to simulate the flow without a real scan.
  if (!isAdminPreview && !isDeepLink && !checkinFormState.staleDayLink && !checkinFormState.invalidLink) {
    return `
      <div class="form-shell">
        <div class="form-card">
          <p class="result-icon">📷</p>
          <h2 class="result-title">Scan the QR code to check in</h2>
          <p class="result-message">This page only works when reached by scanning the QR code shown on your group's display screen. If you don't see one, speak to your SRSS.</p>
        </div>
      </div>`;
  }

  if (checkinFormState.staleDayLink) {
    return `
      <div class="form-shell">
        <div class="form-card">
          <p class="result-icon">⚠️</p>
          <h2 class="result-title">This QR code has expired</h2>
          <p class="result-message">This link is from a previous day's session and can't be used today. Please scan the current QR code shown on today's display screen.</p>
        </div>
      </div>`;
  }

  if (checkinFormState.invalidLink) {
    return `
      <div class="form-shell">
        <div class="form-card">
          <p class="result-icon">⚠️</p>
          <h2 class="result-title">This QR code isn't recognized</h2>
          <p class="result-message">Something's off with this link — it may be outdated or from a session that's since changed. Please re-scan the QR code on your group's display screen, or speak to your SRSS.</p>
        </div>
      </div>`;
  }

  if (result && (result.status === "success" || result.status === "late")) {
    return `
      <div class="form-shell">
        <div class="form-card">
          <p class="result-icon">${result.status === "success" ? "✅" : "⏱"}</p>
          <h2 class="result-title">${result.status === "success" ? "You're checked in!" : "Checked in - no points"}</h2>
          <p class="result-message">${escapeHtml(result.message)}</p>
          <p class="result-detail">${escapeHtml(checkinFormState.name)} · ${escapeHtml(checkinFormState.team)} · ${checkinFormState.window}</p>
        </div>
      </div>`;
  }

  // Team options are locked to whatever the QR encoded (real flow); only the
  // admin's own testing preview allows picking from every team, since that's
  // meant to simulate an arbitrary scan.
  const teamOptions = isDeepLink ? checkinFormState.deepLinkTeams : TEAMS;
  const teamIsChosen = !!checkinFormState.team;
  // Name is always a roster dropdown, never free-typed — this is what makes
  // duplicate/excused/wrong-team detection exact instead of string-fuzzy,
  // and makes it impossible to check in as someone not on the roster.
  const nameRoster = teamIsChosen ? (SAMPLE_ROSTERS[checkinFormState.team] || []) : [];

  return `
    <div class="form-shell">
      <div class="form-card">
        <p class="form-eyebrow">RTC CHECK-IN</p>
        <h2 class="form-title">Confirm your attendance</h2>
        ${!isDeepLink ? `<p class="demo-note">This form wasn't reached via a QR scan, so window/team need to be picked manually. Scan a real QR from a Display Screen to test the normal flow.</p>` : `<p class="demo-note">Window: <b>${checkinFormState.window}</b>${teamOptions.length === 1 ? ` · Team: <b>${escapeHtml(teamOptions[0])}</b>` : ""} — detected from the QR you scanned.</p>`}
        ${!isDeepLink ? `
          <label class="field-label">Window</label>
          <select id="checkin-window">
            <option value="AM" ${checkinFormState.window === "AM" ? "selected" : ""}>AM</option>
            <option value="PM" ${checkinFormState.window === "PM" ? "selected" : ""}>PM</option>
          </select>` : ""}
        ${teamOptions.length > 1 || !isDeepLink ? `
          <label class="field-label">Your team</label>
          <select id="checkin-team">
            <option value="">— choose your team —</option>
            ${teamOptions.map((t) => `<option value="${t}" ${checkinFormState.team === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>` : ""}
        <label class="field-label">Your name</label>
        <select id="checkin-name" ${!teamIsChosen ? "disabled" : ""}>
          <option value="">${teamIsChosen ? "— choose your name —" : "Select your team first"}</option>
          ${nameRoster.map((p) => `<option value="${escapeHtml(p)}" ${checkinFormState.name === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
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
  const tier = diffMinutes >= EARLY_CUTOFF_MINUTES ? "early" : diffMinutes >= 0 ? "on-time" : "late";
  return { tier, minutesEarly: diffMinutes };
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
  if (!hasAnyTeamTime(config)) {
    checkinFormState.result = { status: "error", message: `${sessionWindow} check-in isn't open today - no teams have a session this window.` };
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
  // Duplicate check-in prevention: if this exact name already has a record
  // for this team/window today, block a second submission rather than
  // silently logging them twice (which would double-count their team's
  // point contribution and confuse the attendance record).
  const existingRecords = day.attendanceRecords[sessionWindow] || [];
  const alreadyCheckedIn = existingRecords.some((r) => r.team === team && r.name.toLowerCase() === name.toLowerCase());
  if (alreadyCheckedIn) {
    await addRejectedCheckIn(name, team, sessionWindow, "Duplicate check-in attempt — already has a record this session");
    checkinFormState.result = { status: "error", message: `Looks like ${name} already checked in for ${sessionWindow} today — no need to do it again.` };
    render();
    return;
  }
  // Proxy-attendance protection: if this exact name is marked excused for
  // this team/window, reject the check-in rather than silently accepting
  // it — someone marked excused shouldn't also be able to (or have someone
  // else) check them in.
  const excusedList = day.excused[sessionWindow][team] || [];
  if (excusedList.includes(name)) {
    await addRejectedCheckIn(name, team, sessionWindow, "Marked as excused for this session — check-in rejected");
    checkinFormState.result = { status: "error", message: "You're marked as excused for this session, so check-in isn't available." };
    render();
    return;
  }
  if (!enteredWord) {
    checkinFormState.result = { status: "error", message: "Please enter the word shown on your group's display screen." };
    render();
    return;
  }
  // Real word validation: compute what the current word SHOULD be for this
  // exact group (day + window + time-group), the same deterministic way the
  // Display Screen does, and compare. This is the actual security check —
  // without it, any non-empty text would silently pass.
  const timeKey = checkinFormState.deepLinkTimeKey;
  if (timeKey) {
    const groupKey = `${day.label}-${sessionWindow}-${timeKey}`;
    const expectedWord = currentWordForGroup(groupKey);
    if (enteredWord.toLowerCase() !== expectedWord.toLowerCase()) {
      checkinFormState.result = { status: "error", message: "That word doesn't match what's currently on your group's display screen. Double check and try again." };
      render();
      return;
    }
  }
  // If there's no timeKey (manual/non-deep-link testing path), we can't
  // determine which specific group's word to check against, so we fall
  // back to just requiring non-empty input — this only applies to the
  // manual admin testing form, never the real QR-scanned flow.

  const { tier, minutesEarly } = computeTierForTeamTime(teamTime);

  if (tier === "late") {
    await addAttendanceRecord(name, team, sessionWindow, tier, minutesEarly);
    checkinFormState.result = { status: "late", message: "You're checked in, but this session's window has passed - no points awarded." };
  } else {
    await addAttendanceRecord(name, team, sessionWindow, tier, minutesEarly);
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
  const anyLive = hasAnyTeamTime(config);
  const allLive = sessionIsLive(config);

  if (!anyLive) {
    return `
      <div class="display-shell">
        <p class="display-eyebrow">RSSTI - RESIDENCE TRAINING COMPETITION</p>
        <h1 class="display-title">${sessionWindow} Check-In</h1>
        <p style="color:#fff;font-size:15px">No teams have a ${sessionWindow} session configured today - check-in is closed for this window.</p>
      </div>`;
  }

  const groups = groupTeamsByTime(config.teamTimes);
  let cardsHtml = "";
  Object.entries(groups).forEach(([timeKey, teams]) => {
    const [hour, minute] = timeKey.split(":").map(Number);
    const groupKey = `${day.label}-${sessionWindow}-${timeKey}`;
    const code = ensureLiveCode(groupKey);
    const timeLabel = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${minute.toString().padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
    const groupName = (config.sessionNames && config.sessionNames[timeKey]) || "";
    cardsHtml += `
      <div class="group-card" data-group-card="${groupKey}">
        ${groupName ? `<p class="group-card-name">${escapeHtml(groupName)}</p>` : ""}
        <p class="group-card-teams">${teams.join(" + ")}</p>
        <p class="group-card-time">Starts ${timeLabel}</p>
        <div class="group-card-row">
          <div class="qr-wrap">${renderQRVisual(sessionWindow, timeKey)}</div>
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
      <h1 class="display-title">${sessionWindow} Check-In</h1>
      <div class="group-grid">${cardsHtml}</div>
      ${!allLive ? `<p class="footnote" style="color:#FAC507">Note: not every team has a session this window — check whether RTC points should be active for this window in Session Setup.</p>` : ""}
      <p class="footnote">Scan the QR to open your check-in form · the word refreshes every ${WORD_REFRESH_SECONDS}s, so type whatever's currently shown · each group has its own QR</p>
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
        <span class="day-badge">📅 Viewing:</span>
        <select id="day-selector" class="cutoff-select">
          ${state.days.map((d) => `<option value="${d.dayIndex}" ${d.dayIndex === day.dayIndex ? "selected" : ""}>${escapeHtml(d.label)}${d.dayIndex === state.days.length ? " (current)" : ""}</option>`).join("")}
        </select>
        ${day.dayIndex !== state.days.length ? `<span class="not-live-badge" style="font-weight:700">⚠ Viewing a past day — edits here won't affect today's live check-in</span>` : ""}
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
        <span class="export-hint">Includes Leaderboard, Point Log, Rejected Check-Ins, and a pure Attendance Checklist (no RTC points)</span>
      </div>
      <p class="card-note" style="max-width:900px;margin:-8px auto 20px">💾 This also runs automatically every time you tap "Start New Day," as a backup. Exporting it here manually now and then (especially after a heavy session) is still a good habit — it's a copy that lives entirely outside Firestore.</p>`;
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
  let html = `<div class="card"><p class="card-note">Set each team's start time for today. Any team with a time set can check in and generate its own QR/word screen — teams don't need to wait on each other. The "all teams must have a time" rule now only affects whether RTC points are fair to award (shown below), not whether check-in itself works.</p>`;

  ["AM", "PM"].forEach((sessionWindow) => {
    const config = day.sessionConfig[sessionWindow];
    const anyLive = hasAnyTeamTime(config);
    const allLive = sessionIsLive(config);
    const groups = groupTeamsByTime(config.teamTimes);

    html += `
      <div class="session-setup-block">
        <div class="header-row">
          <p class="section-label">${sessionWindow} Window ${anyLive ? '<span class="live-badge">● CHECK-IN OPEN</span>' : '<span class="not-live-badge">No sessions today</span>'}</p>
          <label class="toggle-label"><input type="checkbox" data-toggle-rtc="${sessionWindow}" ${config.rtcActive ? "checked" : ""}/> Counts toward RTC points today</label>
        </div>
        ${anyLive && !allLive ? `<p class="card-note" style="color:#b3422a">Not every team has a time set this window — if RTC is on, points may not be fair across teams. Consider whether to keep RTC on for this window.</p>` : ""}
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
        ${Object.keys(groups).length > 0 ? `
          <div style="margin-top:14px">
            <p class="form-label">Session name per group (shown to RSS on the display screen)</p>
            ${Object.entries(groups).map(([timeKey, teams]) => `
              <div style="margin-bottom:8px">
                <label class="rank-label">${teams.join(" + ")}</label>
                <input type="text" data-session-name="${sessionWindow}|${timeKey}" placeholder="e.g. Fire Safety Training"
                  value="${escapeHtml((config.sessionNames && config.sessionNames[timeKey]) || "")}" style="max-width:320px"/>
              </div>`).join("")}
          </div>` : ""}
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
    const excusedList = day.excused[w][team] || [];
    const expected = Math.max(0, day.rosterSizes[team] - excusedList.length);
    html += `<div class="team-block"><p class="section-label">${team} - ${records.length} check-in${records.length !== 1 ? "s" : ""} (expected: ${expected}${excusedList.length > 0 ? `, ${excusedList.length} excused: ${excusedList.map(escapeHtml).join(", ")}` : ""})</p>`;
    if (records.length === 0) {
      html += `<p class="card-note">No check-ins yet.</p>`;
    } else {
      html += `<table><thead><tr><th>Name</th><th>Tier</th><th>Time</th><th>Notes</th><th></th></tr></thead><tbody>`;
      records.forEach((rec, i) => {
        const editKey = `${w}|${team}|${i}`;
        const isEditing = state.editingRecord === editKey;
        const isSuspicious = typeof rec.minutesEarly === "number" && rec.minutesEarly >= SUSPICIOUS_EARLY_MINUTES;
        // Someone can get marked excused AFTER already checking in (SRSS
        // working through the excused list separately from live check-ins).
        // We don't auto-resolve this — it's ambiguous which is "correct" —
        // just flag it visibly so SRSS can look and decide.
        const isExcusedConflict = excusedList.includes(rec.name);
        const flagStyle = isExcusedConflict ? 'style="background:#fff0ed"' : isSuspicious ? 'style="background:#fff0ed"' : "";
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
              <td>
                <button class="mini-btn" data-save-record="${editKey}">Save</button>
                <button class="mini-btn" style="background:#b3422a" data-delete-record="${editKey}">Delete</button>
              </td>
            </tr>`;
        } else {
          html += `
            <tr ${flagStyle}>
              <td style="font-weight:700">${escapeHtml(rec.name)}
                ${isSuspicious ? `<span title="Checked in ${rec.minutesEarly} min before start — worth a look" style="color:#b3422a;font-weight:700"> ⚠ ${rec.minutesEarly}m early</span>` : ""}
                ${isExcusedConflict ? `<span title="This person is also marked excused for ${w} — resolve which is correct" style="color:#b3422a;font-weight:700"> ⚠ marked excused</span>` : ""}
              </td>
              <td>${rec.tier}</td>
              <td>${new Date(rec.timestamp).toLocaleTimeString()}</td>
              <td>${escapeHtml(rec.notes || "—")}</td>
              <td><button class="adjust-btn" data-edit-record="${editKey}">✎</button></td>
            </tr>`;
        }
      });
      html += `</tbody></table>`;
    }
    const existingNamesLower = new Set(records.map((r) => r.name.toLowerCase()));
    const manualNameOptions = (SAMPLE_ROSTERS[team] || []).filter((p) => !existingNamesLower.has(p.toLowerCase()));
    html += `
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <select id="manual-name-${team}" style="max-width:220px">
          <option value="">— choose name to add —</option>
          ${manualNameOptions.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
        </select>
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
    html += `<p class="card-note">Tap each individual confirmed dressed on-theme today (${day.label}). ${POINT_VALUES.themeDayPool} pts available per team, split evenly across everyone expected (roster minus excused) — a full team on-theme always earns the full ${POINT_VALUES.themeDayPool}, regardless of team size.</p>`;
    day.themeDay.forEach((row) => {
      const roster = effectiveRosterCount(day.rosterSizes[row.team], excusedForThemeDay(day, row.team));
      const pts = Math.round(row.onTheme.length * (POINT_VALUES.themeDayPool / roster));
      html += `
        <div class="team-block">
          <p class="section-label">${row.team} - ${row.onTheme.length}/${row.roster.length} on-theme (+${pts} pts)</p>
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
    html += `<p class="card-note">Tap each individual confirmed present 30+ min at today's social (${day.label}). ${POINT_VALUES.socialPool} pts available per team, split evenly across the full roster — social is optional, so excused status doesn't change the split.</p>`;
    day.socials.forEach((row) => {
      const roster = effectiveRosterCount(day.rosterSizes[row.team], 0);
      const pts = Math.round(row.attendees.length * (POINT_VALUES.socialPool / roster));
      html += `
        <div class="team-block">
          <p class="section-label">${row.team} - ${row.attendees.length}/${row.roster.length} attended (+${pts} pts)</p>
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
    const excusedWindow = state.excusedWindow || "AM";
    html += `
      <p class="card-note">Select who's excused for each session. This lets the system correctly reject a proxy check-in attempt for someone marked excused, and keeps "expected" headcount accurate automatically.</p>
      <div style="margin-bottom:16px"><p class="section-label">Roster size (adjust if a team's real headcount changes)</p>
        <table><thead><tr><th>Team</th><th>Roster</th></tr></thead><tbody>
          ${TEAMS.map((team) => `
            <tr>
              <td style="font-weight:700">${team}</td>
              <td><button class="adjust-btn" data-roster="${team}|-1">−</button><span class="adjust-value">${day.rosterSizes[team]}</span><button class="adjust-btn" data-roster="${team}|1">+</button></td>
            </tr>`).join("")}
        </tbody></table>
      </div>
      <div class="sub-tab-bar">
        ${["AM", "PM"].map((w) => `<button class="sub-tab-btn ${excusedWindow === w ? "sub-tab-btn-active" : ""}" data-excused-window="${w}">${w}</button>`).join("")}
      </div>`;
    TEAMS.forEach((team) => {
      const roster = SAMPLE_ROSTERS[team] || [];
      const excusedList = day.excused[excusedWindow][team] || [];
      const available = roster.filter((p) => !excusedList.includes(p));
      html += `
        <div class="team-block">
          <p class="section-label">${team} - ${excusedList.length} excused (${excusedWindow})</p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
            <select class="excused-select" data-excused-select="${excusedWindow}|${team}" style="max-width:220px">
              <option value="">+ Mark someone excused...</option>
              ${available.map((person) => `<option value="${escapeHtml(person)}">${escapeHtml(person)}</option>`).join("")}
            </select>
          </div>
          <div class="chip-row">
            ${excusedList.length === 0
              ? `<span class="card-note" style="margin:0">No one excused for ${excusedWindow} yet.</span>`
              : excusedList.map((person) => `
                  <span class="chip">
                    ${escapeHtml(person)}
                    <button class="chip-remove" data-excused-toggle="${excusedWindow}|${team}|${person}" title="Remove">✕</button>
                  </span>`).join("")}
          </div>
        </div>`;
    });
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
    ${renderCheckInFormHtml(true)}`;
}



// ===================== DATA MUTATIONS (all persist to Firestore) =====================
async function persistToday() {
  const day = today();
  try {
    await saveDay(dayStorageKey(day.dayIndex), day);
  } catch (e) {
    console.error("Failed to save day:", e);
  }
}

async function addAttendanceRecord(name, team, sessionWindow, tier, minutesEarly) {
  const day = today();
  day.attendanceRecords[sessionWindow].push({
    name, team, timestamp: Date.now(), tier, notes: "",
    minutesEarly: typeof minutesEarly === "number" ? Math.round(minutesEarly) : null,
  });
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

async function setSessionName(sessionWindow, timeKey, name) {
  const day = today();
  if (!day.sessionConfig[sessionWindow].sessionNames) day.sessionConfig[sessionWindow].sessionNames = {};
  day.sessionConfig[sessionWindow].sessionNames[timeKey] = name;
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

async function deleteAttendanceRecord(sessionWindow, team, index) {
  const day = today();
  const teamRecords = day.attendanceRecords[sessionWindow].filter((r) => r.team === team);
  const target = teamRecords[index];
  const globalIndex = day.attendanceRecords[sessionWindow].indexOf(target);
  if (globalIndex === -1) return;
  day.attendanceRecords[sessionWindow].splice(globalIndex, 1);
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

async function toggleExcused(sessionWindow, team, person) {
  debugLog(`toggleExcused called: window=${sessionWindow} team=${team} person=${person}`);
  const day = today();
  const list = day.excused[sessionWindow][team];
  const idx = list.indexOf(person);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(person);
  debugLog(`excused list for ${team}/${sessionWindow} now: ${JSON.stringify(list)}`);
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
  // Freeze an immutable copy of the day that's ending, exactly as it stood
  // at close — this is the point-in-time backup, separate from the live
  // mirror that updates on every save.
  const closingDay = state.days[state.days.length - 1];
  if (closingDay) await snapshotDayClose(closingDay);

  const newIndex = state.days.length + 1;
  const newDay = makeEmptyDay(newIndex);
  state.days.push(newDay);
  const indices = state.days.map((d) => d.dayIndex);
  await saveDay(dayStorageKey(newIndex), newDay);
  await saveDayIndex(indices);
  state.viewingDayIndex = newDay.dayIndex; // jump to viewing the new day
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
        let pts = 0;
        if (active && (rec.tier === "early" || rec.tier === "on-time")) {
          const pool = rec.tier === "early" ? POINT_VALUES.attendancePoolEarly : POINT_VALUES.attendancePoolOnTime;
          const roster = effectiveRosterCount(day.rosterSizes[rec.team], excusedForAttendance(day, sessionWindow, rec.team));
          pts = Math.round((pool / roster) * 10) / 10; // one decimal — this is a per-person share of the team pool
        }
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
      const themeRoster = effectiveRosterCount(day.rosterSizes[row.team], excusedForThemeDay(day, row.team));
      const themePts = Math.round((POINT_VALUES.themeDayPool / themeRoster) * 10) / 10;
      row.onTheme.forEach((entry) => {
        logRows.push({ Day: day.label, Team: row.team, Category: "Theme Day", Points: themePts, Note: `${entry.name} dressed on-theme (logged ${new Date(entry.timestamp).toLocaleTimeString()})`, "Entered By": "SRSS" });
      });
    });
    day.socials.forEach((row) => {
      const socialRoster = effectiveRosterCount(day.rosterSizes[row.team], 0);
      const socialPts = Math.round((POINT_VALUES.socialPool / socialRoster) * 10) / 10;
      row.attendees.forEach((entry) => {
        logRows.push({ Day: day.label, Team: row.team, Category: "Social Attendance", Points: socialPts, Note: `${entry.name} attended (30+ min, logged ${new Date(entry.timestamp).toLocaleTimeString()})`, "Entered By": "SRSS" });
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

  // Sheet 4: pure attendance checklist — one row per person, one column per
  // day/window, showing their tier that session. Deliberately has NO RTC
  // point columns at all — this is meant to be a plain attendance record,
  // useful independent of whether RTC scoring was even active that day.
  const allPeople = [];
  TEAMS.forEach((team) => {
    (SAMPLE_ROSTERS[team] || []).forEach((name) => allPeople.push({ name, team }));
  });
  const dayWindowColumns = [];
  state.days.forEach((day) => {
    dayWindowColumns.push({ day, window: "AM", header: `${day.label} AM` });
    dayWindowColumns.push({ day, window: "PM", header: `${day.label} PM` });
  });
  const checklistRows = allPeople.map(({ name, team }) => {
    const row = { Name: name, Team: team };
    dayWindowColumns.forEach(({ day, window, header }) => {
      const record = day.attendanceRecords[window].find((r) => r.team === team && r.name.toLowerCase() === name.toLowerCase());
      const excused = (day.excused[window][team] || []).includes(name);
      row[header] = record ? record.tier : excused ? "excused" : "-";
    });
    return row;
  });
  const ws4 = XLSX.utils.json_to_sheet(checklistRows);
  ws4["!cols"] = [{ wch: 20 }, { wch: 10 }, ...dayWindowColumns.map(() => ({ wch: 10 }))];
  XLSX.utils.book_append_sheet(wb, ws4, "Attendance Checklist");

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
        attachDayListenerForCurrentView(); // start live sync now that we're in the admin/display views
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
  if (lockBtn) lockBtn.onclick = () => { state.view = "public"; detachDayListener(); render(); };

  // New day
  const newDayBtn = document.getElementById("new-day-btn");
  if (newDayBtn) {
    newDayBtn.onclick = () => {
      // Export runs FIRST and synchronously (before any awaits) so the
      // browser still recognizes this as a direct result of the click —
      // some mobile browsers silently block file downloads that happen
      // after an async gap. This doubles as an off-Firestore backup point
      // at every day boundary, on top of the Firestore-side snapshot.
      try { exportToExcel(); } catch (e) { debugLog(`auto-export on new day failed: ${e.message || e}`); }
      startNewDay().then(() => attachDayListenerForCurrentView());
    };
  }

  // Day selector — lets SRSS go back and view/edit a previous day's data
  const daySelector = document.getElementById("day-selector");
  if (daySelector) {
    daySelector.onchange = () => {
      state.viewingDayIndex = Number(daySelector.value);
      render();
      attachDayListenerForCurrentView(); // switch the live listener to whichever day is now being viewed
    };
  }

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
    el.onblur = () => {
      const [w, timeKey] = el.dataset.sessionName.split("|");
      setSessionName(w, timeKey, el.value);
    };
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
  document.querySelectorAll("[data-delete-record]").forEach((el) => {
    el.onclick = () => {
      const key = el.dataset.deleteRecord;
      const [w, team, indexStr] = key.split("|");
      if (!window.confirm(`Delete this attendance record for ${team}? This can't be undone.`)) return;
      deleteAttendanceRecord(w, team, Number(indexStr));
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
  document.querySelectorAll("[data-excused-window]").forEach((el) => {
    el.onclick = () => { state.excusedWindow = el.dataset.excusedWindow; render(); };
  });
  document.querySelectorAll("[data-excused-toggle]").forEach((el) => {
    el.onclick = () => {
      const [w, team, person] = el.dataset.excusedToggle.split("|");
      toggleExcused(w, team, person);
    };
  });
  document.querySelectorAll("[data-excused-select]").forEach((el) => {
    el.onchange = () => {
      debugLog(`excused-select fired: value="${el.value}" dataset="${el.dataset.excusedSelect}"`);
      if (!el.value) return;
      const [w, team] = el.dataset.excusedSelect.split("|");
      toggleExcused(w, team, el.value);
    };
  });
}

function wireCheckInForm() {
  const windowSelect = document.getElementById("checkin-window");
  if (windowSelect) windowSelect.onchange = () => { checkinFormState.window = windowSelect.value; render(); };
  const nameSelect = document.getElementById("checkin-name");
  if (nameSelect) nameSelect.onchange = () => { checkinFormState.name = nameSelect.value; };
  const teamSelect = document.getElementById("checkin-team");
  if (teamSelect) {
    teamSelect.onchange = () => {
      checkinFormState.team = teamSelect.value;
      checkinFormState.name = ""; // team changed — the old name selection no longer applies
      render(); // re-render so the name dropdown repopulates with the new team's roster
    };
  }
  const wordInput = document.getElementById("checkin-word");
  if (wordInput) wordInput.oninput = () => { checkinFormState.enteredWord = wordInput.value; };
  const submitBtn = document.getElementById("checkin-submit");
  if (submitBtn) submitBtn.onclick = () => submitCheckIn();
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
} else if (window.__firebase) {
  // Firebase was already ready by the time this script ran — boot immediately.
  boot();
  setInterval(tickLiveCodes, 1000);
} else {
  // The inline module script that sets window.__firebase hasn't finished its
  // async imports yet (module scripts don't guarantee execution order the
  // way regular scripts do) — poll briefly instead of assuming it's ready.
  let waited = 0;
  const waitForFirebase = setInterval(() => {
    waited += 200;
    if (window.__firebaseInitError) {
      clearInterval(waitForFirebase);
      document.getElementById("root").innerHTML = `
        <div class="loading-shell">
          <div class="error-box">
            <p class="error-title">Couldn't load Firebase</p>
            <p class="error-sub">The Firebase connection itself failed to start up.</p>
            <p style="font-size:11px;color:#8a8a7e;margin-top:10px;word-break:break-word">${escapeHtml(window.__firebaseInitError)}</p>
          </div>
        </div>`;
    } else if (window.__firebase) {
      clearInterval(waitForFirebase);
      boot();
      setInterval(tickLiveCodes, 1000);
    } else if (waited >= 8000) {
      clearInterval(waitForFirebase);
      document.getElementById("root").innerHTML = `
        <div class="loading-shell">
          <div class="error-box">
            <p class="error-title">Couldn't load Firebase</p>
            <p class="error-sub">The Firebase SDK never finished loading. Check your internet connection and try reloading the page.</p>
          </div>
        </div>`;
    }
  }, 200);
}

setTimeout(() => {
  if (state.loading) {
    console.error("Boot failsafe triggered");
    state.loading = false;
    state.storageError = true;
    state.lastBootError = state.lastBootError || "Boot did not complete within 15 seconds (no specific error captured).";
    render();
  }
}, 15000);
