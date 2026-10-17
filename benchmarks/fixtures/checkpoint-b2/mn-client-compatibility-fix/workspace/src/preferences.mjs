export function readPreference(record, key, fallback) {
  return Object.hasOwn(record, key) ? record[key] : fallback;
}
