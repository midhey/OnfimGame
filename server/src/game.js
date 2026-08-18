/* Правила одной команды внутри раунда. Ни сети, ни сессий — только
   «что происходит, когда роль выбрала вариант».

   Раунд — серия инцидентов. Каждый инцидент: менеджер → инженер →
   тестировщик, потом «на самом деле», потом карточка шума и следующий
   инцидент. Лента чистится на старте каждого раунда. */
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

export function newTeam(id, name) {
  return {
    id,
    name,
    seats: [null, null, null],
    /* сквозные очки занятия */
    trust: RULES.startTrust,
    asks: 0,
    bank: 0,            // накопленный остаток игровых минут за закрытые раунды
    incDone: 0,         // закрытых боевых инцидентов за занятие
    /* состояние текущего раунда */
    time: 0,            // игровые минуты раунда
    incIndex: 0,        // какой инцидент раунда идёт
    step: 0,            // 0 менеджер, 1 инженер, 2 тестировщик
    clock: 0,
    managerPick: null,
    feed: [],
    roundDone: false,
    outOfTime: false,   // игровое время раунда кончилось
    cutByTimer: false,  // раунд закрыл реальный таймер
    noiseUsed: [],
    history: [],        // по записи на закрытый раунд
    nextItemId: 0,
    startedRound: -1
  };
}

export function resetTeamScores(team) {
  team.trust = RULES.startTrust;
  team.asks = 0;
  team.bank = 0;
  team.incDone = 0;
  team.time = 0;
  team.incIndex = 0;
  team.step = 0;
  team.managerPick = null;
  team.feed = [];
  team.roundDone = false;
  team.outOfTime = false;
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
  team.bank = 0;
  team.incDone = 0;
  team.history = [];
}

function push(team, item) {
  item.id = ++team.nextItemId;
  team.feed.push(item);
  return item;
}

/* Цепочка шагов инцидента. Боевые: пять шагов, разминка: три. */
export function stepsOf(inc) {
  const chain = [
    { role: 0, kind: 'chat', options: inc.manager.options },
    { role: 1, kind: 'ticket', options: inc.engineer.options }
  ];
  if (inc.engineerFix) chain.push({ role: 1, kind: 'prompt', prompt: inc.engineerFix.prompt, options: inc.engineerFix.options });
  chain.push({ role: 2, kind: 'ticket', options: inc.tester.options });
  if (inc.managerClose) chain.push({ role: 0, kind: 'prompt', prompt: inc.managerClose.prompt, options: inc.managerClose.options });
  return chain;
}
export const stepOptions = (inc, step) => stepsOf(inc)[step].options;
export const stepRole = (inc, step) => stepsOf(inc)[step].role;

function curIncident(round, team) {
  return round.incidents[team.incIndex] || null;
}

function pushIncHeader(team, round) {
  const inc = curIncident(round, team);
  team.clock = toMin(inc.clock);
  push(team, {
    kind: 'inc',
    idx: team.incIndex + 1,
    total: round.incidents.length,
    no: inc.ticketNo,
    place: inc.place,
    clock: inc.clock,
    channel: inc.channel || ''
  });
}

/* Карточка хода. Менеджеру — сообщение с площадки, инженеру и
   тестировщику — заявка в формулировке менеджера. */
