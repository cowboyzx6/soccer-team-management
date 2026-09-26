// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__STM_DISABLE_SW__ = true;
  });

  page.on('pageerror', error => {
    throw error;
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('team setup opens and roster can be added', async ({ page }) => {
  await page.getByRole('button', { name: /Set Up My Team/i }).click();

  await expect(page.locator('#team-setup-screen')).toHaveClass(/active/);

  await page.locator('#team-name-input').fill('Oyster Blueberries');
  await page.locator('#new-player-input').fill('Avery');
  await page.locator('#add-player-btn').click();

  await expect(page.locator('#roster-list')).toContainText('Avery');
  await expect(page.locator('#app-title-name')).toHaveText('Oyster Blueberries');
});

test('attendance can reach lineup screen', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });

  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#start-btn').click();

  await expect(page.locator('#gk-picker-modal')).not.toHaveClass(/hidden/);
  await page.locator('#gk-picker-skip-btn').click();

  await expect(page.locator('#lineup-screen')).toHaveClass(/active/);
  await expect(page.locator('#lineup-header-title')).toContainText('Oyster Blueberries');
});

test('lineup drag uses an expanded drop zone around position slots', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' },
      { id: 2, name: 'Blake' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });

  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await page.locator('#start-btn').click();
  await page.locator('#gk-picker-skip-btn').click();

  const player = page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]');
  const gkSlot = page.locator('#lineup-field-positions [data-position="GK"]');
  const playerBox = await player.boundingBox();
  const slotBox = await gkSlot.boundingBox();

  expect(playerBox).not.toBeNull();
  expect(slotBox).not.toBeNull();

  const startX = playerBox.x + playerBox.width / 2;
  const startY = playerBox.y + playerBox.height / 2;
  const slotCenterX = slotBox.x + slotBox.width / 2;
  const slotCenterY = slotBox.y + slotBox.height / 2;
  const nearSlotX = slotCenterX + 78;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(nearSlotX, slotCenterY, { steps: 8 });

  await expect(gkSlot).toHaveClass(/drag-over/);

  await page.mouse.up();
  await expect(gkSlot).toContainText('Avery');
});

test('restore backup normalizes profile data and clears stale photos', async ({ page }, testInfo) => {
  const profilePath = testInfo.outputPath('restore-profile.json');
  await fs.writeFile(profilePath, JSON.stringify({
    teamName: ' Restored Team ',
    halfMinutes: '30',
    roster: [
      { id: '1', name: ' Avery ' },
      { id: '1', name: 'Duplicate Avery' },
      { id: 'bad', name: 'Invalid' },
    ],
    games: [{
      date: '2026-05-09',
      opponent: ' Blue Team ',
      ourScore: '2',
      theirScore: '1',
      goals: [{ team: 'us', scorer: 'Avery', scorerId: '1', half: 'bad' }],
      playerStats: [{
        id: '1',
        name: 'Avery',
        secondsPlayed: '600',
        firstHalfSeconds: '300',
        secondHalfSeconds: '300',
        positionSeconds: { GK: '120', BAD: '999' },
      }],
    }],
  }), 'utf8');

  await page.evaluate(() => {
    localStorage.setItem('playerPhotos', JSON.stringify({ 1: 'data:image/png;base64,OLDPHOTO' }));
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [{ id: 99, name: 'Stale Player' }],
      opponentName: 'Stale Team',
    }));
  });

  await page.setInputFiles('#import-file-input', profilePath);

  await expect(page.locator('#app-title-name')).toHaveText('Restored Team');
  await expect(page.locator('#half-minutes-display')).toHaveText('30 min');
  await expect(page.locator('#roster-list')).toContainText('Avery');
  await expect(page.locator('#roster-list')).not.toContainText('Duplicate Avery');

  const stored = await page.evaluate(() => ({
    roster: JSON.parse(localStorage.getItem('soccerRoster') || '[]'),
    settings: JSON.parse(localStorage.getItem('soccerSettings') || '{}'),
    history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    photos: localStorage.getItem('playerPhotos'),
    activeGame: localStorage.getItem('soccerActiveGame'),
  }));

  expect(stored.roster).toEqual([{ id: 1, name: 'Avery' }]);
  expect(stored.settings).toEqual({ teamName: 'Restored Team', halfMinutes: 30, minPlayMinutes: 0 });
  expect(stored.history[0].playerStats[0].positionSeconds).toEqual({ GK: 120 });
  expect(stored.history[0].goals[0].scorerId).toBe(1);
  expect(stored.photos).toBeNull();
  expect(stored.activeGame).toBeNull();
});

