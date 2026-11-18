import { BUILD, GUNS } from './simulation.js';
import { gunAngle } from './held-tools.js';
import { ARSENAL_WAVES, DIFFICULTIES, difficultyKey, MODES } from './difficulty.js';
import { defaultTuning, normalizeTuning } from './campaign.js';

const scoresKey = 'zomboidz.scores.v1';
const settingsKey = 'zomboidz.settings.v1';
const defaults = { leftHanded: false, seated: false, reducedFlashes: false, visibility: false,
  laserDot: false, mode: 'survival', arsenalWave: 0, arsenalWeapon: 'pistol',
  volume: .75, initials: 'YOU', gunPitch: 0, gunYaw: 0, difficulty: 'standard' };
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
  settings.gunPitch = gunAngle(settings.gunPitch);
  settings.gunYaw = gunAngle(settings.gunYaw);
  settings.difficulty = difficultyKey(settings.difficulty);
  if (!Object.hasOwn(MODES, value?.mode)) settings.mode = value?.legendary === true ? 'legendary' : defaults.mode;
  if (!ARSENAL_WAVES.includes(settings.arsenalWave)) settings.arsenalWave = defaults.arsenalWave;
  if (!Object.hasOwn(GUNS, settings.arsenalWeapon)) settings.arsenalWeapon = defaults.arsenalWeapon;
  settings.populationRevision=1;
  settings.zombieTuning=Object.fromEntries(Object.keys(DIFFICULTIES).map(level=>{
    const source=value?.zombieTuning?.[level];
    const oldDefault={easy:90,standard:125,hard:150}[level];
    const tuning=!value?.populationRevision && source?.population===oldDefault
      ? {...source,population:defaultTuning(level).population} : source;
    return [level,normalizeTuning(level,tuning)];
  }));
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

function allScores() {
  const stored = read(scoresKey, []);
  const scores = new Map((Array.isArray(stored) ? stored : []).filter(row =>
    typeof row?.id === 'string' && Number.isFinite(row.time) && Number.isFinite(row.kills) &&
    Number.isFinite(row.headshots) && typeof row.initials === 'string').map(row => [row.id, row]));
  for (const row of fallbackScores) scores.set(row.id, row);
  return [...scores.values()].map(row => ({...row, difficulty:difficultyKey(row.difficulty)}));
}

export function listScores(difficulty = 'standard', ruleset = 'classic') {
  return allScores().filter(row => row.difficulty === difficultyKey(difficulty) && (row.ruleset??'classic')===ruleset)
    .sort(compare).slice(0,10);
}

function compare(a, b) {
  if (a.escaped || b.escaped)
    return Number(Boolean(b.escaped))-Number(Boolean(a.escaped)) || a.time-b.time || b.kills-a.kills || a.id.localeCompare(b.id);
  return b.time - a.time || b.kills - a.kills || b.headshots - a.headshots || a.id.localeCompare(b.id);
}

export function recordRun(run, id, label) {
  if (run.arsenal || run.legendary || run.campaign?.ranked===false) return { saved:false, place:0 };
  const entry = {
    id, initials: initials(label), time: Math.floor(run.time * 100) / 100,
    kills: run.player.kills, headshots: run.player.headshots, seed: run.seed, version: BUILD, difficulty:difficultyKey(run.difficulty),
    ruleset:run.campaign?'plateau':'classic', escaped:run.status==='escaped',
  };
  const scores = [...allScores().filter(row => row.id !== id), entry].sort(compare);
  const group = (level,ruleset) => scores.filter(row=>row.difficulty===level && (row.ruleset??'classic')===ruleset).slice(0,10);
  const records = Object.keys(DIFFICULTIES).flatMap(level=>[...group(level,'classic'),...group(level,'plateau')]);
  fallbackScores = records;
  const saved = write(scoresKey, records);
  return { saved, place: group(entry.difficulty,entry.ruleset).findIndex(row=>row.id===id)+1 };
}
