/* Правила одной команды внутри раунда. Ни сети, ни сессий — только
   «что происходит, когда роль выбрала вариант».

   Раунд — один рабочий день. У каждой команды свой набор задач из
   пула дня (тема общая, задачи разные). Задача — пять шагов по кругу
   разработки: менеджер → разработчик → тестировщик → разработчик →
   менеджер. Доведённая задача даёт МОДУЛЬ — то, что вечером внедряют.

   В конце дня менеджер выбирает ОДИН модуль на внедрение, ведущий
   запускает деплой. Модуль с изъяном падает и стоит команде доверия.
   Изъян копится из слабых решений тестировщика и разработчика и до
   деплоя команде не показывается — судить надо по своей же работе. */
import { NOISE, ROLES, RULES } from './data.js';

const clamp = (n, a, b) => (n < a ? a : n > b ? b : n);
const pad2 = (n) => (n < 10 ? '0' : '') + n;

export const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
};
export const fmtClock = (m) => {
  const x = ((m % 1440) + 1440) % 1440;
  return pad2(Math.floor(x / 60)) + ':' + pad2(x % 60);
};

/* Цепочка шагов задачи — круг разработки. */
export function stepsOf(inc) {
  const chain = [
    { role: 0, kind: 'chat', options: inc.manager.options },
    { role: 1, kind: 'ticket', options: inc.engineer.options },
    { role: 2, kind: 'ticket', options: inc.tester.options }
  ];
  if (inc.engineerFix) {
    chain.push({ role: 1, kind: 'prompt', back: true, prompt: inc.engineerFix.prompt, options: inc.engineerFix.options });
  }
  if (inc.managerClose) {
    chain.push({ role: 0, kind: 'prompt', prompt: inc.managerClose.prompt, options: inc.managerClose.options });
  }
  return chain;
}
export const stepOptions = (inc, step) => stepsOf(inc)[step].options;
export const stepRole = (inc, step) => stepsOf(inc)[step].role;

/* Какие задачи дня достаются команде по её номеру: тема одна, наборы
   разные. Соседние команды берут разные группы задач; когда группы
   кончились, набор сдвигается на одну задачу — так у команд не совпадают
   наборы, пока хватает пула. */
export function planFor(round, teamIdx) {
  const pool = round.pool;
  const len = pool.length;
  const per = Math.min(round.perTeam || 1, len);
  const groups = Math.max(Math.floor(len / per), 1);   // непересекающихся наборов в пуле
  const group = teamIdx % groups;                      // соседи берут соседние группы
  const shift = Math.floor(teamIdx / groups) % len;    // группы кончились — сдвигаем
  const out = [];
  /* подряд идущие индексы: внутри одного плана задачи не повторяются */
  for (let k = 0; k < per; k++) out.push((group * per + shift + k) % len);
  return out;
}

/* Сколько минут дать команде на день: столько, сколько стоят все самые
   дорогие решения её собственных задач плюс худшая карточка шума.
   Значит ноль достигается ровно тогда, когда выбрано всё худшее. */
const WORST_NOISE = Math.max(...NOISE.map((n) => Math.abs(n.time || 0)));

export function budgetFor(round, plan) {
  const cost = plan.reduce((sum, idx) => {
    const inc = round.pool[idx];
    return sum + stepsOf(inc).reduce(
      (s, step) => s + Math.max(...step.options.map((o) => Math.abs(o.time || 0))), 0);
  }, 0);
  return cost + Math.max(plan.length - 1, 0) * WORST_NOISE;
}

export function newTeam(id, name) {
  return {
    id,
    name,
    seats: [null, null, null],
    /* сквозные очки занятия */
    trust: RULES.startTrust,
    asks: 0,
    spare: 0,           // запас минут за закрытые раунды
    incDone: 0,         // доведённых боевых задач
    okModules: 0,       // внедрённых без падения
    failModules: 0,     // упавших при деплое
    /* состояние текущего раунда */
    time: 0,
    plan: [],           // индексы задач дня для этой команды
    planPos: 0,         // какая по счёту задача идёт
    step: 0,
    clock: 0,
    managerPick: null,
    incPicks: [],       // выбранные варианты текущей задачи
    modules: [],        // готовые модули этого раунда
    activated: null,    // индекс модуля, выбранного менеджером
    deploy: null,       // { ok, name, flaw, auto }
    feed: [],
    roundDone: false,
    lost: false,        // игровые минуты кончились — день провален
    cutByTimer: false,
    noiseUsed: [],
    history: [],
    nextItemId: 0,
    startedRound: -1
  };
}

export function resetTeamScores(team) {
  team.trust = RULES.startTrust;
  team.asks = 0;
  team.spare = 0;
  team.incDone = 0;
  team.okModules = 0;
  team.failModules = 0;
  team.time = 0;
  team.plan = [];
  team.planPos = 0;
  team.step = 0;
  team.managerPick = null;
  team.incPicks = [];
  team.modules = [];
  team.activated = null;
  team.deploy = null;
  team.feed = [];
  team.roundDone = false;
  team.lost = false;
  team.cutByTimer = false;
  team.noiseUsed = [];
  team.history = [];
  team.nextItemId = 0;
  team.startedRound = -1;
}

