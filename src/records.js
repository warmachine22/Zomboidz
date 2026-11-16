import { BUILD } from './simulation.js';

const scoresKey = 'zomboidz.scores.v1';
const settingsKey = 'zomboidz.settings.v1';
const defaults = { leftHanded: false, seated: false, reducedFlashes: false, visibility: false, volume: .75, initials: 'YOU' };
let fallbackScores = [];

function read(key, otherwise) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : otherwise;
  } catch { return otherwise; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function initials(text) {
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'YOU';
}

export function loadSettings() {
  const value = read(settingsKey, {});
  const settings = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (typeof value?.[key] === typeof defaults[key]) settings[key] = value[key];
  }
  settings.volume = Math.max(0, Math.min(1, settings.volume));
  settings.initials = initials(settings.initials);
  return settings;
}

export function saveSettings(settings) {
  write(settingsKey, settings);
}

export function formatTime(seconds) {
  const s = Math.floor(Math.max(0, seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function rapidSeed() {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(36)).join('-');
}

export function listScores() {
  const stored = read(scoresKey, []);
  const scores = new Map((Array.isArray(stored) ? stored : []).filter(row =>
    typeof row?.id === 'string' && Number.isFinite(row.time) && Number.isFinite(row.kills) &&
    Number.isFinite(row.headshots) && typeof row.initials === 'string').map(row => [row.id, row]));
  for (const row of fallbackScores) scores.set(row.id, row);
  return [...scores.values()].sort(compare).slice(0, 10);
}

function compare(a, b) {
  return b.time - a.time || b.kills - a.kills || b.headshots - a.headshots || a.id.localeCompare(b.id);
}

export function recordRun(run, id, label) {
  const entry = {
    id, initials: initials(label), time: Math.floor(run.time * 100) / 100,
    kills: run.player.kills, headshots: run.player.headshots, seed: run.seed, version: BUILD,
  };
  const records = [...listScores().filter(row => row.id !== id), entry].sort(compare).slice(0, 10);
  fallbackScores = records;
  const saved = write(scoresKey, records);
  return { saved, place: records.findIndex(row => row.id === id) + 1 };
}
