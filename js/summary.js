import { state } from './state.js';
import { clearActiveGame, exportProfile, saveGameHistory, saveGamePlan, saveRoster, saveSettings } from './persistence.js';
import { avatarHtml, renderGameDayCheckboxes, renderTeamSetupRoster, updatePlanAheadStatus } from './roster.js';
import { closeModal, escHtml, fmt, openModal, showScreen } from './utils.js';
import { APP_VERSION } from './version.js';



export function renderGoalsHtml(goalsArray) {
  const teamGoals = goalsArray.filter(g => g.team === 'us');
  if (!teamGoals.length) {
    return '<div class="summary-goal-empty">No goals recorded.</div>';
  }
  const grouped = teamGoals.reduce((acc, g) => {
    const key = g.scorerId != null ? g.scorerId : (g.scorer || 'Unknown');
    if (!acc[key]) acc[key] = { scorer: g.scorer, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => {
    const result = b.count - a.count;
    if (result !== 0) return result;
    return (a.scorer || 'Unknown').localeCompare(b.scorer || 'Unknown');
  }).map(entry => {
    const label = escHtml(entry.scorer || 'Unknown');
    return `
      <div class="summary-goal-item">
        <span class="summary-goal-count">${entry.count}</span>
        <div class="summary-goal-scorer">${label}</div>
      </div>
    `;
  }).join('');
}

export function showGameReviewFromRecord(gameRecord, profileTeamName) {
  const stats   = gameRecord.playerStats || [];
  const sorted  = [...stats].sort((a, b) => b.secondsPlayed - a.secondsPlayed);
  const maxTime = sorted.length ? sorted[0].secondsPlayed : 1;
  const totalAll = stats.reduce((s, p) => s + p.secondsPlayed, 0);
  const avg = stats.length ? Math.round(totalAll / stats.length) : 0;

  const tbody = document.getElementById('summary-body');
  tbody.innerHTML = sorted.map(p => {
    const pct = maxTime > 0 ? Math.round((p.secondsPlayed / maxTime) * 100) : 0;
    const hasHalfSplit = Number.isFinite(p.firstHalfSeconds) && Number.isFinite(p.secondHalfSeconds);
    const firstHalf = hasHalfSplit ? fmt(p.firstHalfSeconds) : '&mdash;';
    const secondHalf = hasHalfSplit ? fmt(p.secondHalfSeconds) : '&mdash;';
    const posChips = Object.entries(p.positionSeconds || {})
      .filter(([, t]) => t > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([pos, t]) => `<span class="summary-pos-chip">${pos} <strong>${fmt(t)}</strong></span>`)
      .join('');
    const posHtml = posChips ? `<div class="summary-pos-breakdown">${posChips}</div>` : '';
    const goalieIcon = (p.positionSeconds || {}).GK > 0
      ? '<span class="summary-goalie-icon" title="Goalkeeper" aria-label="Goalkeeper">&#129508;</span>'
      : '';
    return `
      <tr>
        <td>
          <div class="summary-player-cell">
            <div class="summary-player-avatar">${avatarHtml(p.id, p.name, 30)}</div>
            <div class="summary-player-info">
              <div class="summary-player-name">${escHtml(p.name)}${goalieIcon}</div>
              ${posHtml}
            </div>
          </div>
        </td>
        <td>${firstHalf}</td>
        <td>${secondHalf}</td>
        <td class="total-col">
          ${fmt(p.secondsPlayed)}
          <div class="time-bar"><div class="time-bar-fill" style="width:${pct}%"></div></div>
        </td>
      </tr>
    `;
  }).join('');

  const tn  = profileTeamName || 'Team';
  const opp = gameRecord.opponent || 'Opponent';
  document.getElementById('summary-team-name').textContent = tn;
  document.getElementById('summary-vs-line').textContent =
    `vs ${opp}  \u2022  ${gameRecord.ourScore} \u2013 ${gameRecord.theirScore}`;
  document.getElementById('summary-meta').textContent =
    `${stats.length} players \u00B7 Avg: ${fmt(avg)} \u00B7 ${gameRecord.date || ''}`;

  document.getElementById('summary-goals').innerHTML =
    renderGoalsHtml(gameRecord.goals || []);

  document.getElementById('summary-export-btn').style.display = 'none';
  showScreen('summary-screen');
}

export function setSeasonSort(key) {
  if (state.seasonSortKey === key) {
    state.seasonSortDir = state.seasonSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.seasonSortKey = key;
    state.seasonSortDir = key === 'name' ? 'asc' : 'desc';
  }
  showSeasonSummary();
}

function compareSeasonPlayers(a, b) {
  if (state.seasonSortKey === 'name') {
    const result = a.name.localeCompare(b.name);
    return state.seasonSortDir === 'asc' ? result : -result;
  }

  const result = (a[state.seasonSortKey] || 0) - (b[state.seasonSortKey] || 0);
  if (result !== 0) return state.seasonSortDir === 'asc' ? result : -result;
  return a.name.localeCompare(b.name);
}

function playerKey(id) {
  return String(id);
}

function updateSeasonSortHeaders() {
  const map = {
    name: 'season-sort-player',
    games: 'season-sort-gp',
    goals: 'season-sort-goals',
    seconds: 'season-sort-time',
  };

  Object.entries(map).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const indicator = btn.querySelector('.sort-indicator');
    const isActive = key === state.seasonSortKey;
    btn.classList.toggle('active', isActive);
    if (indicator) indicator.textContent = isActive ? (state.seasonSortDir === 'asc' ? '\u25B2' : '\u25BC') : '';
  });
}

