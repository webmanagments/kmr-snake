// Dev-only: "Link name" end to end between KMR Casino and KMR Snake, each in its own browser
// storage (like the glasses), plus the ways someone might try to abuse it.
// Needs: ../kmr/tools/mock-db.mjs on 9199, the casino preview on 4173, the snake preview on 4190.
// Usage: node tools/link-test.mjs [shotsDir]
import {chromium} from 'playwright';
const shots = process.argv[2];
const DB = 'http://127.0.0.1:9199';
const CASINO = 'http://127.0.0.1:4173/';
const SNAKE = 'http://127.0.0.1:4190/?dev';
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? ` — ${x}` : ''}`));
const errors = [];

async function app(url) {
  const ctx = await browser.newContext({viewport: {width: 600, height: 600}}); // its own storage, like one app on the glasses
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${url}: ${e.message}`));
  await page.goto(url, {waitUntil: 'load'});
  await page.evaluate(db => localStorage.setItem('kmr.dbOverride', db), DB);
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(500);
  return page;
}
const text = (p, sel) => p.evaluate(s => document.querySelector(s)?.textContent ?? '', sel);
const clickText = (p, sel, t) => p.evaluate(([s, t]) => [...document.querySelectorAll(s)].find(b => b.textContent.trim() === t)?.click(), [sel, t]);
const typeName = async (p, name) => {
  for (const ch of name) await p.evaluate(l => [...document.querySelectorAll('.ns-key')].find(b => b.getAttribute('aria-label') === l)?.click(), ch);
  await p.waitForTimeout(100);
};
const typeCode = async (p, code) => {
  for (const ch of code) await clickText(p, '.ns-key', ch);
};
const profileOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1') || '{}'));
const clipped = p =>
  p.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.top < -1 || r.right > 601 || r.bottom > 601);
      })
      .map(el => el.textContent.trim().slice(0, 20)),
  );
const shot = async (p, n) => shots && (await p.screenshot({path: `${shots}/link-${n}.png`}));

await fetch(`${DB}/__reset`, {method: 'POST'});

// 1) Casino on the glasses: make the name "Kuyro".
const casino = await app(CASINO);
await typeName(casino, 'Kuyro');
await casino.waitForTimeout(600);
await casino.click('.ns-join');
await casino.waitForTimeout(1000);
const cp = await profileOf(casino);
check('Casino owns Kuyro', cp.name === 'Kuyro' && cp.claimed === true);

// 2) Snake on the glasses: separate storage, so it asks for a name. Typing Kuyro is refused.
const snake = await app(SNAKE);
check('Snake asks for a name', (await text(snake, '.ns-titles h1')).includes('name'));
await typeName(snake, 'Kuyro');
await snake.waitForTimeout(800);
check('Kuyro shows as taken in Snake', (await text(snake, '.ns-status')).includes('Taken'), await text(snake, '.ns-status'));
await shot(snake, '01-name');

// 3) Casino: Wallet → Link name → Get a code.
await casino.click('.wallet-btn');
await casino.waitForTimeout(400);
await casino.click('.modal-link');
await casino.waitForTimeout(300);
await shot(casino, '02-casino-menu');
check('Casino link menu focuses Get a code', (await casino.evaluate(() => document.activeElement?.textContent?.trim())) === 'Get a code');
await casino.keyboard.press('Enter');
await casino.waitForTimeout(900);
const code1 = (await text(casino, '.link-code')).replace('-', '');
check('Casino shows an 8-character code', /^[0-9A-Z]{8}$/.test(code1), code1);
await shot(casino, '03-casino-code');
check('Casino wallet nothing cut off', (await clipped(casino)).length === 0, (await clipped(casino)).join(','));

// 4) Snake: Link name → type the code.
await clickText(snake, '.ns-random', 'Link name');
await snake.waitForTimeout(400);
check('Snake link screen opens', (await text(snake, '.ns-titles h1')) === 'Link your name');
check('Snake link screen nothing cut off', (await clipped(snake)).length === 0, (await clipped(snake)).join(','));
await typeCode(snake, code1.slice(0, 5));
await shot(snake, '04-snake-typing');
await typeCode(snake, code1.slice(5));
await snake.waitForTimeout(1500);
const sp = await profileOf(snake);
check('Snake now plays as Kuyro', sp.name === 'Kuyro' && sp.claimed === true && (await snake.locator('.modes').count()) === 1, sp.name);
check('Snake got the same key as the casino', sp.secret === cp.secret);
await shot(snake, '05-snake-home');

// 5) The same code can't be used twice.
const other = await app(SNAKE);
await clickText(other, '.ns-random', 'Link name');
await other.waitForTimeout(300);
await typeCode(other, code1);
await other.waitForTimeout(1500);
check('A used code is refused', (await text(other, '.ns-status')).includes('wrong, used or expired'), await text(other, '.ns-status'));
check('…and the other app has no name', !(await profileOf(other)).name);
await shot(other, '06-used');

