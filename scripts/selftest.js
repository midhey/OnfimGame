/* Сценарный тест: ведущий + игроки + табло на реальных вебсокетах.
   Запуск: сначала npm start, потом node scripts/selftest.js
   Пароль ведущего берётся из SMENA_HOST_PASS (по умолчанию smena). */
import { WebSocket } from 'ws';
import { ROUNDS } from '../server/src/data.js';

const URL = process.env.SMENA_URL || 'ws://localhost:8787/ws';
const PASS = process.env.SMENA_HOST_PASS || 'smena';
const out = [];
let failed = 0;

function ok(cond, label) {
  out.push((cond ? '  ок   ' : '  ПЛОХО') + '  ' + label);
  if (!cond) failed++;
}

function client(tag) {
  const ws = new WebSocket(URL);
  const c = { tag, ws, id: null, state: null, errors: [], waiters: [] };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise((res) => ws.once('open', res));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'welcome') c.id = m.playerId;
    if (m.t === 'error') c.errors.push(m.text);
    if (m.t === 'state' || m.t === 'board') c.state = m;
    c.waiters = c.waiters.filter((w) => {
      if (!w.pred(c)) return true;
      w.res();
      return false;
    });
  });
  c.until = (pred, label) =>
    new Promise((res, rej) => {
      if (pred(c)) return res();
      const w = { pred, res };
      c.waiters.push(w);
      setTimeout(() => {
        const i = c.waiters.indexOf(w);
        if (i >= 0) { c.waiters.splice(i, 1); rej(new Error('таймаут: ' + label)); }
      }, 5000);
    });
  return c;
}

const RULES_START_TRUST = 5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const team = (c) => c.state && c.state.team;
const feedText = (c) =>
  team(c) && team(c).feed
    ? team(c).feed.map((i) => [
        i.text, i.name,
        i.situation && i.situation.text,
        i.situation && (i.situation.lines || []).join(' '),
        i.action && i.action.text,
        i.result && i.result.text
      ].filter(Boolean).join(' ')).join(' | ')
    : '';

/* доигрывает день командой из трёх клиентов по turnRole */
async function playDay(trio, choose) {
  let guard = 0;
  while (guard++ < 300) {
    const t = team(trio[0]);
    if (!t || t.roundDone) return;
    if (t.turnRole === null) return;
    const actor = trio[t.turnRole];
    if (!actor || !team(actor) || !team(actor).yourTurn) { await wait(60); continue; }
    actor.send({ t: 'pick', k: choose(team(actor)) });
    await wait(50);
  }
  throw new Error('день не доигрался');
}

