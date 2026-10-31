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

// Walks the four planning quarters with one player in goal: Q1 and Q3 start from
// an empty field, Q2 and Q4 open pre-filled from the quarter before them.
async function planFourQuarters(page, playerId) {
  for (const quarter of [1, 2, 3, 4]) {
    if (quarter % 2) {
      await page.locator('#lineup-field-positions [data-position="GK"]').click();
      await page.locator(`#lineup-unassigned-list .lineup-player[data-player-id="${playerId}"]`).click();
    }
    await page.locator('#launch-btn').click();
  }
}

test('team setup opens and roster can be added', async ({ page }) => {
  await page.getByRole('button', { name: /Set Up My Team/i }).click();

  await expect(page.locator('#team-setup-screen')).toHaveClass(/active/);

  await page.locator('#team-name-input').fill('Oyster Blueberries');
  await page.locator('#new-player-input').fill('Avery');
  await page.locator('#add-player-btn').click();

  await expect(page.locator('#roster-list')).toContainText('Avery');
  await expect(page.locator('#app-title-name')).toHaveText('Oyster Blueberries');
});

test('player photo upload opens a crop preview before saving', async ({ page }, testInfo) => {
  const photoPath = testInfo.outputPath('player-photo.png');
  const replacementPhotoPath = testInfo.outputPath('replacement-player-photo.svg');
  await fs.writeFile(
    photoPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAIAAAAlV+npAAAAVUlEQVR4nO3QQQ0AIBDAsAP/nuGNAvZoFSzZnpld3gOgeSIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjYyIjs8YChZ0AATb3gZsAAAAASUVORK5CYII=',
      'base64'
    )
  );
  await fs.writeFile(
    replacementPhotoPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="100"><rect width="50" height="100" fill="#00a86b"/></svg>'
  );

  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
  });

  await page.reload();
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-photo-id="1"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(photoPath);

  await expect(page.locator('#photo-crop-modal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#photo-crop-image')).toHaveJSProperty('naturalWidth', 100);
  await page.locator('#photo-crop-zoom').fill('1.5');
  await page.locator('#photo-crop-save-btn').click();

  await expect(page.locator('#photo-crop-modal')).toHaveClass(/hidden/);
  const storedPhoto = await page.evaluate(() => {
    const photos = JSON.parse(localStorage.getItem('playerPhotos') || '{}');
    return photos[1] || '';
  });
  expect(storedPhoto).toMatch(/^data:image\/jpeg;base64,/);

  const replacementChooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-photo-id="1"]').click();
  const replacementChooser = await replacementChooserPromise;
  await replacementChooser.setFiles(replacementPhotoPath);

  await expect(page.locator('#photo-crop-modal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#photo-crop-image')).toHaveJSProperty('naturalWidth', 50);
  await page.locator('#photo-crop-save-btn').click();

  const replacementPhoto = await page.evaluate(() => {
    const photos = JSON.parse(localStorage.getItem('playerPhotos') || '{}');
    return photos[1] || '';
  });
  expect(replacementPhoto).toMatch(/^data:image\/jpeg;base64,/);
  expect(replacementPhoto).not.toBe(storedPhoto);
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

test('Set Starting Lineup only needs a player, not an opponent name', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
  });
  await page.reload();

  await expect(page.locator('#start-btn')).toBeDisabled();
  await page.locator('#tile-1').click();
  await expect(page.locator('#opponent-input')).toHaveValue('');
  await expect(page.locator('#start-btn')).toBeEnabled();
  await expect(page.locator('#plan-ahead-btn')).toBeEnabled();
});

test('Game Day Settings in the menu holds the half length and minimum play controls', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
  });
  await page.reload();

  await expect(page.locator('#half-plus-btn')).toBeHidden();
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#gameday-settings-btn').click();
  await expect(page.locator('#gameday-settings-modal')).not.toHaveClass(/hidden/);

  await page.locator('#half-plus-btn').click();
  await page.locator('#min-play-plus-btn').click();
  await expect(page.locator('#half-minutes-display')).toHaveText('26 min');
  await expect(page.locator('#min-play-display')).toHaveText('5 min');

  await page.locator('#gameday-settings-close-btn').click();
  await expect(page.locator('#gameday-settings-modal')).toHaveClass(/hidden/);
});

