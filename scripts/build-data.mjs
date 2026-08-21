/* Сборка server/src/data.js из текстов задач в scripts/tasks/*.json.

   Единственный источник текстов — папка scripts/tasks. Правите там,
   запускаете `node scripts/build-data.mjs`, получаете server/src/data.js.

   Скрипт ничего не делает вслепую: любое нарушение правил игры —
   исключение с понятным текстом, а не тихо собранный сломанный файл. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(HERE, 'tasks');
const OUT = path.join(ROOT, 'server/src/data.js');

/* Шум между задачами: тратит минуты и ничего не требует. */
const NOISE = [
  { label: 'Письмо', text: 'Коллеги, добрый день. Нужна выгрузка за три года. Срок — сегодня.', meta: 'Отправлено в 17:48', time: -15 },
  { label: 'Чат', text: 'А можно быстренько?', meta: '', time: -5 },
  { label: 'Служебное', text: 'Написали подрядчику. Ответ будет через три дня. Это нормально.', meta: '', time: -5 },
  { label: 'Чат', text: 'Вас добавили в чат на восемьдесят человек. Зачем — не сказали.', meta: '', time: -10 },
  { label: 'Календарь', text: 'Совещание о том, почему так много совещаний.', meta: '', time: -15 },
  { label: 'Служебное', text: 'Уволился человек, который один знал, как это работает.', meta: '', time: -5 },
  { label: 'Календарь', text: 'Окно изменений — суббота, с 02:00 до 04:00.', meta: '', time: 0 },
  { label: 'Приёмная', text: 'Приехал вендор. Продаёт систему за двести миллионов. Директор впечатлён.', meta: '', time: -10 }
];
const NOISE_WORST = Math.max(...NOISE.map((n) => Math.abs(n.time || 0)));

/* ------------------------------------------------------------- чтение */
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
if (!files.length) throw new Error('в scripts/tasks нет ни одного файла с задачами');

const days = files.map((f) => {
  const day = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  if (!day.day || !day.title) throw new Error(f + ': нужны поля day и title');
  if (!Array.isArray(day.tasks) || !day.tasks.length) throw new Error(f + ': нет задач');
  day.file = f;
  return day;
});

const allTasks = days.flatMap((d) => d.tasks);
const seen = new Set();
for (const t of allTasks) {
  if (seen.has(t.ticketNo)) throw new Error('номер задачи ' + t.ticketNo + ' встречается дважды');
  seen.add(t.ticketNo);
}

/* --------------------------------------------------------- инварианты */
const STEPS = ['manager', 'engineer', 'tester', 'engineerFix', 'managerClose'];

for (const task of allTasks) {
  const at = (msg) => new Error(task.ticketNo + ': ' + msg);
  for (const f of ['title', 'place', 'clock', 'truth']) if (!task[f]) throw at('нет поля ' + f);
  if (!task.module || !task.module.name || !task.module.short) throw at('нет модуля (module.name/short)');

  const steps = STEPS.filter((k) => task[k]);
  /* короткая задача — только три шага (разминка), полная — все пять */
  const shape = steps.join(',');
  if (shape !== 'manager,engineer,tester' && shape !== STEPS.join(',')) {
    throw at('набор шагов должен быть либо manager+engineer+tester, либо все пять, а он: ' + shape);
  }

  for (const key of steps) {
    const step = task[key];
    if (!Array.isArray(step.options) || step.options.length !== 3) {
      throw at(key + ': вариантов должно быть ровно три');
    }
    for (const o of step.options) {
      if (!o.label || !o.result) throw at(key + ': у варианта нет label или result');
      if (typeof o.time !== 'number' || o.time > 0) throw at(key + ': time должен быть числом <= 0, а он ' + o.time);
      if (typeof o.trust !== 'number' || o.trust < -2 || o.trust > 2) throw at(key + ': trust вне -2..2: ' + o.trust);
    }
  }

  if (!task.manager.lines || !task.manager.lines.length) throw at('у менеджера нет реплик заказчика');
  const asks = task.manager.options.filter((o) => o.asks).length;
  if (asks !== 1) throw at('вариантов «сначала спросил» — ' + asks + ', нужен ровно один');
  if (task.manager.options.some((o) => !o.ticket)) throw at('у варианта менеджера нет формулировки заявки (ticket)');

  /* изъян решает, упадёт ли модуль на проде: ровно один чистый вариант */
  for (const key of ['tester', 'engineerFix']) {
    const step = task[key];
    if (!step) continue;
    const clean = step.options.filter((o) => !o.flaw).length;
    if (clean !== 1) throw at(key + ': без изъяна вариантов ' + clean + ', нужен ровно один');
    for (const o of step.options) if (o.flaw && !o.flaw.trim()) throw at(key + ': пустой текст изъяна');
  }
  for (const key of ['manager', 'engineer', 'managerClose']) {
    if (task[key] && task[key].options.some((o) => o.flaw)) throw at(key + ': изъян ставится только в tester и engineerFix');
  }
}