test('backup restores a lineup plan only for the next unplayed game', async ({ page }, testInfo) => {
  const profilePath = testInfo.outputPath('restore-planned-game.json');
  await fs.writeFile(profilePath, JSON.stringify({
    teamName: 'Oyster Blueberries',
    halfMinutes: 25,
    roster: [
      { id: 1, name: 'Avery' },
      { id: 2, name: 'Blake' },
      { id: 3, name: 'Casey' },
    ],
    games: [{
      date: '2026-09-12',
      opponent: 'Green Team',
      ourScore: 1,
      theirScore: 0,
      goals: [],
      playerStats: [],
    }],
    gamePlan: {
      gameNumber: 2,
      date: '2026-09-26',
      opponent: 'Blue Team',
      playerIds: [3, 99],
      half1: { GK: 1, CF: 2, BAD: 1 },
      half2: { GK: 2, CF: 1, RF: 99 },
    },
  }), 'utf8');

  page.once('dialog', dialog => dialog.accept());
  await page.setInputFiles('#import-file-input', profilePath);
  await expect(page.locator('#game-number-label')).toHaveText('Game 2');

  const storedPlan = await page.evaluate(() => JSON.parse(localStorage.getItem('soccerGamePlan') || 'null'));
  expect(storedPlan).toEqual({
    gameNumber: 2,
    date: '2026-09-26',
    opponent: 'Blue Team',
    playerIds: [3, 1, 2],
    half1: { GK: 1, CF: 2 },
    half2: { GK: 2, CF: 1 },
  });
  await expect(page.locator('#plan-ahead-status-text')).toContainText('Lineups planned for both halves');
  await expect(page.locator('#opponent-input')).toHaveValue('Blue Team');
  await expect(page.locator('#game-date-input')).toHaveValue('2026-09-26');
  await expect(page.locator('#tile-1')).toHaveClass(/selected/);
  await expect(page.locator('#tile-2')).toHaveClass(/selected/);
  await expect(page.locator('#tile-3')).toHaveClass(/selected/);

  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  await page.locator('#team-setup-back-btn').click();
  await expect(page.locator('#tile-1')).toHaveClass(/selected/);
  await expect(page.locator('#tile-2')).toHaveClass(/selected/);
  await expect(page.locator('#tile-3')).toHaveClass(/selected/);
  await expect(page.locator('#plan-ahead-btn')).toBeEnabled();
});

test('restore can decline an upcoming game plan while keeping profile data', async ({ page }, testInfo) => {
  const profilePath = testInfo.outputPath('decline-planned-game.json');
  await fs.writeFile(profilePath, JSON.stringify({
    teamName: 'Oyster Blueberries',
    halfMinutes: 25,
    roster: [{ id: 1, name: 'Avery' }],
    games: [],
    gamePlan: {
      gameNumber: 1,
      date: '2026-09-26',
      opponent: 'Blue Team',
      playerIds: [1],
      half1: { GK: 1 },
      half2: { GK: 1 },
    },
  }), 'utf8');

  page.once('dialog', dialog => dialog.dismiss());
  await page.setInputFiles('#import-file-input', profilePath);
  await expect(page.locator('#app-title-name')).toHaveText('Oyster Blueberries');

  expect(await page.evaluate(() => localStorage.getItem('soccerGamePlan'))).toBeNull();
  await expect(page.locator('#opponent-input')).toHaveValue('');
  await expect(page.locator('#tile-1')).not.toHaveClass(/selected/);
});