test('with both halves planned, Start Game skips the goalie picker and opens the planned lineup', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }]));
  });
  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await expect(page.locator('#start-btn')).toContainText('Set Starting Lineup');

  await page.evaluate(async () => {
    const [{ state }, { updatePlanAheadStatus }] = await Promise.all([
      import('/js/state.js'),
      import('/js/roster.js'),
    ]);
    state.gamePlan = {
      gameNumber: state.gameHistory.length + 1,
      playerIds: [1, 2],
      half1: { GK: 1, CF: 2 },
      half2: { GK: 2, CF: 1 },
    };
    updatePlanAheadStatus();
  });
  await expect(page.locator('#start-btn')).toContainText('Start Game');

  await page.locator('#start-btn').click();
  await expect(page.locator('#gk-picker-modal')).toHaveClass(/hidden/);
  await expect(page.locator('#lineup-screen')).toHaveClass(/active/);
  const goalies = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return [state.goalie1Id, state.goalie2Id];
  });
  expect(goalies).toEqual([1, 2]);
});

test('planning four quarters saves mid-half lineups as the planned sub round', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }]));
  });
  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await expect(page.locator('#plan-ahead-btn')).toContainText('Plan Lineup in Advance');
  await page.locator('#plan-ahead-btn').click();

  const slot = pos => page.locator(`#lineup-field-positions [data-position="${pos}"]`);
  const bench = id => page.locator(`#lineup-unassigned-list .lineup-player[data-player-id="${id}"]`);
  const next = page.locator('#launch-btn');

  // Q1: Avery in goal, Blake at CF.
  await expect(page.locator('#lineup-header-title')).toContainText('Q1');
  await slot('GK').click(); await bench(1).click();
  await slot('CF').click(); await bench(2).click();
  await next.click();

  // Q2 opens pre-filled from Q1; swap the two players.
  await expect(page.locator('#lineup-header-title')).toContainText('Q2');
  await expect(slot('GK')).toContainText('Avery');
  await expect(slot('CF')).toContainText('Blake');
  await slot('GK').click(); await slot('CF').click();
  await slot('GK').click(); await bench(2).click();
  await slot('CF').click(); await bench(1).click();
  await expect(slot('GK')).toContainText('Blake');
  await next.click();

  // Q3 starts empty; assign Blake in goal. Q4 pre-fills from Q3 and is left as is.
  await expect(page.locator('#lineup-header-title')).toContainText('Q3');
  await expect(slot('GK')).not.toContainText('Avery');
  await slot('GK').click(); await bench(2).click();
  await next.click();
  await expect(page.locator('#lineup-header-title')).toContainText('Q4');
  await expect(slot('GK')).toContainText('Blake');
  await next.click();

  await expect(page.locator('#setup-screen')).toHaveClass(/active/);
  const plan = await page.evaluate(async () => (await import('/js/state.js')).state.gamePlan);
  expect(plan.half1).toEqual({ GK: 1, CF: 2 });
  expect(plan.half2).toEqual({ GK: 2 });
  // A position swap between players already on the field is not a sub round.
  expect(plan.half1Subs).toBeUndefined();
  expect(plan.half2Subs).toBeUndefined();
});

test('going back through the planning quarters keeps each quarter and only changed players become subs', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }]));
  });
  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await page.locator('#plan-ahead-btn').click();

  const slot = pos => page.locator(`#lineup-field-positions [data-position="${pos}"]`);
  const bench = id => page.locator(`#lineup-unassigned-list .lineup-player[data-player-id="${id}"]`);

  // Q1: Avery in goal only. Q2: Blake replaces Avery in goal (a sub round).
  await slot('GK').click(); await bench(1).click();
  await page.locator('#launch-btn').click();
  await slot('GK').click();
  await slot('GK').click(); await bench(2).click();
  await page.locator('#launch-btn').click();
  await expect(page.locator('#lineup-header-title')).toContainText('Q3');

  await page.locator('#lineup-back-btn').click();
  await expect(page.locator('#lineup-header-title')).toContainText('Q2');
  await expect(slot('GK')).toContainText('Blake');
  await page.locator('#lineup-back-btn').click();
  await expect(page.locator('#lineup-header-title')).toContainText('Q1');
  await expect(slot('GK')).toContainText('Avery');

  const plan = await page.evaluate(async () => (await import('/js/state.js')).state.gamePlan);
  expect(plan.half1).toEqual({ GK: 1 });
  expect(plan.half1Subs).toEqual([[{ inId: 2, pos: 'GK' }]]);
});