/* --------------------------------------- минуты смены: бюджет на день */
const sumBy = (task, pick) => STEPS.filter((k) => task[k])
  .reduce((s, k) => s + pick(task[k].options.map((o) => Math.abs(o.time || 0)), task[k]), 0);

const worstOf = (t) => sumBy(t, (costs) => Math.max(...costs));
const bestOf = (t) => sumBy(t, (costs) => Math.min(...costs));
/* добросовестная игра: вариант с лучшим доверием, при равенстве — дороже */
const carefulOf = (t) => sumBy(t, (costs, step) => {
  let pick = step.options[0];
  for (const o of step.options) {
    const better = (o.trust || 0) > (pick.trust || 0);
    const same = (o.trust || 0) === (pick.trust || 0) && Math.abs(o.time || 0) > Math.abs(pick.time || 0);
    if (better || same) pick = o;
  }
  return Math.abs(pick.time || 0);
});

/* план команды повторяет planFor из server/src/game.js */
const planOf = (pool, per, teamIdx) => {
  const len = pool.length;
  const groups = Math.max(Math.floor(len / per), 1);
  const group = teamIdx % groups;
  const shift = Math.floor(teamIdx / groups) % len;
  const out = [];
  for (let k = 0; k < per; k++) out.push(pool[(group * per + shift + k) % len]);
  return out;
};

for (const day of days) {
  const per = Math.min(day.perTeam || 1, day.tasks.length);
  let worst = 0, best = Infinity, careful = 0;
  /* считаем по всем возможным номерам команд: их не больше, чем названий */
  for (let t = 0; t < 10; t++) {
    const plan = planOf(day.tasks, per, t);
    const noise = (per - 1) * NOISE_WORST;
    worst = Math.max(worst, plan.reduce((s, x) => s + worstOf(x), 0) + noise);
    best = Math.min(best, plan.reduce((s, x) => s + bestOf(x), 0));
    careful = Math.max(careful, plan.reduce((s, x) => s + carefulOf(x), 0) + noise);
  }
  day.per = per;
  day.budget = worst;        /* при всех худших решениях минуты кончаются ровно в ноль */
  day.reportBest = best;
  day.reportCareful = careful;
  if (careful >= worst) throw new Error(day.title + ': добросовестная игра (' + careful +
    ') не влезает в бюджет (' + worst + ') — день нельзя пройти правильно');
}

/* ------------------------------------------------------------- запись */
const q = (s) => JSON.stringify(String(s));
const keyOf = (t) => 'TASK_' + t.ticketNo.replace(/[^0-9A-Za-z]/g, '_');

function optLine(o, pad) {
  const parts = [`label: ${q(o.label)}`, `result: ${q(o.result)}`, `time: ${o.time}`, `trust: ${o.trust}`];
  if (o.asks) parts.push('asks: true');
  if (o.ticket) parts.push(`ticket: ${q(o.ticket)}`);
  if (o.flaw) parts.push(`flaw: ${q(o.flaw)}`);
  return `${pad}{ ${parts.join(', ')} }`;
}

function stepBlock(name, step, pad) {
  const L = [`${pad}${name}: {`];
  if (step.author) L.push(`${pad}  author: ${q(step.author)},`);
  if (step.note) L.push(`${pad}  note: ${q(step.note)},`);
  if (step.lines) L.push(`${pad}  lines: [${step.lines.map(q).join(', ')}],`);
  if (step.prompt) L.push(`${pad}  prompt: ${q(step.prompt)},`);
  L.push(`${pad}  options: [`);
  L.push(step.options.map((o) => optLine(o, pad + '    ')).join(',\n'));
  L.push(`${pad}  ]`);
  L.push(`${pad}}`);
  return L.join('\n');
}

function taskBlock(task) {
  const L = [`const ${keyOf(task)} = {`];
  L.push(`  ticketNo: ${q(task.ticketNo)},`);
  L.push(`  title: ${q(task.title)},`);
  L.push(`  place: ${q(task.place)},`);
  L.push(`  clock: ${q(task.clock)},`);
  if (task.channel) L.push(`  channel: ${q(task.channel)},`);
  L.push(`  module: { name: ${q(task.module.name)}, short: ${q(task.module.short)} },`);
  for (const name of STEPS) if (task[name]) L.push(stepBlock(name, task[name], '  ') + ',');
  L.push(`  truth: ${q(task.truth)}`);
  L.push('};');
  return L.join('\n');
}