test('restore does not activate a plan for an already completed game', async ({ page }, testInfo) => {
  const profilePath = testInfo.outputPath('restore-completed-plan.json');
  const game = {
    date: '2026-09-12',
    opponent: 'Green Team',
    ourScore: 1,
    theirScore: 0,
    goals: [],
    playerStats: [],
  };
  await fs.writeFile(profilePath, JSON.stringify({
    teamName: 'Oyster Blueberries',
    halfMinutes: 25,
    roster: [{ id: 1, name: 'Avery' }],
    games: [game, { ...game, date: '2026-09-19', opponent: 'Red Team' }],
    gamePlan: {
      gameNumber: 2,
      half1: { GK: 1 },
      half2: { GK: 1 },
    },
  }), 'utf8');

  await page.evaluate(() => {
    localStorage.setItem('soccerGamePlan', JSON.stringify({
      gameNumber: 99,
      half1: { GK: 1 },
    }));
  });
  await page.setInputFiles('#import-file-input', profilePath);
  await expect(page.locator('#game-number-label')).toHaveText('Game 3');

  expect(await page.evaluate(() => localStorage.getItem('soccerGamePlan'))).toBeNull();
  await expect(page.locator('#plan-ahead-status')).toBeHidden();
});

test('profile backup includes only a pending plan and archives plans with completed games', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const [{ state }, { buildGameRecord, buildProfile }] = await Promise.all([
      import('/js/state.js'),
      import('/js/persistence.js'),
    ]);

    state.roster = [{ id: 1, name: 'Avery' }];
    state.players = [];
    state.gameHistory = [{
      date: '2026-09-12', opponent: 'Green Team', ourScore: 1, theirScore: 0, goals: [], playerStats: [],
    }];
    state.gamePlan = { gameNumber: 2, half1: { GK: 1 }, half2: { GK: 1 } };

    const pendingProfile = buildProfile(false);
    const completedRecord = buildGameRecord();
    state.gameHistory.push(completedRecord);
    const completedProfile = buildProfile(false);

    return { pendingProfile, completedRecord, completedProfile };
  });

  expect(result.pendingProfile.gamePlan).toEqual({
    gameNumber: 2,
    playerIds: [1],
    half1: { GK: 1 },
    half2: { GK: 1 },
  });
  expect(result.completedRecord.plannedLineups).toEqual({
    half1: { GK: 1 },
    half2: { GK: 1 },
  });
  expect(result.completedProfile.gamePlan).toBeUndefined();
});

test('team backup with a pending plan uses a planned game filename', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.teamName = 'Oyster Blueberries';
    state.gameDate = '2026-09-26';
    state.roster = [{ id: 1, name: 'Avery' }];
    state.gameHistory = [{
      date: '2026-09-19', opponent: 'Silver Dolphins', ourScore: 1, theirScore: 0, goals: [], playerStats: [],
    }];
    state.gamePlan = { gameNumber: 2, half1: { GK: 1 }, half2: { GK: 1 } };
  });

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { exportProfile } = await import('/js/persistence.js');
    exportProfile();
  });
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^Oyster_Blueberries_2026-Fall_Game_2_Planned_2026-09-26_\d{4}\.json$/
  );
});

test('one-player planning backup includes attendance opponent and date', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
    localStorage.setItem('soccerGameHistory', JSON.stringify([{
      date: '2026-09-19', opponent: 'Silver Dolphins', ourScore: 1, theirScore: 0, goals: [], playerStats: [],
    }]));
  });
  await page.reload();

  await page.locator('#game-date-input').fill('2026-09-26');
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#plan-ahead-btn').click();

  for (let half = 1; half <= 2; half++) {
    await page.locator('#lineup-field-positions [data-position="GK"]').click();
    await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
    await page.locator('#launch-btn').click();
  }

  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#backup-team-btn').click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const profile = JSON.parse(await fs.readFile(downloadedPath, 'utf8'));

  expect(profile.gamePlan).toEqual({
    gameNumber: 2,
    date: '2026-09-26',
    opponent: 'Blue Team',
    playerIds: [1],
    half1: { GK: 1 },
    half2: { GK: 1 },
  });
});

