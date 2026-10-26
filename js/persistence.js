import { POSITIONS, state } from './state.js';
import { showScreen } from './utils.js';
import { APP_VERSION } from './version.js';
import { normalizeGamePlan, normalizeProfile } from './profile-normalizer.js';


export function saveSettings() {
  localStorage.setItem('soccerSettings', JSON.stringify({
    teamName: state.teamName,
    halfMinutes: state.halfMinutes,
    minPlayMinutes: state.minPlayMinutes,
  }));
}

export function applySettingsToUi() {
  document.getElementById('team-name-input').value = state.teamName;
  document.getElementById('app-title-name').textContent = state.teamName;
  document.getElementById('half-minutes-display').textContent = `${state.halfMinutes} min`;
  const minPlayEl = document.getElementById('min-play-display');
  if (minPlayEl) minPlayEl.textContent = state.minPlayMinutes === 0 ? 'off' : `${state.minPlayMinutes} min`;
}

export function loadSettings() {
  const raw = localStorage.getItem('soccerSettings');
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s.teamName)               state.teamName       = s.teamName;
      if (s.halfMinutes)            state.halfMinutes    = s.halfMinutes;
      if (s.minPlayMinutes != null) state.minPlayMinutes = s.minPlayMinutes;
    } catch { localStorage.removeItem('soccerSettings'); }
  }
  applySettingsToUi();
}

// Persists the "Plan Both Halves in Advance" lineups on their own, separate
// from the active-game snapshot, so a saved plan survives closing the
// browser entirely before the game even starts.
export function saveGamePlan() {
  if (state.gamePlan) {
    if (!state.gamePlan.gameNumber) state.gamePlan.gameNumber = state.gameHistory.length + 1;
    localStorage.setItem('soccerGamePlan', JSON.stringify(state.gamePlan));
  } else {
    localStorage.removeItem('soccerGamePlan');
  }
  if (state.queuedPlans.length) {
    localStorage.setItem('soccerQueuedPlans', JSON.stringify(state.queuedPlans));
  } else {
    localStorage.removeItem('soccerQueuedPlans');
  }
}

// Drops plans for games already played and, when the next game has no plan of
// its own, promotes its queued plan. Returns true when state.gamePlan changed.
export function reconcilePlans() {
  const next = state.gameHistory.length + 1;
  let changed = false;
  if (state.gamePlan && state.gamePlan.gameNumber < next) {
    state.gamePlan = null;
    changed = true;
  }
  state.queuedPlans = state.queuedPlans.filter(p => p.gameNumber >= next);
  if (!state.gamePlan) {
    const queued = state.queuedPlans.find(p => p.gameNumber === next);
    if (queued) {
      state.gamePlan = queued;
      state.queuedPlans = state.queuedPlans.filter(p => p !== queued);
      changed = true;
    }
  }
  state.queuedPlans = state.queuedPlans.filter(p => p.gameNumber > next);
  return changed;
}

function applyPlanToSetup(plan) {
  state.gameDate = plan.date || state.gameDate;
  state.opponentName = plan.opponent || state.opponentName;
  state.savedChecked = new Set(plan.playerIds || []);
}

// Makes the next game's plan current after a game ends (or on startup) and
// loads its players, opponent and date into the game-day setup state.
export function promoteNextGamePlan() {
  reconcilePlans();
  if (state.gamePlan) applyPlanToSetup(state.gamePlan);
  saveGamePlan();
}

export function loadGamePlan() {
  const validPlayerIds = new Set(state.roster.map(p => p.id));
  const defaultGameNumber = state.gameHistory.length + 1;
  state.gamePlan = null;
  state.queuedPlans = [];
  const rawPlan = localStorage.getItem('soccerGamePlan');
  if (rawPlan) {
    try {
      state.gamePlan = normalizeGamePlan(JSON.parse(rawPlan), { validPlayerIds, defaultGameNumber });
    } catch { state.gamePlan = null; }
  }
  const rawQueued = localStorage.getItem('soccerQueuedPlans');
  if (rawQueued) {
    try {
      const parsed = JSON.parse(rawQueued);
      state.queuedPlans = (Array.isArray(parsed) ? parsed : [])
        .map(p => normalizeGamePlan(p, { validPlayerIds }))
        .filter(Boolean);
    } catch { state.queuedPlans = []; }
  }
  reconcilePlans();
  if (state.gamePlan) applyPlanToSetup(state.gamePlan);
  saveGamePlan();
}

export function loadGameHistory() {
  const raw = localStorage.getItem('soccerGameHistory');
  if (raw) {
    try { state.gameHistory = JSON.parse(raw); }
    catch { localStorage.removeItem('soccerGameHistory'); }
  }
}

