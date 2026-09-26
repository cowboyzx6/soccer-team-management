import { state } from './state.js';
import { closeModal, escHtml, openModal } from './utils.js';
import { saveGamePlan, saveRoster, saveSettings } from './persistence.js';

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
let cropTargetId = null;
let cropImage = null;
let cropScale = 1;
let cropZoom = 1;
let cropOffset = { x: 0, y: 0 };
let cropDrag = null;

export function triggerPhotoUpload(id) {
  photoUploadTargetId = id;
  document.getElementById('photo-file-input').click();
}

function storePhotoDataUrl(id, dataUrl) {
  state.playerPhotos[id] = dataUrl;
  try {
    localStorage.setItem('playerPhotos', JSON.stringify(state.playerPhotos));
  } catch (e) {
    delete state.playerPhotos[id];
    alert('Storage full \u2014 photo could not be saved. Try removing old game history.');
  }
  document.dispatchEvent(new CustomEvent('photo:updated'));
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
    storePhotoDataUrl(id, canvas.toDataURL('image/jpeg', 0.75));
  };
  img.src = dataURL;
}

function cropEls() {
  return {
    modal: document.getElementById('photo-crop-modal'),
    title: document.getElementById('photo-crop-title'),
    stage: document.getElementById('photo-crop-stage'),
    image: document.getElementById('photo-crop-image'),
    zoom: document.getElementById('photo-crop-zoom'),
  };
}

function clampCropOffset() {
  const { stage } = cropEls();
  if (!cropImage || !stage) return;
  const stageSize = stage.clientWidth;
  const width = cropImage.naturalWidth * cropScale * cropZoom;
  const height = cropImage.naturalHeight * cropScale * cropZoom;
  const minX = stageSize - width;
  const minY = stageSize - height;
  cropOffset.x = Math.min(0, Math.max(minX, cropOffset.x));
  cropOffset.y = Math.min(0, Math.max(minY, cropOffset.y));
}

function renderCropPreview() {
  const { image } = cropEls();
  if (!cropImage || !image) return;
  clampCropOffset();
  const width = cropImage.naturalWidth * cropScale * cropZoom;
  const height = cropImage.naturalHeight * cropScale * cropZoom;
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.style.left = `${cropOffset.x}px`;
  image.style.top = `${cropOffset.y}px`;
}

function resetCropFrame() {
  const { stage } = cropEls();
  if (!cropImage || !stage) return;
  const stageSize = stage.clientWidth;
  cropScale = Math.max(stageSize / cropImage.naturalWidth, stageSize / cropImage.naturalHeight);
  cropZoom = 1;
  cropOffset = {
    x: (stageSize - cropImage.naturalWidth * cropScale) / 2,
    y: (stageSize - cropImage.naturalHeight * cropScale) / 2,
  };
  const zoom = document.getElementById('photo-crop-zoom');
  if (zoom) zoom.value = '1';
  renderCropPreview();
}

function openPhotoCropper(id, dataURL) {
  const player = state.roster.find(p => p.id === id);
  const { image, title } = cropEls();
  cropTargetId = id;
  cropImage = new Image();
  cropImage.onload = () => {
    image.src = dataURL;
    if (title) title.textContent = player ? `Crop ${player.name}'s Photo` : 'Crop Player Photo';
    openModal('photo-crop-modal');
    requestAnimationFrame(resetCropFrame);
  };
  cropImage.onerror = () => {
    cropTargetId = null;
    alert('That image could not be opened. Try a different photo.');
  };
  cropImage.src = dataURL;
}

function closePhotoCropper() {
  closeModal('photo-crop-modal');
  const { image } = cropEls();
  if (image) {
    image.removeAttribute('src');
    image.removeAttribute('style');
  }
  cropTargetId = null;
  cropImage = null;
  cropDrag = null;
}

function saveCroppedPhoto() {
  const { stage } = cropEls();
  if (cropTargetId === null || !cropImage || !stage) return;
  clampCropOffset();
  const SIZE = 120;
  const stageSize = stage.clientWidth;
  const displayScale = cropScale * cropZoom;
  const sx = Math.max(0, -cropOffset.x / displayScale);
  const sy = Math.max(0, -cropOffset.y / displayScale);
  const sourceSize = stageSize / displayScale;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cropImage, sx, sy, sourceSize, sourceSize, 0, 0, SIZE, SIZE);
  storePhotoDataUrl(cropTargetId, canvas.toDataURL('image/jpeg', 0.78));
  closePhotoCropper();
}

function handleCropPointerDown(e) {
  if (!cropImage) return;
  cropDrag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    offsetX: cropOffset.x,
    offsetY: cropOffset.y,
  };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function handleCropPointerMove(e) {
  if (!cropDrag || cropDrag.pointerId !== e.pointerId) return;
  e.preventDefault();
  cropOffset = {
    x: cropDrag.offsetX + e.clientX - cropDrag.startX,
    y: cropDrag.offsetY + e.clientY - cropDrag.startY,
  };
  renderCropPreview();
}

function handleCropPointerUp(e) {
  if (cropDrag && cropDrag.pointerId === e.pointerId) cropDrag = null;
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

export function renderGameDayCheckboxes(restoreChecked = !!state.gamePlan) {
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

  const plannedPlayerIds = state.gamePlan
    ? [
        ...(state.gamePlan.playerIds || []),
        ...Object.values(state.gamePlan.half1 || {}),
        ...Object.values(state.gamePlan.half2 || {}),
      ]
    : [];
  const savedChecked = new Set([...state.savedChecked, ...plannedPlayerIds]);
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
  syncPlannedAttendance();
  updateCheckedCount();
}

export function renderRoster(restoreChecked = !!state.gamePlan) {
  renderTeamSetupRoster();
  renderGameDayCheckboxes(restoreChecked);
}

function syncPlannedAttendance() {
  if (!state.gamePlan) return;
  const playerIds = checkedPlayers().map(p => p.id);
  state.savedChecked = new Set(playerIds);
  state.gamePlan.playerIds = playerIds;
  saveGamePlan();
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
  syncPlannedAttendance();
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
    reader.onload = ev => openPhotoCropper(photoUploadTargetId, ev.target.result);
    reader.readAsDataURL(file);
    this.value = '';
  });

  const cropStage = document.getElementById('photo-crop-stage');
  const cropZoomInput = document.getElementById('photo-crop-zoom');
  cropStage.addEventListener('pointerdown', handleCropPointerDown);
  cropStage.addEventListener('pointermove', handleCropPointerMove, { passive: false });
  cropStage.addEventListener('pointerup', handleCropPointerUp);
  cropStage.addEventListener('pointercancel', handleCropPointerUp);
  cropZoomInput.addEventListener('input', e => {
    if (!cropImage) return;
    const stageSize = cropStage.clientWidth;
    const prevScale = cropScale * cropZoom;
    const nextZoom = parseFloat(e.target.value) || 1;
    const centerNaturalX = (stageSize / 2 - cropOffset.x) / prevScale;
    const centerNaturalY = (stageSize / 2 - cropOffset.y) / prevScale;
    cropZoom = nextZoom;
    const nextScale = cropScale * cropZoom;
    cropOffset = {
      x: stageSize / 2 - centerNaturalX * nextScale,
      y: stageSize / 2 - centerNaturalY * nextScale,
    };
    renderCropPreview();
  });
  document.getElementById('photo-crop-save-btn').addEventListener('click', saveCroppedPhoto);
  document.getElementById('photo-crop-cancel-btn').addEventListener('click', closePhotoCropper);
  window.addEventListener('resize', () => {
    if (cropImage) resetCropFrame();
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