test('start new season clears roster history and photos but keeps settings', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 3, name: 'Avery' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({
      teamName: 'Oyster Blueberries',
      halfMinutes: 30,
      minPlayMinutes: 15,
    }));
    localStorage.setItem('soccerGameHistory', JSON.stringify([{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: 2,
      theirScore: 1,
      playerStats: [{ id: 3, name: 'Avery', secondsPlayed: 900 }],
    }]));
    localStorage.setItem('playerPhotos', JSON.stringify({ 3: 'data:image/png;base64,OLDPHOTO' }));
    localStorage.setItem('soccerGamePlan', JSON.stringify({
      gameNumber: 2,
      half1: { GK: 3 },
      half2: { GK: 3 },
    }));
  });

  await page.reload();
  await expect(page.locator('#setup-screen')).toHaveClass(/active/);
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  await page.evaluate(() => {
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [{ id: 3, name: 'Avery' }],
      opponentName: 'Paused Game',
    }));
  });
  await page.locator('#new-season-btn').click();
  await expect(page.locator('#new-season-modal')).not.toHaveClass(/hidden/);
  await page.getByRole('button', { name: /Start Fresh/i }).click();

  await expect(page.locator('#team-setup-screen')).toHaveClass(/active/);
  await expect(page.locator('#roster-list')).toContainText('No players yet');
  await expect(page.locator('#team-name-input')).toHaveValue('Oyster Blueberries');

  const stored = await page.evaluate(() => ({
    roster: JSON.parse(localStorage.getItem('soccerRoster') || '[]'),
    settings: JSON.parse(localStorage.getItem('soccerSettings') || '{}'),
    history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    photos: localStorage.getItem('playerPhotos'),
    activeGame: localStorage.getItem('soccerActiveGame'),
    gamePlan: localStorage.getItem('soccerGamePlan'),
  }));

  expect(stored.roster).toEqual([]);
  expect(stored.settings).toEqual({
    teamName: 'Oyster Blueberries',
    halfMinutes: 30,
    minPlayMinutes: 15,
  });
  expect(stored.history).toEqual([]);
  expect(stored.photos).toBeNull();
  expect(stored.activeGame).toBeNull();
  expect(stored.gamePlan).toBeNull();
});

test('league CSV import skips duplicate names within the file', async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath('league-roster.csv');
  await fs.writeFile(csvPath, [
    'player_first_name,player_last_name',
    'Avery,Smith',
    'Avery,Smith',
    'Blair,Jones',
  ].join('\n'), 'utf8');

  page.on('dialog', dialog => dialog.accept());
  await page.setInputFiles('#csv-file-input', csvPath);

  await expect.poll(async () => {
    const roster = await page.evaluate(() => JSON.parse(localStorage.getItem('soccerRoster') || '[]'));
    return roster.map(p => p.name);
  }).toEqual(['Avery S.', 'Blair J.']);
});

test('review game import validates and renders normalized game data', async ({ page }, testInfo) => {
  const reviewPath = testInfo.outputPath('review-game.json');
  await fs.writeFile(reviewPath, JSON.stringify({
    teamName: 'Review Team',
    games: [{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: '2',
      theirScore: '1',
      goals: [
        { team: 'us', scorer: 'Avery', scorerId: '1', half: 1 },
        { team: 'us', scorer: 'Blair', scorerId: '2', half: 1 },
        { team: 'us', scorer: 'Blair', scorerId: '2', half: 2 },
        { team: 'them', scorer: null, half: 2 },
      ],
      playerStats: [{
        id: '1',
        name: 'Avery',
        secondsPlayed: '600',
        firstHalfSeconds: '300',
        secondHalfSeconds: '300',
        positionSeconds: { GK: '120' },
      }],
    }],
  }), 'utf8');

  await page.setInputFiles('#review-file-input', reviewPath);

  await expect(page.locator('#summary-screen')).toHaveClass(/active/);
  await expect(page.locator('#summary-team-name')).toHaveText('Review Team');
  await expect(page.locator('#summary-vs-line')).toContainText('vs Blue Team');
  await expect(page.locator('#summary-vs-line')).toContainText('2');
  await expect(page.locator('#summary-vs-line')).toContainText('1');
  await expect(page.locator('#summary-body')).toContainText('Avery');
  await expect(page.locator('#summary-body')).toContainText('GK');
  await expect(page.locator('#summary-goals')).toContainText('Avery');
  await expect(page.locator('#summary-goals')).not.toContainText('Blue Team');
  await expect(page.locator('.summary-goal-item').first()).toContainText('Blair');
  await expect(page.locator('#summary-export-btn')).toBeHidden();
});

