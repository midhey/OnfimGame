/* Сборка server/src/data.js: берёт существующие инциденты, дописывает им
   модули и изъяны, подмешивает новые из scripts/new-incidents.json,
   раскладывает по дням недели и считает бюджет минут так, чтобы ноль
   достигался только при всех худших решениях.

   Запуск: node scripts/build-data.mjs
   Ничего не ломает вслепую: любое несовпадение — исключение. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'server/src/data.js');

/* ---------- модули и изъяны для инцидентов, которые уже написаны ----------
   flaw ставим на слабые варианты тестировщика и доработки. В каждом из этих
   двух шагов ровно один вариант остаётся без изъяна. */
const ENRICH = {
  'SD-4401': {
    module: ['Контроль бумаги в принтере', 'принтер'],
    tester: { 'Проверить, что печать пошла': 'печать проверяли своей тестовой страницей',
              'Закрыть заявку': 'печать никто не проверял' }
  },
  'SD-4471': {
    module: ['Проверка временных пропусков', 'пропуска'],
    tester: { 'Проверить самому': 'проверяли под своим постоянным пропуском',
              'Закрыть заявку: система работает': 'проверки не было вообще' },
    fix: { 'Починить у себя: пускать временные мимо проверки': 'временные пропуска ходят мимо проверки',
           'Позвонить в СБ и поругаться': 'договорились на словах, заявки в СБ нет' }
  },
  'SD-4468': {
    module: ['Подтверждение доставки взвешиваний', 'весовая'],
    tester: { 'Проверить новое взвешивание': 'проверяли на одном рейсе',
              'Удалить дубли из сводки': 'причину не проверяли, только подчистили' },
    fix: { 'Поставить фильтр дублей на приёме': 'фильтр отвалится при смене формата',
           'Попросить сетевиков, чтобы сеть не рвалась': 'обрыв сети никуда не делся' }
  },
  'SD-4470': {
    module: ['Монитор сроков сертификатов', 'сертификаты'],
    tester: { 'Проверить портал у себя': 'проверяли мимо прокси',
              'Спросить в чате, у всех ли теперь ок': 'молчание в чате приняли за проверку' },
    fix: { 'Заменить сертификат на прокси': 'срок следующего сертификата снова никто не сторожит',
           'Отключить проверку сертификатов на прокси': 'проверка сертификатов выключена' }
  },
  'SD-4489': {
    module: ['Единое время в отчётах', 'время'],
    tester: { 'Проверить дневную смену': 'ночную смену так и не проверили',
              'Сверить сумму за месяц': '«почти сходится» проверкой не считается' },
    fix: { 'Сдвинуть отчёт ГОКа на два часа костылём': 'костыль держится на одной площадке',
           'Вернуть сервер из Москвы обратно': 'причину не тронули, только переехали' }
  },
  'SD-4517': {
    module: ['Лимит тяжёлых отчётов', 'отчёты'],
    tester: { 'Проверить, что сервер больше не грузится': 'проверяли сервер, а не людей',
              'Замерить скорость из своего кабинета': 'мерили там, где всегда быстро' },
    fix: { 'Заблокировать пользователя': 'человеку просто перекрыли работу',
           'Просто сходить показать человеку кнопку выгрузки': 'ограничений нет, повторится с любым другим' }
  },
  'SD-4519': {
    module: ['Уведомления о карантине писем', 'карантин'],
    tester: { 'Попросить клиента отправить ещё раз': 'дошло — но неясно, починили или повезло',
              'Закрыть: письмо получено': 'правило карантина не проверяли' },
    fix: { 'Выпустить письма и внести домен в доверенные': 'следующий новый домен застрянет так же',
           'Попросить клиента настроить подписи домена': 'письма всё ещё в карантине' }
  },
  'SD-4522': {
    module: ['Протокол правок обмена', 'обмен'],
    tester: { 'Пересчитать итоги за вторник': 'сошлось сейчас, обрыв не воспроизводили',
              'Попросить главбуха глянуть глазами': '«вроде нормально» проверкой не считается' },
    fix: { 'Удалить дубли скриптом по-тихому': 'правки в бухгалтерской базе без протокола',
           'Отдать вендору и ждать': 'до закрытия месяца никто не успеет' }
  },
  'SD-4523': {
    module: ['Честная очередь замеров', 'замеры'],
    tester: { 'Проверить, что замеры доходят': 'проверяли из кабинета, а не в цехе',
              'Прогнать маршрут по карте из кабинета': 'карта по цеху не ходит' },
    fix: { 'Просить сеть провести точку в крыло': 'связи в крыле нет и не будет до квартала',
           'Запретить сохранение без связи': 'в дальнем крыле работать теперь нельзя' }
  },
  'SD-4530': {
    module: ['Ротация логов', 'логи'],
    tester: { 'Проверить, что место освободилось': 'освободилось — но отладку не проверяли',
              'Поставить напоминание почистить через месяц': 'чинит календарь, а не настройка' },
    fix: { 'Удалить всё сразу': 'история удалена вместе с логами',
           'Оставить как есть, место ещё есть': 'логи растут по-прежнему' }
  },
  'SD-4540': {
    module: ['Окно работ подрядчика', 'подрядчик'],
    tester: { 'Дождаться, пока подрядчик откатит, и проверить, что всё поднялось': 'подняли, но договорённостей о работах нет',
              'Проверить с телефона через мобильную сеть': 'проверяли в обход своей же сети' },
    fix: { 'Требовать немедленный откат работ': 'таймлайн для разбора никто не собрал',
           'Ждать, пока подрядчик доделает': 'простой затянули на часы' }
  },
  'SD-4502': {
    module: ['Честная ошибка доступа', 'доступы'],
    tester: { 'Проверить, что у Ивановой теперь работает': 'у остальных нули так и остались',
              'Спросить у Ивановой, всё ли хорошо': '«вроде да» проверкой не считается' },
    fix: { 'Выдать права руками, быстро': 'права выданы мимо заявки, аудит спросит',
           'Отправить Иванову писать заявку самой': 'человека отправили решать за вас' }
  },
  'SD-4551': {
    module: ['Проверяемый бэкап обменника', 'бэкап'],
    tester: { 'Проверить, что папка на месте': 'что внутри файлов — не смотрели',
              'Закрыть заявку: восстановлено': 'битые файлы всплывут на проверке' },
    fix: { 'Включить в бэкап и забыть': 'восстановлением бэкап никто не проверял',
           'Написать регламент «не хранить важное на обменнике»': 'регламент есть, привычка осталась' }
  }
};