test('planning shows projected minutes per player that update as quarters change', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });
  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await expect(page.locator('#lineup-projection')).toBeHidden();
  await page.locator('#plan-ahead-btn').click();

  const row = id => page.locator(`#lineup-projection-body tr[data-player-id="${id}"]`);
  const slot = pos => page.locator(`#lineup-field-positions [data-position="${pos}"]`);
  const bench = id => page.locator(`#lineup-unassigned-list .lineup-player[data-player-id="${id}"]`);

  // Everyone is listed from the start, with zero until placed.
  await expect(row(1)).toContainText('00:00');
  await expect(row(2)).toContainText('00:00');

  // Q1 alone counts for 12:30; Q2 has not been planned yet.
  await slot('GK').click(); await bench(1).click();
  await expect(row(1).locator('td').nth(1).locator('.gk-badge')).toHaveText('GK');
  await expect(row(1).locator('td').nth(2).locator('.gk-badge')).toHaveCount(0);
  await expect(row(2).locator('.gk-badge')).toHaveCount(0);
  await expect(row(1).locator('td').nth(1)).toContainText('12:30');
  await expect(row(2).locator('td').nth(1)).toHaveText('00:00');

  // Q2: Blake replaces Avery, so each plays half of Half 1.
  await page.locator('#launch-btn').click();
  await slot('GK').click();
  await slot('GK').click(); await bench(2).click();
  await expect(row(1).locator('td').nth(1)).toContainText('12:30');
  await expect(row(2).locator('td').nth(1)).toContainText('12:30');
  await expect(row(1).locator('td').nth(1).locator('.gk-badge')).toHaveCount(1);
  await expect(row(2).locator('td').nth(1).locator('.gk-badge')).toHaveCount(1);

  // Q3 must not silently count Q4 as well.
  await page.locator('#launch-btn').click();
  await slot('GK').click(); await bench(1).click();
  await expect(row(1).locator('td').nth(2)).toContainText('12:30');
  await expect(row(1).locator('td').nth(2).locator('.gk-badge')).toHaveText('GK');
  await slot('CF').click(); await bench(2).click();
  await expect(row(2).locator('td').nth(2)).toContainText('12:30');
  await expect(row(2).locator('td').nth(2).locator('.gk-badge')).toHaveCount(0);
  // Removing the current goalie removes only this half's badge.
  await slot('GK').click();
  await expect(row(1).locator('td').nth(2).locator('.gk-badge')).toHaveCount(0);
  await expect(row(1).locator('td').nth(1).locator('.gk-badge')).toHaveCount(1);
  await slot('GK').click(); await bench(1).click();
  await expect(row(1).locator('td').nth(3)).toContainText('25:00');

  // Save Q3 by going back. Backup/restore and reload preserve its partial status.
  await page.locator('#lineup-back-btn').click();
  await page.evaluate(async () => {
    const { buildProfile } = await import('/js/persistence.js');
    const { normalizeProfile } = await import('/js/profile-normalizer.js');
    const profile = normalizeProfile(buildProfile(false), { requireRoster: true });
    localStorage.setItem('soccerGamePlan', JSON.stringify(profile.gamePlan));
  });
  await page.reload();
  await page.locator('#plan-ahead-btn').click();
  await expect(row(1).locator('td').nth(2)).toContainText('12:30');
  await expect(row(1).locator('td').nth(2).locator('.gk-badge')).toHaveCount(1);
  await page.locator('#launch-btn').click();
  await page.locator('#launch-btn').click();
  await expect(row(1).locator('td').nth(2)).toContainText('12:30');

  // Reaching Q4 adds its prefilled lineup; going back retains that planned quarter.
  await page.locator('#launch-btn').click();
  await expect(row(1).locator('td').nth(2)).toContainText('25:00');
  await page.locator('#lineup-back-btn').click();
  await expect(row(1).locator('td').nth(2)).toContainText('25:00');
});