test('season review includes roster players with no recorded appearances', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' },
      { id: 2, name: 'Blair' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
    localStorage.setItem('soccerGameHistory', JSON.stringify([{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: 1,
      theirScore: 0,
      goals: [{ team: 'us', scorer: 'Avery', scorerId: 1, half: 1 }],
      playerStats: [{
        id: 1,
        name: 'Avery',
        secondsPlayed: 600,
        positionSeconds: { CF: 600 },
      }],
    }]));
  });

  await page.reload();
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#review-season-btn').click();

  await expect(page.locator('#season-summary-screen')).toHaveClass(/active/);
  await expect(page.locator('#season-meta')).toHaveText('1 game · 2 players');
  await expect(page.locator('#season-body')).toContainText('Avery');
  await expect(page.locator('#season-body')).toContainText('Blair');
});

test('ended game does not save a stale active game on reload prompt', async ({ page }) => {
  const stored = await page.evaluate(async () => {
    const [{ state }, { endGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    state.teamName = 'Oyster Blueberries';
    state.opponentName = 'Blue Team';
    state.gameDate = '2026-05-09';
    state.scoreUs = 1;
    state.scoreThem = 0;
    state.goals = [{ team: 'us', scorer: 'Avery', scorerId: 1, half: 1 }];
    state.totalElapsed = 600;
    state.halfClock = 0;
    state.currentHalf = 2;
    state.players = [{
      id: 1,
      name: 'Avery',
      onField: false,
      totalPlayed: 600,
      subInAt: null,
      h1Snapshot: 300,
      position: null,
      positionTime: { CF: 600 },
      positionStart: null,
    }];

    endGame();
    window.dispatchEvent(new Event('beforeunload'));

    return {
      activeGame: localStorage.getItem('soccerActiveGame'),
      history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    };
  });

  expect(stored.activeGame).toBeNull();
  expect(stored.history).toHaveLength(1);
});

test('goal button disables when the game is paused', async ({ page }) => {
  const buttonState = await page.evaluate(async () => {
    const [{ state }, { resumeGame, pauseGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    state.halfClock = 1500;
    state.totalElapsed = 0;

    resumeGame();
    const runningDisabled = document.getElementById('goal-btn').disabled;
    pauseGame();
    const pausedDisabled = document.getElementById('goal-btn').disabled;

    return { runningDisabled, pausedDisabled };
  });

  expect(buttonState.runningDisabled).toBe(false);
  expect(buttonState.pausedDisabled).toBe(true);
});

test('halftime lineup can be edited before the 2nd half starts', async ({ page }) => {
  await page.evaluate(async () => {
    const [{ state }, { handleHalfEnd }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    const mk = (id, name, position) => ({
      id, name,
      onField: !!position,
      totalPlayed: 0,
      subInAt: position ? 0 : null,
      h1Snapshot: null,
      position: position || null,
      positionTime: {},
      positionStart: position ? 0 : null,
      benchSince: position ? null : 0,
    });

    state.teamName = 'Oyster Blueberries';
    state.halfMinutes = 25;
    state.totalElapsed = 1500;
    state.halfClock = 0;
    state.currentHalf = 1;
    state.players = [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(3, 'Casey')];
    state.goalie1Id = 1;
    state.goalie2Id = 2;
    state.gamePlan = { half2: { GK: 2, CF: 1 } };
    handleHalfEnd();
  });

  await expect(page.locator('#half-edit-lineup-btn')).toBeVisible();

  // Back from the editor returns to the halftime modal without starting the half.
  await page.locator('#half-edit-lineup-btn').click();
  await expect(page.locator('#lineup-screen')).toHaveClass(/active/);
  await page.locator('#lineup-back-btn').click();
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await expect(page.locator('#half-modal')).not.toHaveClass(/hidden/);

  // Edit: swap Casey in for Avery at CF, then start the half.
  await page.locator('#half-edit-lineup-btn').click();
  await expect(page.locator('#lineup-field-positions [data-position="GK"]')).toContainText('Blake');
  await expect(page.locator('#lineup-field-positions [data-position="CF"]')).toContainText('Avery');
  await page.locator('#lineup-field-positions [data-position="CF"]').click();
  await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="3"]').click();
  await page.locator('#lineup-field-positions [data-position="CF"]').click();
  await expect(page.locator('#launch-btn')).toHaveText(/Start 2nd Half/);
  await page.locator('#launch-btn').click();

  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      half: state.currentHalf,
      onField: state.players.filter(p => p.onField).map(p => [p.id, p.position]).sort(),
      goalie2Id: state.goalie2Id,
      activeGoalieId: state.activeGoalieId,
      isRunning: state.isRunning,
    };
  });
  expect(result).toEqual({
    half: 2,
    onField: [[2, 'GK'], [3, 'CF']],
    goalie2Id: 2,
    activeGoalieId: 2,
    isRunning: false,
  });
});

// ---------- Live-game substitution helpers ----------
async function startLiveGame(page) {
  await page.evaluate(async () => {
    const [{ state }, { showScreen }, { renderGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/utils.js'),
      import('/js/game.js'),
    ]);
    const mk = (id, name, position) => ({
      id, name,
      onField: !!position,
      totalPlayed: 0,
      subInAt: position ? 0 : null,
      h1Snapshot: null,
      position: position || null,
      positionTime: {},
      positionStart: position ? 0 : null,
      benchSince: position ? null : 0,
    });
    state.teamName = 'Oyster Blueberries';
    state.opponentName = 'Blue Team';
    state.halfMinutes = 25;
    state.totalElapsed = 0;
    state.halfClock = 1500;
    state.currentHalf = 1;
    state.isRunning = false;
    state.players = [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(3, 'Casey', 'LM'), mk(4, 'Devon'), mk(5, 'Emery')];
    state.goalie1Id = 1;
    state.goalie2Id = null;
    state.activeGoalieId = 1;
    state.subPlans = [];
    state.subPick = null;
    state.goals = [];
    state.scoreUs = 0;
    state.scoreThem = 0;
    showScreen('game-screen');
    renderGame();
  });
}

function readSubState(page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      plans: state.subPlans.map(pl => [pl.inId, pl.pos]).sort(),
      onField: state.players.filter(p => p.onField).map(p => [p.id, p.position]).sort(),
      activeGoalieId: state.activeGoalieId,
      subPick: state.subPick,
    };
  });
}