/* ---------- дни недели: какие инциденты в пуле ---------- */
const DAYS = [
  { key: 'trial', title: 'Разминка', trial: true, perTeam: 1, minutes: 3, old: ['SD-4401'] },
  { key: 'mon', title: 'Понедельник', perTeam: 2, minutes: 6, old: ['SD-4471', 'SD-4468'] },
  { key: 'tue', title: 'Вторник', perTeam: 2, minutes: 6, old: ['SD-4489', 'SD-4522'] },
  { key: 'wed', title: 'Среда', perTeam: 2, minutes: 6, old: ['SD-4502', 'SD-4519'] },
  { key: 'thu', title: 'Четверг', perTeam: 2, minutes: 6, old: ['SD-4530', 'SD-4470', 'SD-4517'] },
  { key: 'fri', title: 'Пятница', perTeam: 2, minutes: 6, old: ['SD-4540', 'SD-4523', 'SD-4551'] }
];

/* ---------- утилиты ---------- */
const q = (s) => JSON.stringify(String(s));
const clean = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
};

function optLine(o, indent) {
  const parts = [`label: ${q(o.label)}`, `result: ${q(o.result)}`, `time: ${o.time}`, `trust: ${o.trust}`];
  if (o.asks) parts.push('asks: true');
  if (o.ticket) parts.push(`ticket: ${q(o.ticket)}`);
  if (o.flaw) parts.push(`flaw: ${q(o.flaw)}`);
  return `${indent}{ ${parts.join(', ')} }`;
}

