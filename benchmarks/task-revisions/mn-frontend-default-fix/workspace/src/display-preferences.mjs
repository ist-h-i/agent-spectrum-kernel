export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({ compactRows: true, showDetails: false });

export function initializeDisplayPreferences(saved = {}) {
  return {
    compactRows: saved.compactRows || DEFAULT_DISPLAY_PREFERENCES.compactRows,
    showDetails: typeof saved.showDetails === "boolean" ? saved.showDetails : DEFAULT_DISPLAY_PREFERENCES.showDetails,
  };
}

export function updateDisplayPreference(state, key, value) {
  if (!Object.keys(DEFAULT_DISPLAY_PREFERENCES).includes(key)) throw new RangeError("unknown display preference");
  if (typeof value !== "boolean") throw new TypeError("display preference must be a boolean");
  return { ...state, [key]: value };
}

export function resetDisplayPreferences() {
  return { ...DEFAULT_DISPLAY_PREFERENCES };
}