const fieldSlot = (page, pos) => page.locator(`#field-positions [data-position="${pos}"]`);
const benchCard = (page, id) => page.locator(`#bench-grid .player-card[data-player-id="${id}"]`);
const STARTING_FIELD = [[1, 'GK'], [2, 'CF'], [3, 'LM']];

test('sub pairs are the same in either tap order and wait for Sub Now', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await fieldSlot(page, 'LM').click();
  await benchCard(page, 5).click();

  const s = await readSubState(page);
  expect(s.plans).toEqual([[4, 'CF'], [5, 'LM']]);
  expect(s.onField).toEqual(STARTING_FIELD);
  expect(s.subPick).toBeNull();
  await expect(fieldSlot(page, 'CF')).toContainText('Devon');
});

test('empty-slot pairs wait for Sub Now and re-pairing replaces the old pair', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'RF').click();
  expect((await readSubState(page)).plans).toEqual([[4, 'RF']]);
  expect((await readSubState(page)).onField).toEqual(STARTING_FIELD);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  expect((await readSubState(page)).plans).toEqual([[4, 'CF']]);

  await benchCard(page, 5).click();
  await fieldSlot(page, 'CF').click();
  expect((await readSubState(page)).plans).toEqual([[5, 'CF']]);

  // Tapping a paired player picks it; it does not cancel the pair.
  await benchCard(page, 5).click();
  let s = await readSubState(page);
  expect(s.plans).toEqual([[5, 'CF']]);
  expect(s.subPick).toEqual({ zone: 'bench', id: 5 });
  await expect(benchCard(page, 5)).toHaveClass(/planning-active/);

  // Tapping it again clears the pick.
  await benchCard(page, 5).click();
  s = await readSubState(page);
  expect(s.subPick).toBeNull();
});

