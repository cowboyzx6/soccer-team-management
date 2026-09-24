import { state } from './state.js';
import { closeModal, escHtml, openModal } from './utils.js';
import { saveRoster, saveSettings } from './persistence.js';

const AVATAR_COLORS = ['#1565c0','#6a1b9a','#2e7d32','#c62828',
                       '#00838f','#ad1457','#4527a0','#e65100'];

export function changeHalfMinutes(delta) {
  state.halfMinutes = Math.max(1, state.halfMinutes + delta);
  document.getElementById('half-minutes-display').textContent = `${state.halfMinutes} min`;
  saveSettings();
}

export function changeMinPlayMinutes(delta) {
  const maxMinPlay = state.halfMinutes * 2;
  let val = state.minPlayMinutes + delta;
  if (val > maxMinPlay) val = 0; // wrap back to "off" after max
  if (val < 0) val = 0;
  state.minPlayMinutes = val;
  const label = state.minPlayMinutes === 0 ? 'off' : `${state.minPlayMinutes} min`;
  document.getElementById('min-play-display').textContent = label;
  saveSettings();
}

export function loadPhotos() {
  const saved = localStorage.getItem('playerPhotos');
  if (saved) {
    try { state.playerPhotos = JSON.parse(saved); }
    catch { localStorage.removeItem('playerPhotos'); }
  }
}

function avatarColor(id) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export function avatarHtml(id, name, size = 38) {
  const s = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:${Math.round(size*0.42)}px;`;
  if (state.playerPhotos[id]) {
    return `<div style="${s}"><img src="${state.playerPhotos[id]}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`;
  }
  return `<div style="${s}background:${avatarColor(id)};">${escHtml((name || '?')[0].toUpperCase())}</div>`;
}

export function avatarParts(id, name) {
  if (state.playerPhotos[id]) {
    return ['', `<img src="${state.playerPhotos[id]}" style="width:100%;height:100%;object-fit:cover;display:block;">`];
  }
  return [`background:${avatarColor(id)};`, escHtml((name || '?')[0].toUpperCase())];
}

let photoUploadTargetId = null;

export function triggerPhotoUpload(id) {
  photoUploadTargetId = id;
  document.getElementById('photo-file-input').click();
}

export function resizeAndStorePhoto(id, dataURL) {
  const img = new Image();
  img.onload = () => {
    const SIZE = 120;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const min = Math.min(img.width, img.height);
    const sx = (img.width  - min) / 2;
    const sy = (img.height - min) / 2;
    ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
    state.playerPhotos[id] = canvas.toDataURL('image/jpeg', 0.75);
    try {
      localStorage.setItem('playerPhotos', JSON.stringify(state.playerPhotos));
    } catch (e) {
      delete state.playerPhotos[id];
      alert('Storage full \u2014 photo could not be saved. Try removing old game history.');
    }
    document.dispatchEvent(new CustomEvent('photo:updated'));
  };
  img.src = dataURL;
}

export function renderTeamSetupRoster() {
  const list = document.getElementById('roster-list');
  if (!state.roster.length) {
    list.innerHTML = '<div class="empty-roster">No players yet &mdash; add some below</div>';
    return;
  }
  const sorted = [...state.roster].sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted.map(p => `
    <div class="roster-item">
      <div class="roster-avatar-btn" data-photo-id="${p.id}">
        ${avatarHtml(p.id, p.name, 36)}
        <div class="avatar-overlay">Photo</div>
      </div>
      <span class="player-name-text">${escHtml(p.name)}</span>
      <button class="btn-rename" data-rename-id="${p.id}">&#9998;</button>
      <button class="btn-remove" data-remove-id="${p.id}">&#10005;</button>
    </div>
  `).join('');
}

