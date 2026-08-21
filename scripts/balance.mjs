/* Проверка баланса на живом сервере: сначала npm start, потом
   node scripts/balance.mjs

   Показывает три вещи:
     1) как раздаются задачи дня по номерам команд,
     2) что при всех самых вредных решениях минуты кончаются,
     3) что добросовестная игра проходит день с запасом.

   Запускать после правки текстов или цен: сразу видно, не сломался ли
   баланс дня. */
import { WebSocket } from 'ws';
import { ROUNDS, NOISE } from '../server/src/data.js';

const URL = 'ws://localhost:8787/ws';
const PASS = 'smena';
const STEPS = ['manager', 'engineer', 'tester', 'engineerFix', 'managerClose'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. раздача задач ---------- */
console.log('РАЗДАЧА ЗАДАЧ ПО КОМАНДАМ\n');
for (const r of ROUNDS) {
  const per = Math.min(r.perTeam, r.pool.length);
  const rows = [];
  for (let t = 0; t < Math.min(6, r.pool.length); t++) {
    const len = r.pool.length, groups = Math.max(Math.floor(len/per),1);
    const g = t % groups, sh = Math.floor(t/groups) % len;
    const plan = [];
    for (let k = 0; k < per; k++) plan.push(r.pool[(g*per+sh+k) % len]);
    const nos = plan.map((x) => x.ticketNo);
    if (new Set(nos).size !== nos.length) console.log('  ВНИМАНИЕ: повтор внутри команды ' + (t + 1));
    rows.push('команда ' + (t + 1) + ': ' + nos.join(', '));
  }
  console.log('  ' + r.title);
  for (const row of rows) console.log('    ' + row);
  /* пересечение соседних команд */
  const setOf = (t) => new Set(Array.from({ length: per }, (_, k) => r.pool[(t * per + k) % r.pool.length].ticketNo));
  if (r.pool.length > per) {
    const a = setOf(0), b = setOf(1);
    const common = [...a].filter((x) => b.has(x));
    console.log('    пересечение команд 1 и 2: ' + (common.length ? common.join(', ') : 'нет'));
  }
  console.log('');
}

/* ---------- клиент ---------- */
function client() {
  const ws = new WebSocket(URL);
  const c = { ws, state: null };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise((res) => ws.once('open', res));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'state') c.state = m;
  });
  c.until = async (fn, what) => {
    for (let i = 0; i < 200; i++) { if (c.state && fn(c)) return; await wait(50); }
    throw new Error('не дождался: ' + what);
  };
  return c;
}

const taskByNo = new Map();
for (const r of ROUNDS) for (const x of r.pool) taskByNo.set(x.ticketNo, x);

/* индекс шага внутри текущей задачи = сколько ходов уже отыграно после карточки задачи */
function stepIndex(feed) {
  let n = 0;
  for (let i = feed.length - 1; i >= 0; i--) {
    if (feed[i].kind === 'inc') break;
    if (feed[i].kind === 'turn' && feed[i].result) n++;
  }
  return n;
}
function currentNo(feed) {
  for (let i = feed.length - 1; i >= 0; i--) if (feed[i].kind === 'inc') return feed[i].no;
  return null;
}

/* strategy: 'worst' — самое дорогое по минутам, 'careful' — лучшее по доверию */
function chooseIndex(task, step, strategy) {
  const opts = task[STEPS[step]].options;
  let best = 0;
  for (let i = 1; i < opts.length; i++) {
    if (strategy === 'worst') {
      const worse = opts[i].trust < opts[best].trust;
      const same = opts[i].trust === opts[best].trust && Math.abs(opts[i].time) > Math.abs(opts[best].time);
      if (worse || same) best = i;
    } else {
      const better = opts[i].trust > opts[best].trust;
      const same = opts[i].trust === opts[best].trust && Math.abs(opts[i].time) < Math.abs(opts[best].time);
      if (better || same) best = i;
    }
  }
  return best;
}

async function run(strategy) {
  const host = client();
  await host.open;
  host.send({ t: 'hello' }); await wait(150);
  host.send({ t: 'host:create', pass: PASS }); await wait(250);
  const code = host.state.code;

  const ps = [];
  for (const role of [0, 1, 2]) {
    const p = client();
    await p.open;
    p.send({ t: 'hello' }); await wait(80);
    p.send({ t: 'join', code, name: 'бот' + role }); await wait(80);
    p.send({ t: 'seat', teamId: 't1', role }); await wait(80);
    ps.push(p);
  }
  host.send({ t: 'host:start' }); await wait(250);          // разминка
  const report = [];

  for (let day = 0; day < ROUNDS.length; day++) {
    await host.until((c) => c.state.phase === 'round', 'день ' + day);
    const startTime = ps[0].state.team.time;
    for (let guard = 0; guard < 400; guard++) {
      const me = ps.find((p) => p.state && p.state.team && p.state.team.yourTurn);
      if (!me) {
        if (ps[0].state.team.roundDone) break;
        await wait(40);
        continue;
      }
      const feed = me.state.team.feed;
      const task = taskByNo.get(currentNo(feed));
      const k = chooseIndex(task, stepIndex(feed), strategy);
      me.send({ t: 'pick', k });
      await wait(70);
    }
    const t = ps[0].state.team;
    report.push({
      day: ROUNDS[day].title, budget: startTime, left: t.time,
      lost: !!t.lost, modules: t.modules.length, trust: t.trust
    });
    /* активация и деплой */
    await host.until((c) => c.state.phase === 'activate', 'выбор модуля');
    if (ps[0].state.team.modules.length) { ps[0].send({ t: 'activate', k: 0 }); await wait(150); }
    host.send({ t: 'host:deploy' });
    await host.until((c) => c.state.phase === 'deploy', 'деплой');
    host.send({ t: 'host:next' }); await wait(200);
    host.send({ t: 'host:next' }); await wait(250);
  }
  await host.until((c) => c.state.phase === 'final', 'итоги');
  const fin = host.state.rating[0];
  host.ws.close(); for (const p of ps) p.ws.close();
  return { report, fin };
}

for (const strategy of ['worst', 'careful']) {
  const { report, fin } = await run(strategy);
  console.log((strategy === 'worst' ? 'ВСЕ САМЫЕ ВРЕДНЫЕ РЕШЕНИЯ' : 'ДОБРОСОВЕСТНАЯ ИГРА') + '\n');
  for (const r of report) {
    console.log('  ' + r.day.padEnd(13) + 'бюджет ' + String(r.budget).padStart(3) +
      ' -> осталось ' + String(r.left).padStart(3) +
      ', доверие ' + String(r.trust).padStart(3) +
      ', модулей ' + r.modules +
      (r.lost ? '  ДЕНЬ ПРОВАЛЕН' : ''));
  }
  console.log('  итог: ' + fin.name + ' — ' + fin.score + ' очков (уточнений ' + fin.asks +
    ', доверие ' + fin.trust + ', модулей в проде ' + fin.okModules + ')\n');
}
process.exit(0);
