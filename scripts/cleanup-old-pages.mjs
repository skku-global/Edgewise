// Deletes the old dark-only Home, Trades and Reports screens, and the white
// calendar. Skips any file that something else still imports.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });

const candidates = [];
if (existsSync('src/classic')) {
  for (const n of readdirSync('src/classic')) {
    if (/^(home|index|trades|reports|dashboard)/i.test(n)) candidates.push(join('src/classic', n));
  }
}
if (existsSync('src/design/calendar-screen.tsx')) candidates.push('src/design/calendar-screen.tsx');

const all = walk('src');
for (const file of candidates) {
  const base = file.replace(/\\/g, '/').replace(/\.tsx?$/, '').split('/').pop();
  const users = all.filter(
    (f) =>
      f.replace(/\\/g, '/') !== file.replace(/\\/g, '/') &&
      !f.replace(/\\/g, '/').startsWith('src/classic/') &&
      new RegExp(`['"][^'"]*/${base}['"]`).test(readFileSync(f, 'utf8')),
  );
  if (users.length) {
    console.log('KEPT (still used by ' + users.join(', ') + '): ' + file);
  } else {
    rmSync(file);
    console.log('deleted: ' + file);
  }
}
console.log('Done.');