// 6) Typos: wrong code refused; I/L/O typed as 1/1/0 still match (tested on the next code).
await clickText(other, '.ns-key', 'Clear');
await typeCode(other, 'ZZZZZZZZ');
await other.waitForTimeout(1200);
check('A made-up code is refused', (await text(other, '.ns-status')).includes('wrong'));

// 7) Snake → its name menu → Get a code; expire it; it no longer works.
await snake.click('[data-nav="name"]');
await snake.waitForTimeout(300);
check('Name menu opens on Get a code', (await snake.evaluate(() => document.activeElement?.textContent?.trim())).includes('Get a code'));
await shot(snake, '07-name-menu');
await snake.keyboard.press('Enter');
await snake.waitForTimeout(900);
const code2 = (await text(snake, '.link-code')).replace('-', '');
check('Snake makes a code too', /^[0-9A-Z]{8}$/.test(code2), code2);
check('Snake code card nothing cut off', (await clipped(snake)).length === 0);
await shot(snake, '08-snake-code');
await fetch(`${DB}/__agelinks`, {method: 'POST'});
await clickText(other, '.ns-key', 'Clear');
await typeCode(other, code2);
await other.waitForTimeout(1500);
check('An expired code is refused', (await text(other, '.ns-status')).includes('expired'));
await snake.keyboard.press('Escape');
await snake.waitForTimeout(300);
check('Back from the code returns to the name menu', (await snake.locator('.name-card').count()) === 1);
await snake.keyboard.press('Escape');
await snake.waitForTimeout(300);
check('Back again closes the menu', (await snake.locator('.name-card').count()) === 0 && (await snake.locator('.modes').count()) === 1);
check('Focus back on the name', (await snake.evaluate(() => document.activeElement?.dataset.nav)) === 'name');

// 8) Snake → a fresh casino (other direction), typing O for 0 and lowercase-looking mistakes.
await snake.click('[data-nav="name"]');
await snake.waitForTimeout(300);
await snake.keyboard.press('Enter');
await snake.waitForTimeout(900);
const code3 = (await text(snake, '.link-code')).replace('-', '');
const casino2 = await app(CASINO);
await clickText(casino2, '.ns-random', 'Link name');
await casino2.waitForTimeout(300);
await shot(casino2, '09-casino-enter');
check('Casino link screen nothing cut off', (await clipped(casino2)).length === 0, (await clipped(casino2)).join(','));
await typeCode(casino2, code3.replace(/0/g, 'O').replace(/1/g, 'I'));
await casino2.waitForTimeout(1500);
const c2 = await profileOf(casino2);
check('A second casino links Kuyro (O and I read as 0 and 1)', c2.name === 'Kuyro' && c2.secret === cp.secret, `${c2.name}`);

// 9) Abuse: someone who doesn't own Kuyro tries to make a code for it, or list codes.
const fake = 'f'.repeat(48);
const r1 = await fetch(`${DB}/.json`, {
  method: 'PATCH',
  body: JSON.stringify({'stamp/kuyro': {k: fake, t: {'.sv': 'timestamp'}}, ['links/' + 'a'.repeat(32)]: {name: 'kuyro', iv: 'x', ct: 'y', t: {'.sv': 'timestamp'}}}),
});
check('A stranger cannot make a code for Kuyro', r1.status === 401, r1.status);
const r2 = await fetch(`${DB}/.json`, {method: 'PATCH', body: JSON.stringify({['links/' + 'b'.repeat(32)]: {name: 'kuyro', iv: 'x', ct: 'y', t: {'.sv': 'timestamp'}}})});
check('…not even without a stamp', r2.status === 401, r2.status);
const r3 = await fetch(`${DB}/links.json`);
check('Nobody can list codes', r3.status === 401, r3.status);
const r4 = await fetch(`${DB}/owners/kuyro.json`);
check('Nobody can read the key', r4.status === 401, r4.status);
// Making a code for a name you own works only for that name: owner of "kuyro" can't link "taken".
const r5 = await fetch(`${DB}/.json`, {
  method: 'PATCH',
  body: JSON.stringify({'owners/victim': 'v'.repeat(48), 'stamp/victim': {k: 'v'.repeat(48), t: {'.sv': 'timestamp'}}}),
});
const r6 = await fetch(`${DB}/.json`, {
  method: 'PATCH',
  body: JSON.stringify({'stamp/kuyro': {k: cp.secret, t: {'.sv': 'timestamp'}}, ['links/' + 'c'.repeat(32)]: {name: 'victim', iv: 'x', ct: 'y', t: {'.sv': 'timestamp'}}}),
});
check("An owner can't make codes for someone else's name", r5.ok && r6.status === 401, r6.status);

check('No page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