test('while planning, bench cards show which other quarters a player is already in', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }, { id: 3, name: 'Casey' }]));
  });
  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  for (const id of [1, 2, 3]) await page.locator(`#tile-${id}`).click();
  await page.locator('#plan-ahead-btn').click();

  const slot = pos => page.locator(`#lineup-field-positions [data-position="${pos}"]`);
  const card = id => page.locator(`#lineup-unassigned-list .lineup-player[data-player-id="${id}"]`);

  // Q1: Avery in goal, Blake at CF. Q2: Casey replaces Blake at CF.
  await slot('GK').click(); await card(1).click();
  await slot('CF').click(); await card(2).click();
  await page.locator('#launch-btn').click();
  await slot('CF').click();
  await slot('CF').click(); await card(3).click();
  await page.locator('#launch-btn').click();

  // Q3 starts empty: Avery played Q1 and Q2, Blake only Q1, Casey only Q2.
  await expect(page.locator('#lineup-header-title')).toContainText('Q3');
  await expect(card(1).locator('.lineup-half-badge')).toHaveText('Q1, Q2');
  await expect(card(2).locator('.lineup-half-badge')).toHaveText('Q1');
  await expect(card(3).locator('.lineup-half-badge')).toHaveText('Q2');
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
  await expect(page.locator('#plan-ahead-status-text')).toContainText('Lineup planned for all four quarters');
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

  await planFourQuarters(page, 1);

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
    plannedThroughQuarter: 4,
    date: '2026-09-26',
    opponent: 'Blue Team',
    playerIds: [1],
    half1: { GK: 1 },
    half2: { GK: 1 },
  });
});

test('restoring a profile with planned sub rounds keeps them attached to the right half', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });
  await page.reload();

  const profile = {
    appVersion: '1.0.0',
    teamName: 'Oyster Blueberries',
    halfMinutes: 25,
    roster: [{ id: 1, name: 'Avery', photo: null }, { id: 2, name: 'Blake', photo: null }],
    games: [],
    gamePlan: {
      gameNumber: 1,
      playerIds: [1, 2],
      half1: { GK: 1 },
      half1Subs: [[{ inId: 2, pos: 'GK' }]],
      half2: { GK: 2 },
    },
  };
  const profilePath = testInfo.outputPath('profile.json');
  await fs.writeFile(profilePath, JSON.stringify(profile));
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  page.once('dialog', dialog => dialog.accept());
  await page.setInputFiles('#import-file-input', profilePath);

  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.gamePlan?.half1Subs))
    .toEqual([[{ inId: 2, pos: 'GK' }]]);
  const gamePlan = await page.evaluate(async () => (await import('/js/state.js')).state.gamePlan);
  expect(gamePlan.half1Subs).toEqual([[{ inId: 2, pos: 'GK' }]]);
  expect(gamePlan.half2Subs).toBeUndefined();
});

test('team backup serializes planned sub rounds for the pending plan', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.roster = [{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }];
    state.teamName = 'Oyster Blueberries';
    state.gamePlan = {
      gameNumber: 1,
      playerIds: [1, 2],
      half1: { GK: 1 },
      half1Subs: [[{ inId: 2, pos: 'GK' }]],
      half2: { GK: 2 },
      half2Subs: [],
    };
  });
  const profile = await page.evaluate(async () => (await import('/js/persistence.js')).buildProfile(false));
  expect(profile.gamePlan.half1Subs).toEqual([[{ inId: 2, pos: 'GK' }]]);
  expect(profile.gamePlan.half2Subs).toBeUndefined();
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

test('Planned Subs button loads the next planned round into the sub tray, skipping no-shows', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }, { inId: 999, pos: 'LM' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();

  const plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);
  // Loading a round no longer consumes it by itself — only executing it does
  // (see "executing a loaded planned round advances the pointer" below) — so
  // the button stays visible until Sub Now actually runs.
  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.evaluate(async () => {
    const { executeAllPlans, renderGame } = await import('/js/game.js');
    executeAllPlans();
    renderGame();
  });
  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();
});

test('Planned Subs button stays hidden with no plan and resets pointer at halftime', async ({ page }) => {
  await startLiveGame(page);
  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = { gameNumber: 1, half1: { GK: 1 }, half1Subs: [[{ inId: 4, pos: 'CF' }]], half2: { GK: 1 }, half2Subs: [[{ inId: 5, pos: 'CF' }]] };
    const { renderGame, startSecondHalf, loadNextPlannedSubRound, executeAllPlans } = await import('/js/game.js');
    renderGame();
    loadNextPlannedSubRound();
    executeAllPlans(); // actually consume half 1's round, so plannedSubRoundIndex is nonzero before the reset
    startSecondHalf(false);
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();
  const plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 5, pos: 'CF' }]);
});

test('clearing a loaded planned round without executing it lets it be reloaded', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await page.locator('#load-planned-sub-btn').click();
  let plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);

  // Coach changes their mind and removes the pair instead of hitting Sub Now.
  await page.evaluate(async () => {
    const { removeSubPair, renderGame } = await import('/js/game.js');
    removeSubPair('CF');
    renderGame();
  });
  plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([]);

  // The round was never executed, so it must still be loadable.
  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();
  plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);
});