const HEAD = `/* =======================================================================
   ВСЕ ТЕКСТЫ И ЦИФРЫ ИГРЫ — ЗДЕСЬ.
   Файл СОБИРАЕТСЯ скриптом: правьте scripts/tasks/*.json и запускайте
   node scripts/build-data.mjs. Правки прямо здесь потеряются при сборке.

   Занятие — рабочая неделя: разминка и пять дней. У каждого дня своя
   тема и пул задач; команда играет не все, а свои — у соседей другие.

   Задача — это работа, которую команда делает за день и вечером
   ВНЕДРЯЕТ в продакшн. Пять шагов по кругу разработки:
     1) manager      заказчик просит доработку, менеджер ставит задачу
     2) engineer     разработчик делает
     3) tester       тестировщик проверяет перед внедрением
     4) engineerFix  разработчик доводит по замечаниям
     5) managerClose менеджер готовит внедрение с бизнесом
   У каждого шага РОВНО ТРИ варианта.

   time  — игровые минуты (всегда <= 0), trust — доверие бизнеса (-2..+2).
   asks  — вариант менеджера, где он сначала спросил. Ровно один на задачу.
   ticket — формулировка заявки для разработчика и тестировщика.
   flaw  — изъян решения. Модуль с изъяном ПАДАЕТ при деплое, а текст
           изъяна показывается как причина падения. В tester и в
           engineerFix ровно один вариант БЕЗ изъяна.
   module — то, что команда вечером внедряет в продакшн.

   budget — минуты смены на день: до нуля команда доходит только выбирая
   всё самое дорогое. minutes — реальный таймер дня.
   ======================================================================= */

export const RULES = {
  startTrust: 5,
  maxTrust: 10,
  minTrust: -10,           // доверие уходит в минус: бизнес перестал верить
  teamSize: 3,
  lateTrustPenalty: 1,     // не успели по таймеру
  lostTrustPenalty: 2,     // минуты кончились — день провален
  deployFailTrust: 1,      // упавший деплой
  /* вес метрик в общем счёте */
  score: { ask: 10, trust: 5, module: 20, minutes: 25 }
};

export const HOST_PASSWORD = process.env.SMENA_HOST_PASS || 'smena';

export const ROLES = [
  { key: 'manager', name: 'Менеджер', gen: 'менеджера', job: 'Говорит с бизнесом. Ставит задачу и готовит внедрение.' },
  { key: 'engineer', name: 'Разработчик', gen: 'разработчика', job: 'Делает задачу. Видит только то, что написано в заявке.' },
  { key: 'tester', name: 'Тестировщик', gen: 'тестировщика', job: 'Проверяет работу до внедрения и возвращает с замечаниями.' }
];

/* Названия команд: нейтральные, по животным. */
export const TEAM_NAMES = [
  'Бобры', 'Выдры', 'Ежи', 'Барсуки', 'Совы',
  'Лоси', 'Рыси', 'Куницы', 'Кабаны', 'Хорьки'
];

/* Шум между задачами: тратит минуты и ничего не требует. */
export const NOISE = ${JSON.stringify(NOISE, null, 2).replace(/\n/g, '\n')};

/* ---------------------------------------------------------------- задачи */
`;

const parts = [HEAD];
for (const day of days) {
  parts.push(`/* ---- ${day.title}${day.note ? ': ' + day.note.replace(/^Тема дня: /, '') : ''} ---- */\n`);
  for (const task of day.tasks) parts.push(taskBlock(task) + '\n');
}

parts.push(`/* ------------------------------------------------------------ дни недели */
export const ROUNDS = [`);
for (const day of days) {
  parts.push(`  {
    key: ${q(day.day)},
    title: ${q(day.title)},${day.note ? `\n    note: ${q(day.note)},` : ''}${day.trial ? '\n    trial: true,' : ''}
    perTeam: ${day.per},
    budget: ${day.budget},
    minutes: ${day.minutes},
    pool: [${day.tasks.map(keyOf).join(', ')}]
  },`);
}
parts.push(`];

/* сколько боевых задач проходит одна команда за занятие */
export const COMBAT_INCIDENTS = ROUNDS
  .filter((r) => !r.trial)
  .reduce((n, r) => n + Math.min(r.perTeam, r.pool.length), 0);
`);

fs.writeFileSync(OUT, parts.join('\n'));

/* --------------------------------------------------------------- отчёт */
console.log('данные собраны из ' + files.length + ' файлов, задач всего: ' + allTasks.length + '\n');
for (const day of days) {
  console.log('  ' + day.title.padEnd(13) +
    'пул ' + String(day.tasks.length).padStart(2) +
    ', по ' + day.per + ' на команду' +
    ', бюджет ' + String(day.budget).padStart(3) + ' мин' +
    ' (добросовестно ' + String(day.reportCareful).padStart(3) +
    ', в лучшем случае ' + String(day.reportBest).padStart(3) + ')' +
    ', таймер ' + day.minutes + ' мин');
}
const combat = days.filter((d) => !d.trial).reduce((n, d) => n + d.per, 0);
console.log('\n  боевых задач на команду за занятие: ' + combat);