function stepBlock(name, step, indent) {
  const lines = [`${indent}${name}: {`];
  if (step.author) lines.push(`${indent}  author: ${q(step.author)},`);
  if (step.note) lines.push(`${indent}  note: ${q(step.note)},`);
  if (step.lines) lines.push(`${indent}  lines: [${step.lines.map(q).join(', ')}],`);
  if (step.prompt) lines.push(`${indent}  prompt: ${q(step.prompt)},`);
  lines.push(`${indent}  options: [`);
  lines.push(step.options.map((o) => optLine(o, indent + '    ')).join(',\n'));
  lines.push(`${indent}  ]`);
  lines.push(`${indent}}`);
  return lines.join('\n');
}

function incidentBlock(inc) {
  const L = [];
  L.push(`const ${inc.key} = {`);
  L.push(`  ticketNo: ${q(inc.ticketNo)},`);
  L.push(`  title: ${q(inc.title)},`);
  L.push(`  place: ${q(inc.place)},`);
  L.push(`  clock: ${q(inc.clock)},`);
  if (inc.channel) L.push(`  channel: ${q(inc.channel)},`);
  L.push(`  module: { name: ${q(inc.module.name)}, short: ${q(inc.module.short)} },`);
  for (const [name, step] of [['manager', inc.manager], ['engineer', inc.engineer],
                              ['tester', inc.tester], ['engineerFix', inc.engineerFix],
                              ['managerClose', inc.managerClose]]) {
    if (!step) continue;
    L.push(stepBlock(name, step, '  ') + ',');
  }
  L.push(`  truth: ${q(inc.truth)}`);
  L.push('};');
  return L.join('\n');
}

/* ---------- 1. существующие инциденты ---------- */
const old = await import('file://' + path.join(ROOT, 'server/src/data.js').replace(/\\/g, '/'));
const byNo = new Map();
for (const r of old.ROUNDS) {
  const pool = r.pool || r.incidents || [];
  for (const inc of pool) byNo.set(inc.ticketNo, inc);
}
console.log('нашёл существующих инцидентов:', byNo.size);

/* дописываем модули и изъяны */
function enrich(inc) {
  const e = ENRICH[inc.ticketNo];
  if (!e) throw new Error('нет модуля/изъянов для ' + inc.ticketNo);
  const out = JSON.parse(JSON.stringify(inc));
  out.module = { name: e.module[0], short: e.module[1] };
  const apply = (step, table, where) => {
    if (!step || !table) return;
    const hit = new Set();
    for (const o of step.options) {
      for (const [label, flaw] of Object.entries(table)) {
        if (o.label === label) { o.flaw = flaw; hit.add(label); }
      }
    }
    for (const label of Object.keys(table)) {
      if (!hit.has(label)) throw new Error(inc.ticketNo + ' ' + where + ': не найден вариант ' + JSON.stringify(label));
    }
    const без = step.options.filter((o) => !o.flaw).length;
    if (без !== 1) throw new Error(inc.ticketNo + ' ' + where + ': без изъяна должен быть ровно один вариант, а их ' + без);
  };
  apply(out.tester, e.tester, 'tester');
  apply(out.engineerFix, e.fix, 'engineerFix');
  return out;
}

/* ---------- 2. новые инциденты из воркфлоу ---------- */
const newPath = path.join(HERE, 'new-incidents.json');
const fresh = fs.existsSync(newPath) ? JSON.parse(fs.readFileSync(newPath, 'utf8')) : { days: [] };
const freshByDay = new Map();
for (const d of fresh.days || []) freshByDay.set(d.day, d.incidents || []);
console.log('новых инцидентов из воркфлоу:', [...freshByDay.values()].reduce((n, a) => n + a.length, 0));

/* ---------- 3. собираем дни ---------- */
const keyOf = (inc) => 'INC_' + inc.ticketNo.replace('SD-', 'N');
const rounds = [];
const allIncidents = [];

for (const day of DAYS) {
  const pool = [];
  for (const no of day.old) {
    const inc = byNo.get(no);
    if (!inc) throw new Error('нет инцидента ' + no + ' в текущем data.js');
    const e = enrich(inc);
    e.key = keyOf(e);
    pool.push(e);
  }
  for (const inc of freshByDay.get(day.key) || []) {
    const c = JSON.parse(JSON.stringify(inc));
    c.key = keyOf(c);
    if (!c.module) throw new Error(c.ticketNo + ': нет модуля');
    pool.push(c);
  }
  if (!pool.length) throw new Error('пустой пул у дня ' + day.key);
  rounds.push({ ...day, pool });
  allIncidents.push(...pool);
}