test('executing a loaded planned round advances the pointer so it cannot be reloaded', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await page.locator('#load-planned-sub-btn').click();
  await page.evaluate(async () => {
    const { executeAllPlans, renderGame } = await import('/js/game.js');
    executeAllPlans();
    renderGame();
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();
  const onField = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.players.find(p => p.position === 'CF')?.id;
  });
  expect(onField).toBe(4);
});

test('a pending planned round survives saveActiveGame/checkForActiveGame round-trip', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });
  await page.locator('#load-planned-sub-btn').click();

  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveActiveGame } = await import('/js/persistence.js');
    saveActiveGame();
    return state.pendingPlannedRoundIndex;
  });
  expect(before).toBe(0);

  // Simulate a fresh page load restoring the saved active game from scratch.
  page.once('dialog', dialog => dialog.accept());
  const restored = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.pendingPlannedRoundIndex = null;
    const { checkForActiveGame } = await import('/js/persistence.js');
    checkForActiveGame();
    return state.pendingPlannedRoundIndex;
  });
  expect(restored).toBe(0);
});

test('a planned round with no loadable pairs (all no-shows) does not wedge later rounds', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      // Round 0's only pair is a no-show (player 999 isn't in state.players).
      // Round 1 has a real pair for player 4.
      half1Subs: [[{ inId: 999, pos: 'CF' }], [{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  // Loading round 0 adds nothing to the tray — it must not consume the
  // button's only chance to reach round 1.
  await page.locator('#load-planned-sub-btn').click();
  let plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([]);

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();
  plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);
});

test('clearing a loaded round leaves no stale pending index for a later manual sub to consume', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  // Load round 0, then clear it instead of executing it.
  await page.locator('#load-planned-sub-btn').click();
  await page.evaluate(async () => {
    const { removeSubPair, renderGame } = await import('/js/game.js');
    removeSubPair('CF');
    renderGame();
  });

  // An unrelated manual sub, executed via Sub Now, must not silently consume
  // round 0's slot — round 0 never ran.
  await benchCard(page, 5).click();
  await fieldSlot(page, 'LM').click();
  await page.locator('#sub-now-btn').click();

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
});

test('undoing an executed planned round restores it to a reloadable state', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await page.locator('#load-planned-sub-btn').click();
  await page.evaluate(async () => {
    const { executeAllPlans, renderGame } = await import('/js/game.js');
    executeAllPlans();
    renderGame();
  });
  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();

  await page.locator('#undo-sub-btn').click();
  await page.evaluate(async () => {
    const { removeSubPair, renderGame } = await import('/js/game.js');
    removeSubPair('CF');
    renderGame();
  });

  // The round was undone and then cleared without ever truly executing —
  // it must still be reloadable, not permanently consumed.
  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
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

test('a player removed from the game can be re-added from late arrivals', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.roster = state.players.map(p => ({ id: p.id, name: p.name }));
  });

  await benchCard(page, 4).locator('.btn-remove-player').click();
  await page.locator('#remove-player-confirm-btn').click();
  await expect(benchCard(page, 4)).toHaveCount(0);

  await page.locator('#late-arrival-btn').click();
  const entry = page.locator('#late-player-list .lineup-player', { hasText: 'Devon' });
  await expect(entry).toContainText('removed');
  await entry.click();

  await expect(benchCard(page, 4)).toHaveCount(1);
  const devon = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const p = state.players.find(pl => pl.id === 4);
    return { count: state.players.filter(pl => pl.id === 4).length, leftEarly: p.leftEarly, onField: p.onField };
  });
  expect(devon).toEqual({ count: 1, leftEarly: false, onField: false });
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

test('game screen has no horizontal overflow at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startLiveGame(page);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  for (const id of ['clock', 'goal-btn', 'field-positions', 'bench-grid']) {
    const box = await page.locator(`#${id}`).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1);
  }

  const goalBtnBox = await page.locator('#goal-btn').boundingBox();
  expect(goalBtnBox.height).toBeGreaterThanOrEqual(44);
});

test('lineup screen field and unassigned list do not overlap at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
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

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  const fieldBox = await page.locator('#lineup-field-positions').boundingBox();
  const listBox = await page.locator('#lineup-unassigned-list').boundingBox();
  expect(fieldBox.x + fieldBox.width <= listBox.x || listBox.x + listBox.width <= fieldBox.x).toBe(true);
});