export function showSeasonSummary() {
  if (!state.gameHistory.length) {
    alert('No games recorded yet.');
    return;
  }

  let wins = 0, losses = 0, draws = 0, gf = 0, ga = 0;
  const playerMap = {};

  state.roster.forEach(r => {
    playerMap[playerKey(r.id)] = {
      id: r.id,
      name: r.name,
      games: 0,
      seconds: 0,
      goals: 0,
      posSeconds: {},
    };
  });

  state.gameHistory.forEach(game => {
    const us = game.ourScore || 0, them = game.theirScore || 0;
    if (us > them) wins++;
    else if (us < them) losses++;
    else draws++;
    gf += us;
    ga += them;

    (game.playerStats || []).forEach(ps => {
      const key = playerKey(ps.id);
      if (!playerMap[key]) {
        const nameKey = Object.keys(playerMap).find(k => playerMap[k].name === ps.name);
        playerMap[key] = nameKey
          ? playerMap[nameKey]
          : { id: ps.id, name: ps.name, games: 0, seconds: 0, goals: 0, posSeconds: {} };
      }
      const e = playerMap[key];
      e.games++;
      e.seconds += ps.secondsPlayed || 0;
      Object.entries(ps.positionSeconds || {}).forEach(([pos, t]) => {
        e.posSeconds[pos] = (e.posSeconds[pos] || 0) + t;
      });
    });

    (game.goals || []).filter(g => g.team === 'us' && g.scorer).forEach(g => {
      const found = g.scorerId != null
        ? playerMap[playerKey(g.scorerId)]
        : Object.values(playerMap).find(p => p.name === g.scorer);
      if (found) found.goals++;
    });
  });

  const seasonPlayers = Object.values(playerMap);
  const sorted  = seasonPlayers.sort(compareSeasonPlayers);
  const maxSecs = seasonPlayers.length ? Math.max(...seasonPlayers.map(p => p.seconds)) : 1;

  document.getElementById('season-team-name').textContent = state.teamName;
  document.getElementById('season-wins').textContent      = wins;
  document.getElementById('season-losses').textContent    = losses;
  document.getElementById('season-draws').textContent     = draws;
  document.getElementById('season-gf').textContent        = gf;
  document.getElementById('season-ga').textContent        = ga;
  document.getElementById('season-meta').textContent      =
    `${state.gameHistory.length} game${state.gameHistory.length !== 1 ? 's' : ''} \u00B7 ${sorted.length} players`;

  updateSeasonSortHeaders();

  document.getElementById('season-body').innerHTML = sorted.map(p => {
    const pct      = maxSecs > 0 ? Math.round((p.seconds / maxSecs) * 100) : 0;
    const posChips = Object.entries(p.posSeconds)
      .filter(([, t]) => t > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([pos, t]) => `<span class="summary-pos-chip">${pos} <strong>${fmt(t)}</strong></span>`)
      .join('');
    const posHtml   = posChips ? `<div class="summary-pos-breakdown">${posChips}</div>` : '';
    const goalsHtml = p.goals > 0 ? `<span style="color:#ffd54f">\u26BD ${p.goals}</span>` : '&mdash;';
    return `
      <tr>
        <td>
          <div class="summary-player-cell">
            <div class="summary-player-avatar">${avatarHtml(p.id, p.name, 30)}</div>
            <div class="summary-player-info">
              <div class="summary-player-name">${escHtml(p.name)}</div>
              ${posHtml}
            </div>
          </div>
        </td>
        <td>${p.games}</td>
        <td>${goalsHtml}</td>
        <td class="total-col">
          ${fmt(p.seconds)}
          <div class="time-bar"><div class="time-bar-fill" style="width:${pct}%"></div></div>
        </td>
      </tr>
    `;
  }).join('');

  showScreen('season-summary-screen');
}