/* после разминки очки обнуляются, роли и места остаются */
export function resetAfterTrial(team) {
  team.trust = RULES.startTrust;
  team.asks = 0;
  team.spare = 0;
  team.incDone = 0;
  team.okModules = 0;
  team.failModules = 0;
  team.history = [];
}

function push(team, item) {
  item.id = ++team.nextItemId;
  team.feed.push(item);
  return item;
}

const incidentOf = (round, team) => round.pool[team.plan[team.planPos]] || null;

function pushIncHeader(team, round) {
  const inc = incidentOf(round, team);
  team.clock = toMin(inc.clock);
  push(team, {
    kind: 'inc',
    idx: team.planPos + 1,
    total: team.plan.length,
    no: inc.ticketNo,
    title: inc.title,
    place: inc.place,
    clock: inc.clock,
    channel: inc.channel || ''
  });
}

function pushTurn(team, round) {
  const inc = incidentOf(round, team);
  const def = stepsOf(inc)[team.step];
  const card = {
    kind: 'turn',
    role: def.role,
    roleName: ROLES[def.role].name,
    roleGen: ROLES[def.role].gen,
    situation: null,
    action: null,
    result: null
  };
  if (def.kind === 'chat') {
    card.situation = {
      type: 'chat',
      note: inc.manager.note || '',
      author: inc.manager.author || '',
      lines: inc.manager.lines.slice(),
      at: fmtClock(team.clock)
    };
  } else if (def.kind === 'prompt') {
    card.situation = { type: 'prompt', text: def.prompt, back: !!def.back, at: fmtClock(team.clock) };
  } else {
    const pick = team.managerPick === null ? 0 : team.managerPick;
    card.situation = {
      type: 'ticket',
      no: inc.ticketNo,
      status: def.role === 1 ? 'в работе' : 'на проверке',
      text: inc.manager.options[pick].ticket,
      place: inc.place,
      at: fmtClock(team.clock)
    };
  }
  push(team, card);
}

export function startRound(team, round, roundIndex, teamIdx) {
  team.startedRound = roundIndex;
  team.feed = [];
  team.nextItemId = 0;
  team.plan = planFor(round, teamIdx);
  team.time = budgetFor(round, team.plan);
  team.planPos = 0;
  team.step = 0;
  team.managerPick = null;
  team.incPicks = [];
  team.modules = [];
  team.activated = null;
  team.deploy = null;
  team.roundDone = false;
  team.lost = false;
  team.cutByTimer = false;
  team.noiseUsed = [];
  push(team, {
    kind: 'round',
    title: round.title,
    trial: !!round.trial,
    incTotal: team.plan.length
  });
  pushIncHeader(team, round);
  pushTurn(team, round);
}

