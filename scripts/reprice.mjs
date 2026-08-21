/* Перестановка цен в минутах по всем задачам scripts/tasks/*.json.

   Правило игры: минуты кончаются только у тех, кто действует ужасно.
   Значит на каждом шаге САМЫЙ ДОРОГОЙ вариант — самый вредный (он
   создаёт переделку, ожидание и разбирательства), правильный стоит
   средне, а быстрая отписка дешёвая — но бьёт по доверию.

   Запуск: node scripts/reprice.mjs, затем node scripts/build-data.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tasks');

/* цена по роли варианта в шаге: [правильный, средний, вредный] */
const PRICE = {
  manager:      { good: 5,  mid: 15, bad: 30 },
  engineer:     { good: 20, mid: 10, bad: 25 },
  tester:       { good: 20, mid: 10, bad: 25 },
  engineerFix:  { good: 20, mid: 15, bad: 25 },
  managerClose: { good: 15, mid: 5,  bad: 25 }
};

let changed = 0, kept = 0;
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  const p = path.join(SRC, file);
  const day = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const task of day.tasks) {
    for (const [key, price] of Object.entries(PRICE)) {
      const step = task[key];
      if (!step) continue;
      /* правильный — максимум доверия; при равенстве доверия сильнее тот,
         кто сейчас дороже (там и была настоящая работа) */
      const order = step.options.map((o, i) => ({ o, i }))
        .sort((a, b) => (b.o.trust - a.o.trust) || (Math.abs(b.o.time) - Math.abs(a.o.time)));
      const good = order[0];
      const rest = order.slice(1)
        .sort((a, b) => (a.o.trust - b.o.trust) || (Math.abs(b.o.time) - Math.abs(a.o.time)));
      const bad = rest[0];
      const mid = rest[1];
      for (const [slot, cost] of [[good, price.good], [mid, price.mid], [bad, price.bad]]) {
        const next = -cost;
        if (slot.o.time === next) kept++; else { slot.o.time = next; changed++; }
      }
    }
  }
  fs.writeFileSync(p, JSON.stringify(day, null, 2) + '\n');
}
console.log('цены переставлены: изменено ' + changed + ', оставлено как было ' + kept);