async function main() {
  /* --- ведущий --- */
  const host = client('ведущий');
  await host.open;
  host.send({ t: 'hello' });
  await host.until((c) => c.id, 'welcome ведущего');
  host.errors = [];
  host.send({ t: 'host:create', pass: 'неверный' });
  await wait(120);
  ok(host.errors.length > 0, 'неверный пароль ведущего отклонён');
  host.send({ t: 'host:create', pass: PASS });
  await host.until((c) => c.state && c.state.you && c.state.you.isHost, 'создание занятия');
  const code = host.state.code;
  out.push('Занятие ' + code + ': дней ' + host.state.roundsTotal +
    ', боевых инцидентов на команду ' + host.state.combatTotal);
  ok(host.state.roundsTotal === 6, 'разминка и пять дней недели: ' + host.state.roundsTotal);
  ok(host.state.teams[0].name === 'Бобры', 'команды названы по животным: ' +
    host.state.teams.map((t) => t.name).join(', '));

  /* --- игроки: полная команда и одиночка --- */
  const names = ['Аня', 'Боря', 'Вера'];
  const ps = [];
  for (const n of names) {
    const p = client(n);
    await p.open;
    p.send({ t: 'hello' });
    await p.until((c) => c.id, 'welcome ' + n);
    p.send({ t: 'join', code, name: n });
    await p.until((c) => c.state && c.state.you && c.state.you.name === n, 'вход ' + n);
    ps.push(p);
  }
  for (let i = 0; i < 3; i++) {
    ps[i].send({ t: 'seat', teamId: 't1', role: i });
    await ps[i].until((c) => c.state.you.role === i, 'место ' + names[i]);
  }
  const solo = client('Гриша');
  await solo.open;
  solo.send({ t: 'hello' });
  await solo.until((c) => c.id, 'welcome Гриши');
  solo.send({ t: 'join', code, name: 'Гриша' });
  await solo.until((c) => c.state && c.state.you, 'вход Гриши');
  solo.send({ t: 'seat', teamId: 't2', role: 0 });
  await solo.until((c) => c.state.you.role === 0, 'Гриша сел менеджером второй команды');

  /* --- табло --- */
  const board = client('табло');
  await board.open;
  board.send({ t: 'board:watch', code });
  await board.until((c) => c.state && c.state.t === 'board', 'табло подключилось');
  ok(board.state.you === null, 'табло без личности игрока');

  /* --- права ведущего --- */
  ps[0].errors = [];
  ps[0].send({ t: 'host:start' });
  await wait(120);
  ok(ps[0].errors.some((e) => e.includes('ведущий')), 'игрок не начинает смену');

  /* --- разминка --- */
  host.send({ t: 'host:start' });
  await ps[0].until((c) => c.state.phase === 'round', 'старт недели');
  ok(host.state.round.trial === true, 'первый раунд — разминка');
  ok(host.state.round.minutes <= 10, 'таймер дня не длиннее 10 минут: ' + host.state.round.minutes);
  ok(team(ps[0]).options && team(ps[0]).options.length === 3, 'у менеджера три варианта');
  const budget = team(ps[0]).time;
  ok(budget > 0, 'бюджет минут выдан: ' + budget);

  await playDay(ps, () => 1);
  /* одиночка добирает роли */
  let g2 = 0;
  while (!team(solo).roundDone && g2++ < 40) {
    const t = team(solo);
    if (t.turnFree) { solo.send({ t: 'seat', teamId: 't2', role: t.turnRole }); await wait(60); continue; }
    if (team(solo).yourTurn) { solo.send({ t: 'pick', k: 1 }); await wait(60); continue; }
    await wait(60);
  }
  await host.until((c) => c.state.phase === 'activate', 'после дня — выбор модулей');
  ok(feedText(ps[0]).includes(ROUNDS[0].pool[0].module.name), 'доведённая задача дала модуль: ' + ROUNDS[0].pool[0].module.name);
  ok(team(ps[0]).modules.length >= 1, 'модулей у команды: ' + team(ps[0]).modules.length);
  ok(team(ps[0]).modules.every((m) => m.flaw === undefined), 'изъян модуля до деплоя не показывается');
  ok(team(ps[0]).youPickModule === true, 'менеджеру дают выбрать модуль');
  ok(team(ps[1]).youPickModule === false, 'разработчику выбор модуля не дают');

  ps[1].errors = [];
  ps[1].send({ t: 'activate', k: 0 });
  await wait(120);
  ok(ps[1].errors.some((e) => e.includes('менеджер')), 'модуль выбирает только менеджер');

  ps[0].send({ t: 'activate', k: 0 });
  await ps[0].until((c) => team(c).activated === 0, 'менеджер выбрал модуль');

  /* --- деплой --- */
  host.errors = [];
  ps[0].send({ t: 'host:deploy' });
  await wait(120);
  ok(ps[0].errors.some((e) => e.includes('ведущий')), 'деплой запускает только ведущий');

  host.send({ t: 'host:deploy' });
  await ps[0].until((c) => c.state.phase === 'deploy', 'ведущий запустил деплой');
  const dep = team(ps[0]).deploy;
  ok(!!dep, 'у команды есть результат деплоя');
  ok(typeof dep.ok === 'boolean', 'деплой либо прошёл, либо упал: ' + (dep.ok ? 'прошёл' : 'упал — ' + dep.flaw));
  ok(dep.ok || !!dep.flaw, 'у упавшего деплоя названа причина');
  const trustAfter = team(ps[0]).trust;
  ok(dep.ok || trustAfter <= 5, 'упавший деплой стоил доверия');

  host.send({ t: 'host:next' });
  await host.until((c) => c.state.phase === 'rating', 'после деплоя — рейтинг');
  const r0 = host.state.rating;
  ok(r0.every((r) => typeof r.score === 'number'), 'в рейтинге есть общие очки: ' +
    r0.map((r) => r.name + ' ' + r.score).join(', '));

  host.send({ t: 'host:next' });
  await ps[0].until((c) => c.state.phase === 'round' && c.state.roundIndex === 1, 'первый боевой день');
  ok(team(ps[0]).asks === 0 && team(ps[0]).trust === 5, 'после разминки очки обнулились');
  ok(host.state.round.title === 'Понедельник', 'дни названы по неделе: ' + host.state.round.title);

  /* --- у команд разные инциденты на одну тему --- */
  const t1feed = team(ps[0]).feed.find((i) => i.kind === 'inc');
  await solo.until((c) => team(c) && team(c).feed.some((i) => i.kind === 'inc'), 'у второй команды свой день');
  const t2feed = team(solo).feed.find((i) => i.kind === 'inc');
  ok(t1feed.no !== t2feed.no,
    'у команд разные задачи: ' + t1feed.no + ' «' + t1feed.title + '» против ' + t2feed.no + ' «' + t2feed.title + '»');
  ok(team(ps[0]).incTotal === ROUNDS[1].perTeam, 'задач на команду за день: ' + team(ps[0]).incTotal);
  ok(team(ps[0]).stepTotal === 5, 'в боевой задаче пять шагов');
  ok(team(ps[0]).stepRoles.join('') === '01210', 'круг разработки: менеджер, разработчик, тестировщик, разработчик, менеджер');

  /* --- доигрываем неделю до итогов --- */
  let guard = 0;
  while (host.state.phase !== 'final' && guard++ < 900) {
    const ph = host.state.phase;
    if (ph === 'activate') {
      for (const c of [ps[0], solo]) {
        if (team(c) && team(c).youPickModule && team(c).activated === null) {
          c.send({ t: 'activate', k: 0 });
          await wait(50);
        }
      }
      host.send({ t: 'host:deploy' });
      await wait(150);
      continue;
    }
    if (ph === 'deploy' || ph === 'rating') { host.send({ t: 'host:next' }); await wait(150); continue; }
    /* ходим обеими командами */
    const t1 = team(ps[0]);
    if (t1 && !t1.roundDone && t1.turnRole !== null) {
      const actor = ps[t1.turnRole];
      if (actor && team(actor) && team(actor).yourTurn) actor.send({ t: 'pick', k: 1 });
    }
    const ts = team(solo);
    if (ts && !ts.roundDone && ts.turnRole !== null) {
      if (ts.turnFree) solo.send({ t: 'seat', teamId: 't2', role: ts.turnRole });
      else if (team(solo).yourTurn) solo.send({ t: 'pick', k: 2 });
    }
    await wait(60);
  }
  ok(host.state.phase === 'final', 'неделя доиграна до итогов, итераций ' + guard);
  const fin = host.state.rating;
  out.push('Итоги: ' + fin.map((r) =>
    r.rank + '. ' + r.name + ' — ' + r.score + ' очков (уточнений ' + r.asks +
    ', доверие ' + r.trust + ', модулей в проде ' + r.okModules + ', запас ' + r.spare + ')'
  ).join(' | '));
  ok(fin[0].score >= fin[1].score, 'лидерборд отсортирован по очкам');
  ok(fin.every((r) => r.trust >= host.state.minTrust && r.trust <= host.state.maxTrust),
    'доверие в границах ' + host.state.minTrust + '..' + host.state.maxTrust);
  ok(fin.some((r) => r.okModules > 0 || r.failModules > 0), 'модули действительно внедрялись');
  ok(fin.every((r) => r.asks <= host.state.combatTotal), 'уточнения не больше числа задач');
  ok(board.state.phase === 'final', 'табло видит итоги');

  /* --- редактирование команд и сброс --- */
  host.send({ t: 'host:reset' });
  await ps[0].until((c) => c.state.phase === 'lobby', 'сброс в лобби');
  host.send({ t: 'host:renameTeam', teamId: 't1', name: 'Ночные бобры' });
  await host.until((c) => c.state.teams[0].name === 'Ночные бобры', 'команда переименована');
  const n0 = host.state.teams.length;
  host.send({ t: 'host:removeTeam', teamId: host.state.teams[n0 - 1].id });
  await host.until((c) => c.state.teams.length === n0 - 1, 'пустая команда убрана');
  host.errors = [];
  host.send({ t: 'host:removeTeam', teamId: 't1' });
  await wait(120);
  ok(host.errors.some((e) => e.includes('игрок')), 'команду с игроками удалить нельзя');
  const fresh = host.state.teams[0];
  ok(fresh.asks === 0 && fresh.okModules === 0 && fresh.spare === 0,
    'после сброса метрики обнулены');
  ok(fresh.score === RULES_START_TRUST * host.state.score.trust,
    'очки свежей команды = стартовое доверие: ' + fresh.score);

  for (const c of [host, board, solo, ...ps]) c.ws.close();
}

main()
  .then(() => {
    console.log(out.join('\n'));
    console.log(failed ? '\nПРОВАЛЕНО проверок: ' + failed : '\nВсе проверки прошли');
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.log(out.join('\n'));
    console.error('\nсорвалось: ' + e.message);
    process.exit(1);
  });