/* ---------- 4. проверки инвариантов ---------- */
const NOISE_WORST = 15;   // худшая карточка шума
for (const inc of allIncidents) {
  const steps = [inc.manager, inc.engineer, inc.tester, inc.engineerFix, inc.managerClose].filter(Boolean);
  const need = inc.engineerFix ? 5 : 3;
  if (steps.length !== need) throw new Error(inc.ticketNo + ': шагов ' + steps.length + ', ожидалось ' + need);
  for (const s of steps) {
    if (s.options.length !== 3) throw new Error(inc.ticketNo + ': вариантов ' + s.options.length);
    for (const o of s.options) {
      if (typeof o.time !== 'number' || o.time > 0) throw new Error(inc.ticketNo + ': time должен быть <= 0, а он ' + o.time);
      if (typeof o.trust !== 'number' || o.trust < -2 || o.trust > 2) throw new Error(inc.ticketNo + ': trust вне -2..2: ' + o.trust);
    }
  }
  const asks = inc.manager.options.filter((o) => o.asks).length;
  if (asks !== 1) throw new Error(inc.ticketNo + ': вариантов с asks ' + asks + ', нужен ровно один');
  if (inc.manager.options.some((o) => !o.ticket)) throw new Error(inc.ticketNo + ': у варианта менеджера нет ticket');
  for (const [name, step] of [['tester', inc.tester], ['engineerFix', inc.engineerFix]]) {
    if (!step) continue;
    const clean = step.options.filter((o) => !o.flaw).length;
    if (clean !== 1) throw new Error(inc.ticketNo + ' ' + name + ': без изъяна вариантов ' + clean + ', нужен ровно один');
  }
}

/* ---------- 5. бюджет минут: ноль только при всех худших решениях ---------- */
const worstOf = (inc) => [inc.manager, inc.engineer, inc.tester, inc.engineerFix, inc.managerClose]
  .filter(Boolean)
  .reduce((sum, s) => sum + Math.max(...s.options.map((o) => Math.abs(o.time || 0))), 0);
const bestOf = (inc) => [inc.manager, inc.engineer, inc.tester, inc.engineerFix, inc.managerClose]
  .filter(Boolean)
  .reduce((sum, s) => sum + Math.min(...s.options.map((o) => Math.abs(o.time || 0))), 0);

for (const r of rounds) {
  const per = Math.min(r.perTeam, r.pool.length);
  let worst = 0, best = Infinity;
  for (let t = 0; t < r.pool.length; t++) {
    const plan = [];
    for (let k = 0; k < per; k++) plan.push(r.pool[(t + k * 2) % r.pool.length]);
    const w = plan.reduce((s, i) => s + worstOf(i), 0) + (per - 1) * NOISE_WORST;
    const b = plan.reduce((s, i) => s + bestOf(i), 0);
    worst = Math.max(worst, w);
    best = Math.min(best, b);
  }
  r.budget = worst;          // при всех худших решениях ровно ноль
  r.worst = worst;
  r.best = best;
}