test('removing a paired player from the game drops their pair', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await benchCard(page, 4).locator('.btn-remove-player').click();
  await page.locator('#remove-player-confirm-btn').click();

  const s = await readSubState(page);
  expect(s.plans).toEqual([]);
  expect(s.subPick).toBeNull();
});

test('resuming an old saved game drops stale sub plans and picks', async ({ page }) => {
  await page.evaluate(() => {
    const mk = (id, name, position) => ({
      id, name, onField: !!position, totalPlayed: 0, subInAt: position ? 0 : null,
      h1Snapshot: null, position: position || null, positionTime: {},
      positionStart: position ? 0 : null, benchSince: position ? null : 0,
    });
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(4, 'Devon')],
      totalElapsed: 60, halfClock: 1440, currentHalf: 1,
      goalie1Id: 1, activeGoalieId: 1, opponentName: 'Blue Team', halfMinutes: 25,
      subPlans: [{ inId: 4, pos: 'CF' }, { inId: 2, pos: 'LM' }, { inId: 4, pos: 'XX' }],
      planningBenchId: 4, planningPosition: 'LM', selectedId: 2,
    }));
  });
  page.on('dialog', d => d.accept());
  await page.reload();
  await expect(page.locator('#game-screen')).toHaveClass(/active/);

  const s = await readSubState(page);
  expect(s.plans).toEqual([[4, 'CF']]);
  expect(s.subPick).toBeNull();
});

test('sub tray lists pairs, removes one with ✕, and Sub Now executes the rest', async ({ page }) => {
  await startLiveGame(page);
  await expect(page.locator('#sub-tray')).toBeHidden();

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await benchCard(page, 5).click();
  await fieldSlot(page, 'LM').click();

  const rows = page.locator('#sub-tray .sub-tray-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Devon');
  await expect(rows.first()).toContainText('CF');
  await expect(rows.first()).toContainText('Blake out');
  await expect(page.locator('#sub-now-btn')).toHaveText('Sub Now (2)');

  await page.locator('#sub-tray .sub-tray-remove[data-pos="LM"]').click();
  await expect(rows).toHaveCount(1);
  expect((await readSubState(page)).plans).toEqual([[4, 'CF']]);

  await page.locator('#sub-now-btn').click();
  const s = await readSubState(page);
  expect(s.onField).toEqual([[1, 'GK'], [3, 'LM'], [4, 'CF']]);
  expect(s.plans).toEqual([]);
  await expect(page.locator('#sub-tray')).toBeHidden();
});

test('empty-slot and GK pairs fill on Sub Now', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'RF').click();
  await fieldSlot(page, 'GK').click();
  await benchCard(page, 5).click();
  await expect(page.locator('#sub-tray .sub-tray-row').first()).toContainText('(empty)');

  await page.locator('#sub-now-btn').click();
  const s = await readSubState(page);
  expect(s.onField).toEqual([[2, 'CF'], [3, 'LM'], [4, 'RF'], [5, 'GK']]);
  expect(s.activeGoalieId).toBe(5);
  const goalie1Id = await page.evaluate(async () => (await import('/js/state.js')).state.goalie1Id);
  expect(goalie1Id).toBe(5);
});

test('sub tray rows are not rebuilt by clock re-renders', async ({ page }) => {
  await startLiveGame(page);
  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();

  const survived = await page.evaluate(async () => {
    const { renderGame } = await import('/js/game.js');
    const row = document.querySelector('#sub-tray .sub-tray-row');
    renderGame();
    renderGame();
    return row.isConnected;
  });
  expect(survived).toBe(true);
});

