// localStorage persistence for last-used name + beast preference, so
// returning players don't have to re-type/re-pick every time.

const SETTINGS_KEY = "survivor.settings.v1";
const PLAYER_SESSIONS_KEY = "survivor.playerSessions.v1";

export const DEFAULT_SETTINGS = {
  name: "",
  creatureId: null, // null = auto-assign first free beast
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked — the game still works for this session
  }
}

export function loadSettings() {
  const saved = read(SETTINGS_KEY, null);
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

export function loadPlayerSession(code) {
  const sessions = read(PLAYER_SESSIONS_KEY, {});
  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) return null;
  const session = sessions[String(code || "").toUpperCase()];
  if (!session || typeof session.resumeToken !== "string" || !session.resumeToken) return null;
  return { resumeToken: session.resumeToken, name: typeof session.name === "string" ? session.name : "" };
}

export function savePlayerSession(code, session) {
  const roomCode = String(code || "").toUpperCase();
  if (!roomCode || !session?.resumeToken) return;
  const saved = read(PLAYER_SESSIONS_KEY, {});
  const sessions = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  sessions[roomCode] = { resumeToken: session.resumeToken, name: String(session.name || "").slice(0, 20) };
  write(PLAYER_SESSIONS_KEY, sessions);
}

export function createResumeToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure browser storage is unavailable");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
}