export function saveGameHistory() {
  localStorage.setItem('soccerGameHistory', JSON.stringify(state.gameHistory));
}

export function saveActiveGame() {
  try {
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: state.players,
      totalElapsed: state.totalElapsed,
      halfClock: state.halfClock,
      currentHalf: state.currentHalf,
      halfActionIsEnd: state.halfActionIsEnd,
      goalie1Id: state.goalie1Id,
      goalie2Id: state.goalie2Id,
      activeGoalieId: state.activeGoalieId,
      opponentName: state.opponentName,
      scoreUs: state.scoreUs,
      scoreThem: state.scoreThem,
      goals: state.goals,
      halfMinutes: state.halfMinutes,
      subPlans: state.subPlans,
      plannedSubRoundIndex: state.plannedSubRoundIndex,
      gameDate: state.gameDate,
      gamePlan: state.gamePlan
    }));
  } catch (e) {
    console.error('saveActiveGame failed:', e);
  }
}

export function clearActiveGame() {
  localStorage.removeItem('soccerActiveGame');
}

export function checkForActiveGame() {
  const raw = localStorage.getItem('soccerActiveGame');
  if (!raw) return;
  let saved;
  try { saved = JSON.parse(raw); } catch { clearActiveGame(); return; }
  if (!saved.players || !saved.players.length) { clearActiveGame(); return; }
  if (!confirm('A game was interrupted. Resume where you left off?')) { clearActiveGame(); return; }

  state.players          = saved.players         || [];
  state.totalElapsed     = saved.totalElapsed    || 0;
  state.halfClock        = saved.halfClock       || 0;
  state.currentHalf      = saved.currentHalf     || 1;
  state.halfActionIsEnd  = saved.halfActionIsEnd || false;
  state.goalie1Id        = saved.goalie1Id       ?? null;
  state.goalie2Id        = saved.goalie2Id       ?? null;
  state.activeGoalieId   = saved.activeGoalieId  ?? null;
  state.opponentName     = saved.opponentName    || '';
  state.scoreUs          = saved.scoreUs         || 0;
  state.scoreThem        = saved.scoreThem       || 0;
  state.goals            = saved.goals           || [];
  state.halfMinutes      = saved.halfMinutes     || 25;
  state.subPlans         = (Array.isArray(saved.subPlans) ? saved.subPlans : []).filter(pl => {
    const inn = pl && state.players.find(p => p.id === pl.inId);
    return inn && !inn.onField && !inn.leftEarly && Object.prototype.hasOwnProperty.call(POSITIONS, pl.pos);
  });
  state.subPick          = null;
  state.plannedSubRoundIndex = Number.isInteger(saved.plannedSubRoundIndex) ? saved.plannedSubRoundIndex : 0;
  state.gameDate         = saved.gameDate        || new Date().toISOString().slice(0, 10);
  state.gamePlan         = saved.gamePlan        ?? null;

  showScreen('game-screen');
  document.dispatchEvent(new CustomEvent('game:resumed'));
}

export function buildGameRecord() {
  const gameRecord = {
    date:       state.gameDate || new Date().toISOString().slice(0, 10),
    opponent:   state.opponentName,
    ourScore:   state.scoreUs,
    theirScore: state.scoreThem,
    goals: state.goals,
    playerStats: state.players.map(p => ({
      id:            p.id,
      name:          p.name,
      minutesPlayed: Math.round(p.totalPlayed / 60 * 10) / 10,
      secondsPlayed: p.totalPlayed,
      firstHalfSeconds: Number.isFinite(p.h1Snapshot) ? p.h1Snapshot : p.totalPlayed,
      secondHalfSeconds: Number.isFinite(p.h1Snapshot) ? Math.max(0, p.totalPlayed - p.h1Snapshot) : 0,
      positionSeconds: p.positionTime || {},
      positionMinutes: Object.fromEntries(
        Object.entries(p.positionTime || {}).map(([pos, s]) => [pos, Math.round(s / 60 * 10) / 10])
      ),
    })),
  };
  const currentGameNumber = state.gameHistory.length + 1;
  if (state.gamePlan && state.gamePlan.gameNumber === currentGameNumber) {
    const { half1, half2 } = state.gamePlan;
    if (half1 || half2) {
      gameRecord.plannedLineups = {
        ...(half1 ? { half1: { ...half1 } } : {}),
        ...(half2 ? { half2: { ...half2 } } : {}),
      };
    }
  }
  return gameRecord;
}

// Spring = Jan–Jun, Fall = Jul–Dec, e.g. '2026-05-30' -> '2026-Spring'.
export function seasonLabel(dateStr) {
  const m = /^(\d{4})-(\d{2})/.exec(dateStr || '');
  if (!m) return '';
  return `${m[1]}-${Number(m[2]) <= 6 ? 'Spring' : 'Fall'}`;
}