/* ---------- 6. пишем data.js ---------- */
const HEAD = `/* =======================================================================
   ВСЕ ТЕКСТЫ И ЦИФРЫ ИГРЫ — ЗДЕСЬ. Правьте смело, программист не нужен.
   ВНИМАНИЕ: файл собирается скриптом scripts/build-data.mjs — если правите
   руками, правьте здесь и больше скрипт не запускайте.

   Занятие — рабочая неделя: разминка и пять дней. У каждого дня свой пул
   инцидентов на общую тему; команда играет не все, а свои — у соседей
   задачи другие.

   Инцидент — пять шагов по кругу разработки:
     1) manager      менеджер принимает заявку и ставит задачу
     2) engineer     разработчик делает
     3) tester       тестировщик проверяет и возвращает с замечаниями
     4) engineerFix  разработчик доделывает
     5) managerClose менеджер закрывает перед бизнесом
   У каждого шага РОВНО ТРИ варианта.

   time  — игровые минуты (всегда <= 0), trust — доверие бизнеса (-2..+2).
   asks  — вариант менеджера, где он сначала спросил. Ровно один на инцидент.
   ticket — формулировка заявки для разработчика и тестировщика.
   flaw  — изъян решения: с ним модуль упадёт при деплое. В tester и в
           engineerFix ровно один вариант БЕЗ изъяна.
   module — конкретное решение, которое команда потом внедряет.

   budget — минуты смены на день: посчитан так, что до нуля команда доходит
   только выбирая всё самое дорогое. minutes — реальный таймер дня.
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
  { key: 'manager', name: 'Менеджер', gen: 'менеджера', job: 'Говорит с бизнесом. Ставит задачу и закрывает вопрос.' },
  { key: 'engineer', name: 'Разработчик', gen: 'разработчика', job: 'Делает задачу. Видит только то, что написано в заявке.' },
  { key: 'tester', name: 'Тестировщик', gen: 'тестировщика', job: 'Проверяет работу и возвращает задачу с замечаниями.' }
];

/* Названия команд: нейтральные, по животным. */
export const TEAM_NAMES = [
  'Бобры', 'Выдры', 'Ежи', 'Барсуки', 'Совы',
  'Лоси', 'Рыси', 'Куницы', 'Кабаны', 'Хорьки'
];

/* Шум между инцидентами: тратит минуты и ничего не требует. */
export const NOISE = [
  { label: 'Письмо', text: 'Коллеги, добрый день. Нужна выгрузка за три года. Срок — сегодня.', meta: 'Отправлено в 17:48', time: -15 },
  { label: 'Чат', text: 'А можно быстренько?', meta: '', time: -5 },
  { label: 'Служебное', text: 'Написали подрядчику. Ответ будет через три дня. Это нормально.', meta: '', time: -5 },
  { label: 'Чат', text: 'Вас добавили в чат на восемьдесят человек. Зачем — не сказали.', meta: '', time: -10 },
  { label: 'Календарь', text: 'Совещание о том, почему так много совещаний.', meta: '', time: -15 },
  { label: 'Служебное', text: 'Уволился человек, который один знал, как это работает.', meta: '', time: -5 },
  { label: 'Календарь', text: 'Окно изменений — суббота, с 02:00 до 04:00.', meta: '', time: 0 },
  { label: 'Приёмная', text: 'Приехал вендор. Продаёт систему за двести миллионов. Директор впечатлён.', meta: '', time: -10 }
];

/* ------------------------------------------------------------ инциденты */
`;

const parts = [HEAD];
for (const inc of allIncidents) parts.push(incidentBlock(inc) + '\n');

parts.push(`/* ---------------------------------------------------- дни недели */
export const ROUNDS = [`);
for (const r of rounds) {
  parts.push(`  {
    key: ${q(r.key)},
    title: ${q(r.title)},${r.trial ? '\n    trial: true,' : ''}
    perTeam: ${Math.min(r.perTeam, r.pool.length)},
    budget: ${r.budget},
    minutes: ${r.minutes},
    pool: [${r.pool.map((i) => i.key).join(', ')}]
  },`);
}
parts.push(`];

/* сколько боевых инцидентов проходит одна команда за занятие */
export const COMBAT_INCIDENTS = ROUNDS
  .filter((r) => !r.trial)
  .reduce((n, r) => n + Math.min(r.perTeam, r.pool.length), 0);
`);

fs.writeFileSync(OUT, parts.join('\n'));

console.log('\nданные собраны:');
for (const r of rounds) {
  console.log('  ' + r.title.padEnd(13) + ' пул ' + r.pool.length +
    ', по ' + Math.min(r.perTeam, r.pool.length) + ' на команду' +
    ', бюджет ' + r.budget + ' мин (лучшая игра тратит ~' + r.best + ')' +
    ', таймер ' + r.minutes + ' мин');
}
console.log('  всего инцидентов: ' + allIncidents.length);
