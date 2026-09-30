// Browser smoke test: drives every page and fails on JS errors. Usage: PORT=3000 node scripts/smoke.mjs [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/node-tools/node_modules/playwright'); }
const base = `http://localhost:${process.env.PORT || 3000}`;
const shots = process.argv[2];
const b = await pw.chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
const snap = n => shots && pg.screenshot({ path: `${shots}/${n}.png` });
const go = async h => { await pg.goto(`${base}/#/${h}`); await pg.waitForTimeout(700); };
await go(''); await snap('home');
await go('people'); if (await pg.locator('.pc').count() < 25) errs.push('expected 25 people cards'); await snap('people');
await pg.locator('.pc').first().click(); await pg.waitForTimeout(700); if (!(await pg.textContent('main')).includes('How the agent read')) errs.push('profile missing'); await snap('profile');
await go('rankings'); if (await pg.locator('.rk').count() !== 24) errs.push('expected 24 ranking rows'); await snap('rankings');
await go('dates'); await snap('dates');
await pg.click('#watch'); await pg.waitForTimeout(4500); await snap('date');
await go('add'); await pg.fill('#li', 'https://www.linkedin.com/in/smoke-test'); await pg.fill('#ig', 'https://www.instagram.com/smoketest/');
await pg.click('#manual summary'); await pg.fill('#lit', 'Smoke Test\nEngineer at Acme\nBoston, MA\nI love climbing and cooking.'); await pg.fill('#igt', 'climber, cook\nBouldering tonight');
await pg.click('#go'); await pg.waitForTimeout(1200); if (!pg.url().includes('#/p/smoke-test')) errs.push('add person did not reach profile'); await snap('added');
pg.on('dialog', d => d.accept()); await pg.click('#del'); await pg.waitForTimeout(500);
await b.close();
console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'OK — all pages render, no JS errors');
process.exit(errs.length ? 1 : 0);