export function buildProfile(includeGameRecord) {
  const profile = {
    appVersion: APP_VERSION,
    season: '',
    teamName: state.teamName,
    halfMinutes: state.halfMinutes,
    roster: state.roster.map(p => ({
      id:    p.id,
      name:  p.name,
      photo: state.playerPhotos[p.id] || null,
    })),
    games: [...state.gameHistory],
  };

  if (includeGameRecord) {
    profile.games.push(buildGameRecord());
  }

  const nextGameNumber = profile.games.length + 1;
  const serializePlan = (plan, isNext) => {
    const lineupPlayerIds = [
      ...Object.values(plan.half1 || {}),
      ...Object.values(plan.half2 || {}),
    ];
    const date = plan.date || (isNext ? state.gameDate : '');
    const opponent = plan.opponent || (isNext ? state.opponentName : '');
    return {
      gameNumber: plan.gameNumber,
      ...(date ? { date } : {}),
      ...(opponent ? { opponent } : {}),
      playerIds: [...new Set([...(plan.playerIds || []), ...lineupPlayerIds])],
      ...(plan.half1 ? { half1: { ...plan.half1 } } : {}),
      ...(plan.half2 ? { half2: { ...plan.half2 } } : {}),
      ...(plan.half1Subs && plan.half1Subs.length ? { half1Subs: plan.half1Subs } : {}),
      ...(plan.half2Subs && plan.half2Subs.length ? { half2Subs: plan.half2Subs } : {}),
    };
  };
  const allPlans = [state.gamePlan, ...state.queuedPlans].filter(Boolean);
  const nextPlan = allPlans.find(p => p.gameNumber === nextGameNumber);
  if (nextPlan) profile.gamePlan = serializePlan(nextPlan, nextPlan === state.gamePlan);
  const laterPlans = allPlans
    .filter(p => p.gameNumber > nextGameNumber)
    .sort((a, b) => a.gameNumber - b.gameNumber)
    .map(p => serializePlan(p, false));
  if (laterPlans.length) profile.queuedPlans = laterPlans;

  const latestGame = profile.games[profile.games.length - 1];
  profile.season = seasonLabel(latestGame && latestGame.date);
  if (!profile.season) delete profile.season;

  return profile;
}

