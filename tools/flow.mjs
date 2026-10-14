// Dev-only: a D-pad walkthrough of KMR Snake with assertions, against the mock leaderboard.
// Usage: node ../kmr/tools/mock-db.mjs 9199 &  vite preview --port 4190 &  node tools/flow.mjs [base] [shotsDir]
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const [base = 'http://127.0.0.1:4190/?dev', shots] = process.argv.slice(2);
const DB = process.env.DB ?? 'http://127.0.0.1:9199';
if (shots) mkdirSync(shots, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? ` — ${x}` : ''}`));
const shot = async n => shots && (await page.screenshot({path: `${shots}/${n}.png`}));

const key = async (k, n = 1, wait = 220) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(wait);
  }
};
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 40) || a?.className || 'none';
  });
const clipped = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button,[tabindex]:not([tabindex="-1"])')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && (r.left < -1 || r.top < -1 || r.right > 601 || r.bottom > 601);
      })
      .map(el => el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20)),
  );
const noClip = async where => {
  const c = await clipped();
  check(`Nothing cut off: ${where}`, c.length === 0, c.join(', '));
};
const text = sel => page.evaluate(s => document.querySelector(s)?.textContent ?? '', sel);
const dbGet = async p => (await fetch(`${DB}/${p}.json`)).json();

await fetch(`${DB}/__reset`, {method: 'POST'});
// Someone else already owns "Taken1" on the casino board.
await fetch(`${DB}/.json`, {
  method: 'PATCH',
  body: JSON.stringify({'owners/taken1': 'b'.repeat(48), 'stamp/taken1': {k: 'b'.repeat(48), t: {'.sv': 'timestamp'}}}),
});
// A few rivals on the Classic board.
for (const [n, best] of [
  ['Viper', 640],
  ['Mamba', 410],
  ['Cobra', 120],
]) {
  const k = n.toLowerCase();
  const sec = k.padEnd(40, 'z');
  const r = await fetch(`${DB}/.json`, {
    method: 'PATCH',
    body: JSON.stringify({[`owners/${k}`]: sec, [`stamp/${k}`]: {k: sec, t: {'.sv': 'timestamp'}}, [`arcade/snake_classic/${k}`]: {name: n, best, games: 9, skin: 'fire', updated: {'.sv': 'timestamp'}}}),
  });
  if (!r.ok) console.log('seed failed', await r.text());
}

// ---- first launch: pick a name
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(db => {
  localStorage.clear();
  localStorage.setItem('kmr.dbOverride', db);
}, DB);
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(600);
check('First launch asks for a name', (await text('.ns-titles h1')).includes('name'));
await noClip('name setup');
// Type "Taken1" (taken) with the D-pad keyboard, via clicks for speed.
const typeName = async name => {
  for (const ch of name) {
    const label = /[A-Za-z]/.test(ch) ? ch : ch === '_' ? 'Underscore' : ch;
    await page.evaluate(l => [...document.querySelectorAll('.ns-key')].find(b => b.getAttribute('aria-label') === l)?.click(), label);
  }
  await page.waitForTimeout(150);
};
await typeName('Taken1');
await page.click('.ns-join');
await page.waitForTimeout(900);
check('A name owned by someone else is refused', (await text('.ns-status')).includes('Taken'), await text('.ns-status'));
await page.evaluate(() => {
  for (let i = 0; i < 12; i++) document.querySelector('.ns-key[aria-label="Delete"]')?.click();
});
await typeName('Slither');
await page.waitForTimeout(700);
await shot('01-name');
await page.click('.ns-join');
await page.waitForTimeout(900);
check('Joining goes to the menu', (await page.locator('.modes').count()) === 1);
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1')));
check('Shared profile saved and claimed', prof.name === 'Slither' && prof.claimed === true, JSON.stringify({n: prof.name, c: prof.claimed}));

// ---- home
check('Home focuses Classic', (await focused()).startsWith('Play Classic'), await focused());
await noClip('home');
await page.waitForTimeout(800);
await shot('02-home');
await key('ArrowRight');
check('Right moves to Portal', (await focused()).startsWith('Play Portal'), await focused());
await page.waitForTimeout(600);
await shot('03-home-portal');
await key('ArrowLeft');
await key('ArrowDown');
check('Down reaches the bottom row', /Skins|Leaderboard/.test(await focused()), await focused());
await key('ArrowUp');

// ---- play classic
await key('Enter', 1, 500);
check('First game shows how to play', (await text('.tut h2')) === 'How to play');
await noClip('tutorial');
await shot('04-tutorial');
await key('Enter', 1, 400);
check('Focus rests on the play surface', (await focused()).startsWith('Playing'), await focused());
await page.waitForTimeout(400);
await shot('05-ready');
// Steer the snake to the fruit a few times with the dev handle, then crash.
const eat = async n => {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__game;
      const h = g.body[0];
      // Teleport the fruit right in front of the head.
      const dx = [0, 1, 0, -1][g.dir];
      const dy = [-1, 0, 1, 0][g.dir];
      g.food = {x: h.x + dx, y: h.y + dy};
    });
    await page.waitForTimeout(260);
  }
};
await key('ArrowUp', 1, 300);
check('A swipe starts the run', await page.evaluate(() => window.__game.started));
await eat(1);
await key('ArrowRight', 1, 120);
await eat(3);
await key('ArrowDown', 1, 120);
await eat(2);
await page.waitForTimeout(300);
await shot('06-playing');
const sc = await page.evaluate(() => window.__game.score);
check('Eating fruit scores', sc >= 40, sc);
// Pause with a pinch (Enter), Back resumes.
await key('Enter', 1, 300);
check('Pinch pauses', (await text('.pause h2')) === 'Paused');
await noClip('pause');
await shot('07-paused');
await key('Escape', 1, 300);
check('Back resumes', (await page.locator('.pause').count()) === 0 && !(await page.evaluate(() => window.__game.paused)));
// Crash into the bottom wall.
await page.waitForTimeout(3500);
check('Results after a crash', (await page.locator('.results').count()) === 1);
await page.waitForTimeout(2500);
await shot('08-results');
await noClip('results');
check('Results focus Play again', (await focused()).includes('Play again'), await focused());
const rankText = await text('.res-sub');
check('Results show a rank', /#\d+ of \d+/.test(rankText), rankText);
const board = await dbGet('arcade/snake_classic/slither');
check('Best went to the leaderboard', board && board.best === sc, JSON.stringify(board));
const coins = await page.evaluate(() => window.__save.get().coins);
check('Coins earned incl. daily bonus', coins === Math.floor(sc / 8) + 50, coins);

// ---- play again → Back leaves only from the ready screen
await key('Enter', 1, 600);
check('Play again starts a fresh run', (await focused()).startsWith('Playing') && (await page.evaluate(() => window.__game.score)) === 0);
await key('Escape', 1, 600);
check('Back before moving returns to the menu', (await page.locator('.modes').count()) === 1);
check('Focus returns to Classic', (await focused()).startsWith('Play Classic'), await focused());

// ---- skins: give coins, buy one
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('kmr.snake.v1'));
  s.coins = 700;
  s.games = 26;
  localStorage.setItem('kmr.snake.v1', JSON.stringify(s));
});
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(800);
await key('ArrowDown');
check('Down to Skins', (await focused()).includes('Skins'), await focused());
await key('Enter', 1, 600);
check('Skins focus the equipped skin', (await focused()).startsWith('Neon'), await focused());
await noClip('skins');
await key('ArrowRight', 3);
check('Focus Sunset', (await focused()).startsWith('Sunset'), await focused());
await shot('09-skins');
await key('Enter', 1, 400);
check('Buying asks first', (await text('.confirm h2')).includes('Sunset'));
await shot('10-confirm');
await key('Escape', 1, 400);
check('Back closes the popup only', (await page.locator('.confirm').count()) === 0 && (await page.locator('.skin-grid').count()) === 1);
check('Focus back on Sunset', (await focused()).startsWith('Sunset'), await focused());
await key('Enter', 1, 400);
await key('Enter', 1, 500);
const sv = await page.evaluate(() => window.__save.get());
check('Bought and equipped', sv.skin === 'sunset' && sv.coins === 520, `${sv.skin} ${sv.coins}`);
await key('ArrowDown', 3);
await page.waitForTimeout(300);
await shot('11-skins-locked');
await noClip('skins bottom');
await key('Escape', 1, 600);
check('Back to menu from Skins', (await page.locator('.modes').count()) === 1);
check('Focus returns to Skins', (await focused()).includes('Skins'), await focused());

// ---- leaderboard
await key('ArrowRight');
await key('Enter', 1, 1200);
check('Leaderboard opens on Classic', (await text('.tab.is-on')) === 'Classic');
const rows = await page.locator('.row').count();
check('Leaderboard lists 4 players', rows === 4, rows);
check('My row highlighted', (await text('.row.is-me .row-name')) === 'Slither');
await noClip('leaderboard');
await shot('12-board');
await key('ArrowRight', 1, 900);
check('Right switches to Portal', (await text('.tab.is-on')) === 'Portal');
await shot('13-board-empty');
await key('Escape', 1, 600);
check('Back to menu from the board', (await page.locator('.modes').count()) === 1);

// ---- a name from the casino is reused
await page.evaluate(() => {
  localStorage.removeItem('kmr.snake.v1');
  localStorage.setItem('kmr.profile.v1', JSON.stringify({name: 'Mamba', secret: 'mamba'.padEnd(40, 'z'), claimed: true, favorites: ['crash'], sound: false}));
});
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(700);
check('Casino name skips the name screen', (await text('.player-name')) === 'Mamba');
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1')));
check('Casino fields kept', kept.favorites?.[0] === 'crash' && kept.sound === false);

check('No page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
