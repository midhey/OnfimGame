/* Раскидывает варианты внутри шагов, чтобы «правильный» ответ не стоял
   всегда на одном месте. Раскладка детерминированная: позиция удачного
   варианта идёт по кругу 1-2-3, а два оставшихся меняются местами через
   каждые три шага. Никакого случая — пересборка даёт тот же результат.

   Запуск: node scripts/shuffle-options.mjs && node scripts/build-data.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tasks');
const STEPS = ['manager', 'engineer', 'tester', 'engineerFix', 'managerClose'];

/* удачный вариант: у менеджера тот, где он спросил, иначе — лучший по доверию */
function goodOne(key, options) {
  if (key === 'manager') {
    const asks = options.find((o) => o.asks);
    if (asks) return asks;
  }
  return options.reduce((a, b) => (b.trust > a.trust ? b : a), options[0]);
}

let n = 0, moved = 0, total = 0;
const spread = { manager: [0, 0, 0], engineer: [0, 0, 0], tester: [0, 0, 0], engineerFix: [0, 0, 0], managerClose: [0, 0, 0] };

for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  const p = path.join(SRC, file);
  const day = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const task of day.tasks) {
    for (const key of STEPS) {
      const step = task[key];
      if (!step) continue;
      const opts = step.options;
      const good = goodOne(key, opts);
      const rest = opts.filter((o) => o !== good);
      /* самый вредный вариант тоже не должен жить на одном месте */
      const bad = rest.reduce((a, b) =>
        (b.trust < a.trust || (b.trust === a.trust && Math.abs(b.time) > Math.abs(a.time)) ? b : a), rest[0]);
      const mid = rest.find((o) => o !== bad);
      const target = n % 3;                       /* место удачного: по кругу */
      const free = [0, 1, 2].filter((i) => i !== target);
      const badAt = free[Math.floor(n / 3) % 2];  /* место вредного: через раз */
      const out = [];
      for (let i = 0; i < 3; i++) out.push(i === target ? good : i === badAt ? bad : mid);
      if (out.some((o, i) => o !== opts[i])) moved++;
      step.options = out;
      spread[key][target]++;
      total++;
      n++;
    }
  }
  fs.writeFileSync(p, JSON.stringify(day, null, 2) + '\n');
}

console.log('шагов всего: ' + total + ', порядок изменён в ' + moved);
console.log('\nна какой позиции стоит удачный вариант:');
console.log('шаг            1-й  2-й  3-й');
for (const [key, s] of Object.entries(spread)) {
  console.log('  ' + key.padEnd(13) + s.map((x) => String(x).padStart(3)).join('  '));
}
const all = Object.values(spread).reduce((a, s) => a.map((x, i) => x + s[i]), [0, 0, 0]);
console.log('  ' + 'ИТОГО'.padEnd(13) + all.map((x) => String(x).padStart(3)).join('  '));