export function exportProfile(includeGameRecord = false, forceGameFilename = false) {
  const profile  = buildProfile(includeGameRecord);
  const safeName = (state.teamName || 'team').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const prefix   = profile.season ? `${safeName}_${profile.season}` : safeName;
  const now      = new Date();
  const pad      = n => String(n).padStart(2, '0');
  const today    = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr  = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  let filename;
  if (includeGameRecord || forceGameFilename) {
    const latestGame = profile.games[profile.games.length - 1] || {};
    const gameNumber = profile.games.length || 1;
    const dateStr = latestGame.date || today;
    filename = `${prefix}_Game_${gameNumber}_${dateStr}_${timeStr}.json`;
  } else if (profile.gamePlan) {
    const dateStr = profile.gamePlan.date || state.gameDate || today;
    const plannedSeason = seasonLabel(dateStr);
    const plannedPrefix = plannedSeason ? `${safeName}_${plannedSeason}` : prefix;
    filename = `${plannedPrefix}_Game_${profile.gamePlan.gameNumber}_Planned_${dateStr}_${timeStr}.json`;
  } else {
    filename = `${prefix}-profile.json`;
  }

  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProfile() {
  document.getElementById('import-file-input').click();
}

export function importLeagueCsv() {
  document.getElementById('csv-file-input').click();
}

export function parseCsvRoster(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { alert('CSV appears empty.'); return; }

  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const firstIdx = headers.indexOf('player_first_name');
  const lastIdx  = headers.indexOf('player_last_name');

  if (firstIdx === -1 || lastIdx === -1) {
    alert('Could not find player_first_name / player_last_name columns in this CSV.');
    return;
  }

  const imported = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const first = (cols[firstIdx] || '').trim();
    const last  = (cols[lastIdx]  || '').trim();
    if (!first) continue;
    const name = last ? `${first} ${last[0].toUpperCase()}.` : first;
    imported.push(name);
  }

  if (!imported.length) { alert('No players found in CSV.'); return; }

  const existing = new Set(state.roster.map(p => p.name.toLowerCase()));
  const seenImported = new Set();
  const newNames = [];
  const dupNames = [];

  imported.forEach(name => {
    const key = name.toLowerCase();
    if (existing.has(key) || seenImported.has(key)) {
      dupNames.push(name);
      return;
    }
    seenImported.add(key);
    newNames.push(name);
  });

  const msg = [
    `Found ${imported.length} player(s) in CSV.`,
    newNames.length  ? `${newNames.length} will be added.`    : '',
    dupNames.length  ? `${dupNames.length} already exist and will be skipped.` : '',
  ].filter(Boolean).join('\n');

  if (!newNames.length) {
    alert('All players in the CSV already exist in your roster. Nothing to add.');
    return;
  }

  if (confirm(`${msg}\n\nProceed?`)) {
    newNames.forEach(name => {
      state.roster.push({ id: state.nextId++, name });
    });
    saveRoster();
    document.dispatchEvent(new CustomEvent('league-csv:imported'));
  }
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function importGameReview() {
  document.getElementById('review-file-input').click();
}

export function initEventListeners() {
  document.getElementById('csv-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => parseCsvRoster(ev.target.result);
    reader.readAsText(file);
    this.value = '';
  });

  document.getElementById('import-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const profile = normalizeProfile(JSON.parse(ev.target.result), {
          defaultHalfMinutes: state.halfMinutes,
          defaultTeamName: state.teamName,
          requireRoster: true,
        });

        state.teamName    = profile.teamName;
        state.halfMinutes = profile.halfMinutes;
        state.gameHistory = profile.games;
        state.roster      = profile.roster.map(p => ({ id: p.id, name: p.name }));
        const nextGameNumber = state.gameHistory.length + 1;
        const pendingPlan = profile.gamePlan && profile.gamePlan.gameNumber === nextGameNumber
          ? profile.gamePlan
          : null;
        const planDetails = pendingPlan
          ? [
              `Game ${pendingPlan.gameNumber}`,
              pendingPlan.opponent ? `vs ${pendingPlan.opponent}` : '',
              pendingPlan.date ? `on ${pendingPlan.date}` : '',
            ].filter(Boolean).join(' ')
          : '';
        const restorePlan = pendingPlan
          ? confirm(`This backup includes a saved plan for ${planDetails}.\n\nRestore its planned players, opponent, date, and both lineups?`)
          : false;
        state.gamePlan = restorePlan ? pendingPlan : null;
        state.queuedPlans = restorePlan || !pendingPlan
          ? (profile.queuedPlans || []).filter(p => p.gameNumber > nextGameNumber)
          : [];
        state.planOffset = 0;
        state.savedChecked = new Set(restorePlan ? pendingPlan.playerIds : []);
        state.opponentName = restorePlan ? pendingPlan.opponent || '' : '';
        state.gameDate = restorePlan ? pendingPlan.date || '' : '';
        state.nextId      = state.roster.length ? Math.max(...state.roster.map(p => p.id)) + 1 : 1;
        const importedPhotos = {};

        profile.roster.forEach(p => {
          if (p.photo) importedPhotos[p.id] = p.photo;
        });

        state.playerPhotos = importedPhotos;
        localStorage.removeItem('playerPhotos');
        try {
          if (Object.keys(importedPhotos).length) {
            localStorage.setItem('playerPhotos', JSON.stringify(importedPhotos));
          }
        } catch (e) {
          state.playerPhotos = {};
          localStorage.removeItem('playerPhotos');
          alert('Storage full \u2014 some photos from the imported profile could not be saved.');
        }
        saveRoster();

        saveSettings();
        saveGameHistory();
        saveGamePlan();
        clearActiveGame();

        applySettingsToUi();
        const opponentInput = document.getElementById('opponent-input');
        if (opponentInput) opponentInput.value = '';
        document.dispatchEvent(new CustomEvent('profile:imported', {
          detail: { restoredPlan: restorePlan },
        }));
      } catch (err) {
        alert(`Invalid profile file. ${err.message}`);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  document.getElementById('review-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const profile = normalizeProfile(JSON.parse(ev.target.result), {
          defaultHalfMinutes: state.halfMinutes,
          defaultTeamName: state.teamName,
          requireGames: true,
        });
        const gameRecord = profile.games[profile.games.length - 1];
        document.dispatchEvent(new CustomEvent('game-review:loaded', {
          detail: { gameRecord, teamName: profile.teamName || state.teamName }
        }));
      } catch (err) {
        alert(`Invalid game file. ${err.message}`);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });
}

export function loadRoster() {
  const saved = localStorage.getItem('soccerRoster');
  if (saved) {
    try {
      state.roster = JSON.parse(saved);
      state.nextId  = state.roster.length ? Math.max(...state.roster.map(p => p.id)) + 1 : 1;
    } catch { localStorage.removeItem('soccerRoster'); }
  }
}

export function saveRoster() {
  localStorage.setItem('soccerRoster', JSON.stringify(state.roster));
}