function drawNoise(team) {
  const free = NOISE.map((_, i) => i).filter((i) => !team.noiseUsed.includes(i));
  const pool = free.length ? free : NOISE.map((_, i) => i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  team.noiseUsed.push(idx);
  return NOISE[idx];
}

function snapshot(team) {
  team.history.push({
    round: team.startedRound,
    asks: team.asks,
    trust: team.trust,
    spare: team.spare,
    okModules: team.okModules,
    incClosed: team.incDone
  });
}

function closeRound(team) {
  team.roundDone = true;
  team.spare += team.time;
  snapshot(team);
}

/* Игровые минуты кончились: день провален. Модули этого дня не внедряются. */
function loseRound(team) {
  team.lost = true;
  team.roundDone = true;
  team.modules = [];
  team.activated = null;
  team.trust = clamp(team.trust - RULES.lostTrustPenalty, RULES.minTrust, RULES.maxTrust);
  push(team, {
    kind: 'plate',
    text: 'Минуты смены кончились. День провален, доверие −' + RULES.lostTrustPenalty
  });
  snapshot(team);
}

/* Раунд закрыл реальный таймер: недоделанное сгорает. */
export function cutRound(team) {
  if (team.roundDone) return false;
  team.cutByTimer = true;
  team.roundDone = true;
  team.trust = clamp(team.trust - RULES.lateTrustPenalty, RULES.minTrust, RULES.maxTrust);
  push(team, { kind: 'plate', text: 'Время дня вышло. Незакрытые заявки — доверие −' + RULES.lateTrustPenalty });
  snapshot(team);
  return true;
}

/* Задача доведена — команда получила модуль. Изъян прячем до деплоя. */
function makeModule(team, inc) {
  const flawed = team.incPicks.find((o) => o && o.flaw);
  const mod = {
    no: inc.ticketNo,
    name: inc.module ? inc.module.name : inc.title,
    short: inc.module ? inc.module.short : inc.title,
    incident: inc.title,
    flaw: flawed ? flawed.flaw : null
  };
  team.modules.push(mod);
  push(team, {
    kind: 'module',
    name: mod.name,
    short: mod.short,
    incident: inc.title,
    no: inc.ticketNo
  });
}

export function applyPick(team, round, k, isTrial) {
  const inc = incidentOf(round, team);
  if (!inc || team.roundDone) return null;
  const chain = stepsOf(inc);
  const def = chain[team.step];
  if (!def) return null;
  const opt = def.options[k];
  if (!opt) return null;

  let card = null;
  for (let i = team.feed.length - 1; i >= 0; i--) {
    if (team.feed[i].kind === 'turn') { card = team.feed[i]; break; }
  }
  if (!card || card.result) return null;

  const step = team.step;
  card.action = { text: opt.label, at: fmtClock(team.clock) };
  team.clock += Math.abs(opt.time || 0);
  team.time = Math.max(0, team.time + (opt.time || 0));
  team.trust = clamp(team.trust + (opt.trust || 0), RULES.minTrust, RULES.maxTrust);
  if (step === 0) {
    team.managerPick = k;
    if (opt.asks) team.asks++;
  }
  team.incPicks.push(opt);
  card.result = { text: opt.result, at: fmtClock(team.clock), dt: opt.time || 0, dr: opt.trust || 0 };
  team.step = step + 1;

  const done = { role: def.role, label: opt.label, dt: opt.time || 0, dr: opt.trust || 0, incident: inc.title };

  /* задача отыграна */
  if (team.step === chain.length) {
    push(team, { kind: 'truth', no: inc.ticketNo, title: inc.title, place: inc.place, text: inc.truth });
    if (!isTrial) team.incDone++;
    makeModule(team, inc);
    team.incPicks = [];

    if (team.time <= 0) { loseRound(team); return done; }

    if (team.planPos < team.plan.length - 1) {
      const nz = drawNoise(team);
      team.time = Math.max(0, team.time + (nz.time || 0));
      push(team, { kind: 'noise', label: nz.label, text: nz.text, meta: nz.meta || '', dt: nz.time || 0 });
      if (team.time <= 0) { loseRound(team); return done; }
      team.planPos++;
      team.step = 0;
      team.managerPick = null;
      pushIncHeader(team, round);
      pushTurn(team, round);
    } else {
      closeRound(team);
    }
    return done;
  }

  if (team.time <= 0) { loseRound(team); return done; }
  pushTurn(team, round);
  return done;
}

/* Менеджер выбирает модуль на внедрение */
export function activate(team, k) {
  if (team.lost) return 'День провален, внедрять нечего';
  const i = Number(k);
  if (!team.modules[i]) return 'Такого модуля нет';
  team.activated = i;
  return null;
}

/* Ведущий запускает деплой: модуль с изъяном падает. */
export function runDeploy(team) {
  if (team.lost || !team.modules.length) {
    team.deploy = null;
    return null;
  }
  let auto = false;
  if (team.activated === null) { team.activated = 0; auto = true; }
  const mod = team.modules[team.activated];
  const ok = !mod.flaw;
  team.deploy = { ok, name: mod.name, short: mod.short, incident: mod.incident, flaw: mod.flaw, auto };
  if (ok) team.okModules++;
  else {
    team.failModules++;
    team.trust = clamp(team.trust - RULES.deployFailTrust, RULES.minTrust, RULES.maxTrust);
  }
  push(team, {
    kind: 'deploy',
    ok,
    name: mod.name,
    flaw: mod.flaw,
    dr: ok ? 0 : -RULES.deployFailTrust
  });
  if (team.history.length) {
    const h = team.history[team.history.length - 1];
    h.trust = team.trust;
    h.okModules = team.okModules;
  }
  return team.deploy;
}

/* Общий счёт: одна цифра из всех метрик. */
export function scoreOf(t) {
  const w = RULES.score;
  return (
    t.asks * w.ask +
    t.trust * w.trust +
    t.okModules * w.module +
    Math.round(t.spare / w.minutes)
  );
}

/* Рейтинг занятия: сначала общий счёт, при равном — уточнения. */
export function rating(teams) {
  const rows = teams.map((t) => {
    const h = t.history;
    const prev = h.length > 1 ? h[h.length - 2] : null;
    const last = h.length ? h[h.length - 1] : null;
    return {
      teamId: t.id,
      name: t.name,
      score: scoreOf(t),
      asks: t.asks,
      trust: t.trust,
      spare: t.spare,
      incDone: t.incDone,
      okModules: t.okModules,
      failModules: t.failModules,
      lost: t.lost,
      cut: t.cutByTimer,
      deploy: t.deploy ? { ok: t.deploy.ok, name: t.deploy.name, flaw: t.deploy.flaw } : null,
      players: t.seats.filter(Boolean).length,
      d: last
        ? {
            asks: last.asks - (prev ? prev.asks : 0),
            trust: last.trust - (prev ? prev.trust : RULES.startTrust),
            spare: last.spare - (prev ? prev.spare : 0),
            okModules: last.okModules - (prev ? prev.okModules : 0)
          }
        : null
    };
  });
  rows.sort((a, b) => b.score - a.score || b.asks - a.asks || b.trust - a.trust);
  let rank = 0;
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    if (!p || p.score !== r.score || p.asks !== r.asks || p.trust !== r.trust) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}