test('summary screen has no horizontal overflow at phone width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const reviewPath = testInfo.outputPath('review-game-mobile.json');
  await fs.writeFile(reviewPath, JSON.stringify({
    teamName: 'Review Team',
    games: [{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: 2,
      theirScore: 1,
      goals: [{ team: 'us', scorer: 'Avery', scorerId: 1, half: 1 }],
      playerStats: [{
        id: 1,
        name: 'Avery',
        secondsPlayed: 600,
        firstHalfSeconds: 300,
        secondHalfSeconds: 300,
        positionSeconds: { GK: 120 },
      }],
    }],
  }), 'utf8');

  await page.setInputFiles('#review-file-input', reviewPath);
  await expect(page.locator('#summary-screen')).toHaveClass(/active/);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
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

test('double header: game 2 can be planned ahead and becomes the next plan after game 1', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });
  await page.reload();

  const planLineup = async playerId => {
    await page.locator('#plan-ahead-btn').click();
    await planFourQuarters(page, playerId);
  };

  // Game 1: Avery only.
  await page.locator('#opponent-input').fill('Game One FC');
  await page.locator('#tile-1').click();
  await expect(page.locator('#plan-next-btn')).toBeHidden();
  await planLineup(1);
  await expect(page.locator('#plan-next-btn')).toBeVisible();

  // Game 2: Blake only, different opponent. Starting a game is not offered here.
  await page.locator('#plan-next-btn').click();
  await expect(page.locator('#game-number-label')).toContainText('Game 2');
  await expect(page.locator('#start-btn')).toBeHidden();
  await expect(page.locator('#tile-1')).not.toHaveClass(/selected/);
  await page.locator('#opponent-input').fill('Game Two FC');
  await page.locator('#tile-2').click();
  await planLineup(2);

  const planned = await page.evaluate(() => ({
    next: JSON.parse(localStorage.getItem('soccerGamePlan')),
    queued: JSON.parse(localStorage.getItem('soccerQueuedPlans')),
  }));
  expect(planned.next).toMatchObject({ gameNumber: 1, opponent: 'Game One FC', playerIds: [1], half1: { GK: 1 } });
  expect(planned.queued).toHaveLength(1);
  expect(planned.queued[0]).toMatchObject({ gameNumber: 2, opponent: 'Game Two FC', playerIds: [2], half1: { GK: 2 }, half2: { GK: 2 } });

  // Back to game 1 shows game 1's plan untouched.
  await page.locator('#plan-back-btn').click();
  await expect(page.locator('#opponent-input')).toHaveValue('Game One FC');
  await expect(page.locator('#tile-1')).toHaveClass(/selected/);
  await expect(page.locator('#start-btn')).toBeVisible();

  // The backup carries both plans.
  const backup = await page.evaluate(async () => {
    const { buildProfile } = await import('/js/persistence.js');
    const profile = buildProfile(false);
    return { gamePlan: profile.gamePlan, queuedPlans: profile.queuedPlans };
  });
  expect(backup.gamePlan.gameNumber).toBe(1);
  expect(backup.queuedPlans.map(p => p.gameNumber)).toEqual([2]);

  // Game 1 finishes: game 2's plan becomes the current plan, surviving a reload.
  await page.evaluate(async () => {
    const [{ state }, { goToSetup }] = await Promise.all([import('/js/state.js'), import('/js/summary.js')]);
    state.gameHistory.push({ date: '2026-10-24', opponent: 'Game One FC', ourScore: 0, theirScore: 0, goals: [], playerStats: [] });
    localStorage.setItem('soccerGameHistory', JSON.stringify(state.gameHistory));
    goToSetup();
  });
  await expect(page.locator('#game-number-label')).toHaveText('Game 2');
  await expect(page.locator('#opponent-input')).toHaveValue('Game Two FC');
  await expect(page.locator('#tile-2')).toHaveClass(/selected/);
  await expect(page.locator('#tile-1')).not.toHaveClass(/selected/);
  await expect(page.locator('#plan-ahead-status-text')).toContainText('Lineup planned for all four quarters');

  await page.reload();
  await expect(page.locator('#opponent-input')).toHaveValue('Game Two FC');
  const after = await page.evaluate(() => ({
    next: JSON.parse(localStorage.getItem('soccerGamePlan')),
    queued: localStorage.getItem('soccerQueuedPlans'),
  }));
  expect(after.next.gameNumber).toBe(2);
  expect(after.queued).toBeNull();
});
