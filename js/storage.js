// localStorage persistence for last-used name + beast preference, so
// returning players don't have to re-type/re-pick every time.

const SETTINGS_KEY = "survivor.settings.v1";

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