test('undo after Sub Now restores players, play time and the pairs', async ({ page }) => {
  await startLiveGame(page);
  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await page.locator('#sub-now-btn').click();
  await expect(page.locator('#undo-sub-btn')).toBeVisible();

  // Clock runs two minutes before the coach notices.
  await page.evaluate(async () => {
    const [{ state }, { renderGame }] = await Promise.all([import('/js/state.js'), import('/js/game.js')]);
    state.totalElapsed = 120;
    renderGame();
  });
  await page.locator('#undo-sub-btn').click();

  const s = await readSubState(page);
  expect(s.onField).toEqual(STARTING_FIELD);
  expect(s.plans).toEqual([[4, 'CF']]);
  await expect(page.locator('#undo-sub-btn')).toBeHidden();

  const times = await page.evaluate(async () => {
    const [{ state }, { getPlayedTime }] = await Promise.all([import('/js/state.js'), import('/js/game.js')]);
    const byId = id => state.players.find(p => p.id === id);
    return {
      blake: getPlayedTime(byId(2)),
      blakePosStart: byId(2).positionStart,
      devon: getPlayedTime(byId(4)),
      devonBenchSince: byId(4).benchSince,
      devonPosTime: byId(4).positionTime,
    };
  });
  expect(times).toEqual({ blake: 120, blakePosStart: 0, devon: 0, devonBenchSince: 0, devonPosTime: {} });
});

test('undo after sending the goalie to the bench restores the goalie', async ({ page }) => {
  await startLiveGame(page);
  await fieldSlot(page, 'GK').click();
  await fieldSlot(page, 'GK').locator('.pos-bench-btn').click();

  let s = await readSubState(page);
  expect(s.onField).toEqual([[2, 'CF'], [3, 'LM']]);
  expect(s.activeGoalieId).toBeNull();

  await page.locator('#undo-sub-btn').click();
  s = await readSubState(page);
  expect(s.onField).toEqual(STARTING_FIELD);
  expect(s.activeGoalieId).toBe(1);
});

test('undo is cleared at halftime', async ({ page }) => {
  await startLiveGame(page);
  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await page.locator('#sub-now-btn').click();
  await expect(page.locator('#undo-sub-btn')).toBeVisible();

  await page.evaluate(async () => {
    const { handleHalfEnd, undoLastSub } = await import('/js/game.js');
    handleHalfEnd();
    undoLastSub();
  });
  await expect(page.locator('#undo-sub-btn')).toBeHidden();
  expect((await readSubState(page)).onField).toEqual([[1, 'GK'], [3, 'LM'], [4, 'CF']]);
});

test('sub tray remove button stays inside the tray at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startLiveGame(page);
  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();

  const tray = await page.locator('#sub-tray').boundingBox();
  const remove = await page.locator('#sub-tray .sub-tray-remove').boundingBox();
  const out = await page.locator('#sub-tray .sub-tray-out').boundingBox();
  expect(remove.x + remove.width).toBeLessThanOrEqual(tray.x + tray.width + 1);
  expect(out.x + out.width).toBeLessThanOrEqual(tray.x + tray.width + 1);
  expect(remove.height).toBeGreaterThanOrEqual(44);

  // Names wrap rather than being cut off with an ellipsis.
  const clipped = await page.locator('#sub-tray .sub-tray-in, #sub-tray .sub-tray-out')
    .evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth).map(el => el.textContent));
  expect(clipped).toEqual([]);
});

test('undo drops a newer pair for the player who comes back on', async ({ page }) => {
  await startLiveGame(page);
  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await page.locator('#sub-now-btn').click();

  // Blake (subbed out) is now paired to LM, then the coach undoes the sub.
  await benchCard(page, 2).click();
  await fieldSlot(page, 'LM').click();
  expect((await readSubState(page)).plans).toEqual([[2, 'LM']]);
  await page.locator('#undo-sub-btn').click();

  const s = await readSubState(page);
  expect(s.onField).toEqual(STARTING_FIELD);
  expect(s.plans).toEqual([[4, 'CF']]);
});

test('a tap held across a clock tick still picks the player', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => (await import('/js/game.js')).resumeGame());

  const box = await benchCard(page, 4).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();

  expect((await readSubState(page)).subPick).toEqual({ zone: 'bench', id: 4 });
});