export function showSummary() {
  const sorted   = [...state.players].sort((a, b) => b.totalPlayed - a.totalPlayed);
  const maxTime  = sorted.length ? sorted[0].totalPlayed : 1;
  const totalAll = state.players.reduce((s, p) => s + p.totalPlayed, 0);
  const avg      = state.players.length ? Math.round(totalAll / state.players.length) : 0;

  const tbody = document.getElementById('summary-body');
  tbody.innerHTML = sorted.map(p => {
    const h1   = Number.isFinite(p.h1Snapshot) ? p.h1Snapshot : p.totalPlayed;
    const h2   = Number.isFinite(p.h1Snapshot) ? Math.max(0, p.totalPlayed - p.h1Snapshot) : 0;
    const pct  = maxTime > 0 ? Math.round((p.totalPlayed / maxTime) * 100) : 0;
    const posChips = Object.entries(p.positionTime || {})
      .filter(([, t]) => t > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([pos, t]) => `<span class="summary-pos-chip">${pos} <strong>${fmt(t)}</strong></span>`)
      .join('');
    const posHtml = posChips
      ? `<div class="summary-pos-breakdown">${posChips}</div>`
      : '';
    const goalieIcon = (p.positionTime || {}).GK > 0
      ? '<span class="summary-goalie-icon" title="Goalkeeper" aria-label="Goalkeeper">&#129508;</span>'
      : '';
    return `
      <tr>
        <td>
          <div class="summary-player-cell">
            <div class="summary-player-avatar">${avatarHtml(p.id, p.name, 30)}</div>
            <div class="summary-player-info">
              <div class="summary-player-name">${escHtml(p.name)}${goalieIcon}</div>
              ${posHtml}
            </div>
          </div>
        </td>
        <td>${fmt(h1)}</td>
        <td>${fmt(h2)}</td>
        <td class="total-col">
          ${fmt(p.totalPlayed)}
          <div class="time-bar"><div class="time-bar-fill" style="width:${pct}%"></div></div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('summary-team-name').textContent = state.teamName;
  document.getElementById('summary-vs-line').textContent =
    state.opponentName ? `vs ${state.opponentName}  \u2022  ${state.scoreUs} \u2013 ${state.scoreThem}` : `Score: ${state.scoreUs} \u2013 ${state.scoreThem}`;
  document.getElementById('summary-meta').textContent =
    `${state.players.length} players \u00B7 Avg: ${fmt(avg)} \u00B7 ${state.currentHalf === 2 ? 'Full game' : '1st half only'}`;

  document.getElementById('summary-goals').innerHTML =
    renderGoalsHtml(state.goals);

  document.getElementById('summary-export-btn').style.display = '';
  showScreen('summary-screen');
}

export function toggleOverflowMenu() {
  const menu = document.getElementById('overflow-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

export function closeOverflowMenu() {
  document.getElementById('overflow-menu').style.display = 'none';
}

export function openAboutModal() {
  document.getElementById('about-version').textContent = `v${APP_VERSION}`;
  openModal('about-modal');
}

export function goToSetup() {
  clearActiveGame();
  state.gameDate       = '';
  state.opponentName   = '';
  state.gamePlan       = null;
  state.isPrePlanning  = false;
  state.prePlanHalf    = null;
  saveGamePlan();
  document.getElementById('opponent-input').value = '';
  showScreen('setup-screen');
  renderGameDayCheckboxes();
  updatePlanAheadStatus();
}

export function goToTeamSetup() {
  showScreen('team-setup-screen');
  renderTeamSetupRoster();
}

export function goBackFromTeamSetup() {
  state.teamName = document.getElementById('team-name-input').value.trim() || 'My Team';
  document.getElementById('app-title-name').textContent = state.teamName;
  saveSettings();
  showScreen('setup-screen');
  renderGameDayCheckboxes();
}

export function confirmClearData() {
  openModal('clear-data-modal');
}

export function confirmStartNewSeason() {
  openModal('new-season-modal');
}

export function backupBeforeNewSeason() {
  exportProfile();
}

export function closeNewSeasonModal() {
  closeModal('new-season-modal');
}

export function closeClearDataModal() {
  closeModal('clear-data-modal');
}

export function executeStartNewSeason() {
  state.roster       = [];
  state.players      = [];
  state.nextId       = 1;
  state.playerPhotos = {};
  state.gameHistory  = [];
  state.savedChecked = new Set();
  state.gameDate     = '';
  state.opponentName = '';
  state.goals        = [];
  state.scoreUs      = 0;
  state.scoreThem    = 0;
  state.gameFinalized = false;
  state.gamePlan      = null;

  saveRoster();
  saveGameHistory();
  saveSettings();
  saveGamePlan();
  clearActiveGame();
  localStorage.removeItem('playerPhotos');

  document.getElementById('opponent-input').value = '';
  closeNewSeasonModal();
  renderTeamSetupRoster();
  renderGameDayCheckboxes();
  showScreen('team-setup-screen');
}

export function executeClearData() {
  localStorage.clear();
  state.roster       = [];
  state.nextId       = 1;
  state.playerPhotos = {};
  state.teamName     = 'My Team';
  state.halfMinutes  = 25;
  state.gameHistory  = [];
  document.getElementById('team-name-input').value = '';
  document.getElementById('app-title-name').textContent = 'My Team';
  document.getElementById('half-minutes-display').textContent = '25 min';
  state.savedChecked = new Set();
  state.gameDate     = '';
  state.opponentName = '';
  document.getElementById('opponent-input').value = '';
  closeClearDataModal();
  renderTeamSetupRoster();
  showScreen('setup-screen');
  renderGameDayCheckboxes();
}
