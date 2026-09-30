import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'db.json');
const empty = () => ({ people: [], dates: {}, rankings: {}, runs: [] });

let db;
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = empty(); }

export const get = () => db;
export const reset = () => { db = empty(); save(); };
export function save(file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file);
}
export const pairKey = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