function pushTurn(team, round) {
  const inc = curIncident(round, team);
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
    card.situation = { type: 'prompt', text: def.prompt, at: fmtClock(team.clock) };
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

export function startRound(team, round, roundIndex) {
  team.startedRound = roundIndex;
  team.feed = [];
  team.nextItemId = 0;
  team.time = round.budget;
  team.incIndex = 0;
  team.step = 0;
  team.managerPick = null;
  team.roundDone = false;
  team.outOfTime = false;
  team.cutByTimer = false;
  team.noiseUsed = [];
  push(team, { kind: 'round', title: round.title, trial: !!round.trial, incTotal: round.incidents.length });
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

function closeRound(team, round, incidentFinished) {
  team.roundDone = true;
  team.bank += team.time;
  team.history.push({
    round: team.startedRound,
    asks: team.asks,
    trust: team.trust,
    bank: team.bank,
    incClosed: team.incIndex + (incidentFinished ? 1 : 0)
  });
}

/* Раунд закрыт реальным таймером, команда не успела. Недоигранные
   инциденты сгорают, остаток игрового времени не банкуется. */
export function cutRound(team, round) {
  if (team.roundDone) return false;
  team.cutByTimer = true;
  team.roundDone = true;
  team.trust = clamp(team.trust - RULES.lateTrustPenalty, 0, RULES.maxTrust);
  push(team, { kind: 'plate', text: 'Время раунда вышло. Незакрытые заявки — минус доверие' });
  team.history.push({
    round: team.startedRound,
    asks: team.asks,
    trust: team.trust,
    bank: team.bank,
    incClosed: team.incIndex
  });
  return true;
}

export function applyPick(team, round, k, isTrial) {
  const inc = curIncident(round, team);
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
  team.trust = clamp(team.trust + (opt.trust || 0), 0, RULES.maxTrust);
  if (step === 0) {
    team.managerPick = k;
    if (opt.asks) team.asks++;
  }
  card.result = { text: opt.result, at: fmtClock(team.clock), dt: opt.time || 0, dr: opt.trust || 0 };
  team.step = step + 1;

  const done = { role: def.role, label: opt.label, dt: opt.time || 0, dr: opt.trust || 0, incident: inc.title };

  if (team.step === chain.length) {
    push(team, { kind: 'truth', no: inc.ticketNo, title: inc.title, place: inc.place, text: inc.truth });
    if (!isTrial) team.incDone++;

    if (team.time <= 0) {
      team.outOfTime = true;
      push(team, { kind: 'plate', text: 'Игровое время раунда кончилось' });
      closeRound(team, round, true);
      return done;
    }
    if (team.incIndex < round.incidents.length - 1) {
      const nz = drawNoise(team);
      team.time = Math.max(0, team.time + (nz.time || 0));
      push(team, { kind: 'noise', label: nz.label, text: nz.text, meta: nz.meta || '', dt: nz.time || 0 });
      if (team.time <= 0) {
        team.outOfTime = true;
        push(team, { kind: 'plate', text: 'Игровое время раунда кончилось' });
        closeRound(team, round, true);
        return done;
      }
      team.incIndex++;
      team.step = 0;
      team.managerPick = null;
      pushIncHeader(team, round);
      pushTurn(team, round);
    } else {
      closeRound(team, round, true);
    }
    return done;
  }

  if (team.time <= 0) {
    team.outOfTime = true;
    push(team, { kind: 'plate', text: 'Игровое время раунда кончилось' });
    closeRound(team, round, false);
    return done;
  }
  pushTurn(team, round);
  return done;
}

/* Рейтинг занятия: уточнения → доверие → банк игровых минут. */
export function rating(teams) {
  const rows = teams.map((t) => {
    const h = t.history;
    const prev = h.length > 1 ? h[h.length - 2] : null;
    const last = h.length ? h[h.length - 1] : null;
    return {
      teamId: t.id,
      name: t.name,
      asks: t.asks,
      trust: t.trust,
      bank: t.bank,
      incDone: t.incDone,
      cut: t.cutByTimer,
      outOfTime: t.outOfTime,
      players: t.seats.filter(Boolean).length,
      d: last
        ? {
            asks: last.asks - (prev ? prev.asks : 0),
            trust: last.trust - (prev ? prev.trust : RULES.startTrust),
            bank: last.bank - (prev ? prev.bank : 0)
          }
        : null
    };
  });
  rows.sort((a, b) => b.asks - a.asks || b.trust - a.trust || b.bank - a.bank);
  let rank = 0;
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    if (!p || p.asks !== r.asks || p.trust !== r.trust || p.bank !== r.bank) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}