export function renderGameDayCheckboxes(restoreChecked = false) {
  const empty   = document.getElementById('gameday-empty');
  const content = document.getElementById('gameday-content');

  if (!state.roster.length) {
    empty.style.display   = 'block';
    content.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  content.style.display = 'block';

  document.getElementById('game-number-label').textContent = `Game ${state.gameHistory.length + 1}`;
  if (!state.gameDate) state.gameDate = new Date().toISOString().slice(0, 10);
  document.getElementById('game-date-input').value = state.gameDate;
  const oppInput = document.getElementById('opponent-input');
  if (oppInput && !oppInput.value && state.opponentName) oppInput.value = state.opponentName;

  const savedChecked = state.savedChecked;
  const list   = document.getElementById('gameday-roster');
  const sorted = [...state.roster].sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted.map(p => {
    const sel = restoreChecked && savedChecked.has(p.id);
    return `<div class="player-tile${sel ? ' selected' : ''}" id="tile-${p.id}" data-player-id="${p.id}">
      <div class="tile-check">&#10003;</div>
      ${avatarHtml(p.id, p.name, 48)}
      <span class="player-name-text">${escHtml(p.name)}</span>
    </div>`;
  }).join('');
  updateCheckedCount();
}

export function togglePlayerTile(id) {
  const tile = document.getElementById(`tile-${id}`);
  if (!tile) return;
  tile.classList.toggle('selected');
  updateCheckedCount();
}

export function renderRoster(restoreChecked = false) {
  renderTeamSetupRoster();
  renderGameDayCheckboxes(restoreChecked);
}

export function addRosterPlayer() {
  const input = document.getElementById('new-player-input');
  const raw  = input.value.trim();
  if (!raw) return;
  const name = raw.replace(/\b\w/g, c => c.toUpperCase());
  state.roster.push({ id: state.nextId++, name });
  saveRoster();
  renderRoster();
  input.value = '';
  document.getElementById('add-player-btn').disabled = true;
  input.focus();
}

let renameTargetId = null;

export function openRenameModal(id) {
  const player = state.roster.find(p => p.id === id);
  if (!player) return;
  renameTargetId = id;
  const input = document.getElementById('rename-input');
  input.value = player.name;
  openModal('rename-modal');
  setTimeout(() => input.focus(), 50);
}

export function confirmRename() {
  const raw = document.getElementById('rename-input').value.trim();
  if (!raw || renameTargetId === null) return;
  const player = state.roster.find(p => p.id === renameTargetId);
  if (player) {
    player.name = raw.replace(/\b\w/g, c => c.toUpperCase());
    saveRoster();
    renderRoster();
  }
  closeRenameModal();
}

export function closeRenameModal() {
  closeModal('rename-modal');
  renameTargetId = null;
}

let removeRosterTargetId = null;

export function removeRosterPlayer(id) {
  const player = state.roster.find(p => p.id === id);
  if (!player) return;
  removeRosterTargetId = id;
  document.getElementById('remove-roster-body').textContent =
    `Remove ${player.name} from the roster permanently?`;
  openModal('remove-roster-modal');
}

export function confirmRemoveRosterPlayer() {
  state.roster = state.roster.filter(p => p.id !== removeRosterTargetId);
  removeRosterTargetId = null;
  saveRoster();
  renderRoster();
  closeRemoveRosterModal();
}

export function closeRemoveRosterModal() {
  closeModal('remove-roster-modal');
  removeRosterTargetId = null;
}

function updateCheckedCount() {
  const n     = checkedPlayers().length;
  const total = state.roster.length;
  document.getElementById('selected-count').textContent = n;
  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = total;
  const fill = document.getElementById('attendance-bar-fill');
  if (fill) fill.style.width = total ? `${(n / total) * 100}%` : '0%';
  const btn = document.getElementById('check-all-btn');
  if (btn) btn.textContent = (n === total && total > 0) ? 'Deselect All' : 'Select All';
  updateStartBtn();
}

export function checkAllPlayers() {
  const selectAll = checkedPlayers().length < state.roster.length;
  document.querySelectorAll('#gameday-roster .player-tile').forEach(tile => {
    tile.classList.toggle('selected', selectAll);
  });
  updateCheckedCount();
}

export function updateStartBtn() {
  const n = checkedPlayers().length;
  const hasOpponent = document.getElementById('opponent-input').value.trim().length > 0;
  document.getElementById('start-btn').disabled = n < 1 || !hasOpponent;
  const planBtn = document.getElementById('plan-ahead-btn');
  if (planBtn) planBtn.disabled = n < 1;
  updatePlanAheadStatus();
}

export function updatePlanAheadStatus() {
  const planBtn = document.getElementById('plan-ahead-btn');
  const status = document.getElementById('plan-ahead-status');
  const statusText = document.getElementById('plan-ahead-status-text');
  if (!planBtn || !status) return;

  const hasFull = !!(state.gamePlan && state.gamePlan.half1 && state.gamePlan.half2);
  const hasPartial = !!(state.gamePlan && (state.gamePlan.half1 || state.gamePlan.half2) && !hasFull);

  if (hasFull) {
    planBtn.textContent = '📋 Edit Planned Lineups';
    if (statusText) statusText.textContent = '✅ Lineups planned for both halves';
    status.style.display = 'flex';
  } else if (hasPartial) {
    planBtn.textContent = '📋 Finish Planning Lineups';
    if (statusText) statusText.textContent = '⚠️ Half 1 saved — Half 2 still needs a plan';
    status.style.display = 'flex';
  } else {
    planBtn.textContent = '📋 Plan Both Halves in Advance';
    status.style.display = 'none';
  }
}

export function checkedPlayers() {
  return state.roster.filter(p => {
    const tile = document.getElementById(`tile-${p.id}`);
    return tile && tile.classList.contains('selected');
  });
}

export function initEventListeners() {
  document.getElementById('photo-file-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file || photoUploadTargetId === null) return;
    const reader = new FileReader();
    reader.onload = ev => resizeAndStorePhoto(photoUploadTargetId, ev.target.result);
    reader.readAsDataURL(file);
    this.value = '';
  });

  document.getElementById('rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') closeRenameModal();
  });

  document.getElementById('new-player-input').addEventListener('input', e => {
    document.getElementById('add-player-btn').disabled = e.target.value.trim().length < 2;
  });

  document.getElementById('new-player-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addRosterPlayer();
  });

  document.getElementById('roster-list').addEventListener('click', e => {
    const photo = e.target.closest('[data-photo-id]');
    if (photo) {
      triggerPhotoUpload(parseInt(photo.dataset.photoId, 10));
      return;
    }

    const rename = e.target.closest('[data-rename-id]');
    if (rename) {
      openRenameModal(parseInt(rename.dataset.renameId, 10));
      return;
    }

    const remove = e.target.closest('[data-remove-id]');
    if (remove) removeRosterPlayer(parseInt(remove.dataset.removeId, 10));
  });

  document.getElementById('gameday-roster').addEventListener('click', e => {
    const tile = e.target.closest('[data-player-id]');
    if (tile) togglePlayerTile(parseInt(tile.dataset.playerId, 10));
  });
}
