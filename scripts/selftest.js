/* Сценарный тест: ведущий + игроки + табло на реальных вебсокетах.
   Запуск: сначала npm start (или npm run dev), потом node scripts/selftest.js
   Пароль ведущего берётся из SMENA_HOST_PASS (по умолчанию smena). */
import { WebSocket } from 'ws';

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
        if (i >= 0) {
          c.waiters.splice(i, 1);
          rej(new Error('таймаут: ' + label));
        }
      }, 4000);
    });
  return c;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const team = (c) => c.state && c.state.team;
const feedText = (c) =>
  team(c) && team(c).feed
    ? team(c).feed
        .map((i) =>
          [
            i.text,
            i.situation && i.situation.text,
            i.situation && (i.situation.lines || []).join(' '),
            i.action && i.action.text,
            i.result && i.result.text
          ]
            .filter(Boolean)
            .join(' ')
        )
        .join(' | ')
    : '';

/* доигрывает раунд командой из трёх клиентов [м, и, т]: ход - по turnRole */
async function playRound(trio, pickOf) {
  let guard = 0;
  while (guard++ < 160) {
    const t = team(trio[0]);
    if (!t || t.roundDone) return;
    const actor = trio[t.turnRole];
    if (!actor || !team(actor) || !team(actor).yourTurn) {
      await wait(80);
      continue;
    }
    actor.send({ t: 'pick', k: pickOf(team(actor)) });
    await wait(60);
  }
  throw new Error('раунд не доигрался за 160 шагов');
}

async function main() {
  /* --- пароль ведущего --- */
  const host = client('ведущий');
  await host.open;
  host.send({ t: 'hello' });
  await host.until((c) => c.id, 'welcome ведущего');
  host.errors = [];
  host.send({ t: 'host:create', pass: 'неверный' });
  await wait(120);
  ok(host.errors.length > 0, 'неверный пароль ведущего отклонён: «' + host.errors[0] + '»');
  host.send({ t: 'host:create', pass: PASS });
  await host.until((c) => c.state && c.state.you && c.state.you.isHost, 'создание комнаты с паролем');
  const code = host.state.code;
  out.push('Комната ' + code + ', раундов ' + host.state.roundsTotal +
    ', боевых инцидентов ' + host.state.combatTotal);
  ok(host.state.round === null && host.state.phase === 'lobby', 'ведущий в лобби');

  /* --- игроки --- */
  const names = ['Аня', 'Борис', 'Вера'];
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
  ok(host.state.teams[0].players === 3, 'команда собрана: 3 из 3');

  /* --- ведущий управляет числом команд --- */
  const teamsBefore = host.state.teams.length;
  const lastTeam = host.state.teams[teamsBefore - 1].id;
  host.send({ t: 'host:removeTeam', teamId: lastTeam });
  await host.until((c) => c.state.teams.length === teamsBefore - 1, 'пустая команда удалена');
  host.errors = [];
  host.send({ t: 'host:removeTeam', teamId: 't1' });
  await wait(120);
  ok(host.errors.some((e) => e.includes('игрок')), 'команду с игроками удалить нельзя: «' + host.errors[0] + '»');
  ps[0].errors = [];
  ps[0].send({ t: 'host:removeTeam', teamId: host.state.teams[1].id });
  await wait(120);
  ok(ps[0].errors.some((e) => e.includes('ведущий')), 'игрок команды не удаляет');
  host.send({ t: 'host:addTeam' });
  await host.until((c) => c.state.teams.length === teamsBefore, 'команда добавлена обратно');
  const tnames = host.state.teams.map((t) => t.name);
  ok(new Set(tnames).size === tnames.length, 'имена команд не дублируются: ' + tnames.join(', '));
  const tids = host.state.teams.map((t) => t.id);
  ok(new Set(tids).size === tids.length, 'id команд не дублируются');

  host.send({ t: 'host:renameTeam', teamId: 't1', name: 'Ночная смена' });
  await host.until((c) => c.state.teams[0].name === 'Ночная смена', 'команда переименована');
  host.errors = [];
  host.send({ t: 'host:renameTeam', teamId: 't2', name: 'Ночная смена' });
  await wait(120);
  ok(host.errors.some((e) => e.includes('уже есть')), 'дубль названия отклонён');
  ps[0].errors = [];
  ps[0].send({ t: 'host:renameTeam', teamId: 't1', name: 'Взлом' });
  await wait(120);
  ok(ps[0].errors.some((e) => e.includes('ведущий')), 'игрок команды не переименовывает');
  ok(host.state.teams[0].name === 'Ночная смена', 'название не изменилось от игрока');

  /* --- занятием управляет только ведущий --- */
  ps[0].errors = [];
  ps[0].send({ t: 'host:start' });
  await wait(120);
  ok(ps[0].errors.some((e) => e.includes('ведущий')), 'игрок не может начать смену: «' + ps[0].errors[0] + '»');
  ok(host.state.phase === 'lobby', 'смена так и не началась от игрока');

  /* --- табло --- */
  const board = client('табло');
  await board.open;
  board.send({ t: 'board:watch', code });
  await board.until((c) => c.state && c.state.t === 'board', 'табло подключилось');
  ok(board.state.phase === 'lobby' && board.state.teams.length >= 4, 'табло видит лобби и команды');
  ok(board.state.you === null, 'табло без личности игрока');

  /* --- разминка --- */
  host.send({ t: 'host:start' });
  await ps[0].until((c) => c.state.phase === 'round', 'старт смены');
  ok(host.state.round.trial === true, 'первый раунд — разминка');
  ok(!!host.state.roundEndsAt && host.state.roundEndsAt > Date.now(), 'реальный таймер раунда идёт');
  ok(host.state.round.minutes <= 10, 'таймер раунда не длиннее 10 минут: ' + host.state.round.minutes);
  ok(team(ps[0]).options && team(ps[0]).options.length === 3, 'у менеджера три варианта');

  /* жёсткие роли: чужой ход и пустая роль */
  ps[1].errors = [];
  ps[1].send({ t: 'pick', k: 0 });
  await wait(120);
  ok(ps[1].errors.some((e) => e.includes('ход')), 'инженер не может ходить за менеджера: «' + ps[1].errors[0] + '»');

  const before = host.state.roundEndsAt;
  host.send({ t: 'host:extend', sec: 120 });
  await host.until((c) => c.state.roundEndsAt > before, 'ведущий добавил время');
  ok(true, 'таймер продлён на +2 мин');

  await playRound(ps, (t) => 1);
  ok(team(ps[0]).roundDone, 'разминка отыграна командой');
  await host.until((c) => c.state.phase === 'rating', 'рейтинг после разминки');
  const trialAsks = host.state.rating[0].asks;
  ok(trialAsks === 1, 'уточнение разминки посчитано: ' + trialAsks);

  host.send({ t: 'host:next' });
  await ps[0].until((c) => c.state.phase === 'round' && c.state.roundIndex === 1, 'первый боевой раунд');
  ok(team(ps[0]).asks === 0 && team(ps[0]).trust === 5, 'после разминки очки обнулились');
  ok(team(ps[0]).feed.length <= 3, 'лента очищена между раундами: ' + team(ps[0]).feed.length + ' карточки');
  ok(team(ps[0]).incTotal === 4, 'в раунде четыре инцидента');

  /* --- вторая команда: одиночка с пересадкой --- */
  const solo = client('Гриша');
  await solo.open;
  solo.send({ t: 'hello' });
  await solo.until((c) => c.id, 'welcome Гриши');
  solo.send({ t: 'join', code, name: 'Гриша' });
  await solo.until((c) => c.state && c.state.you, 'вход Гриши');
  solo.send({ t: 'seat', teamId: 't2', role: 0 });
  await solo.until((c) => team(c) && team(c).yourTurn, 'Гриша сел менеджером второй команды');

  solo.send({ t: 'pick', k: 1 });
  await solo.until((c) => team(c).step === 1, 'ход Гриши сделан');
  solo.errors = [];
  solo.send({ t: 'pick', k: 0 });
  await wait(120);
  ok(solo.errors.some((e) => e.includes('свободна')), 'за пустого инженера ходить нельзя: «' + solo.errors[0] + '»');
  ok(team(solo).turnFree === true, 'клиенту видно, что роль свободна');
  solo.send({ t: 'seat', teamId: 't2', role: 1 });
  await solo.until((c) => c.state.you.role === 1 && team(c).yourTurn, 'Гриша пересел на инженера');
  solo.send({ t: 'pick', k: 1 });
  await solo.until((c) => team(c).step === 2, 'диагноз инженера сделан');
  ok(team(solo).turnRole === 1 && team(solo).yourTurn, 'у инженера второй шаг подряд — «что чинить»');
  ok(team(solo).stepTotal === 5, 'в боевом инциденте пять шагов');
  solo.send({ t: 'pick', k: 1 });
  await solo.until((c) => team(c).step === 3, 'починка выбрана');

  /* --- заявка словами менеджера + барьер --- */
  await playRound(ps, () => 1);
  ok(feedText(ps[1]).includes('задвоения по вторым весам') || feedText(ps[1]).includes('Не проходят временные пропуска') ||
     feedText(ps[1]).includes('сертификат'), 'заявка пришла словами менеджера');
  ok(host.state.phase === 'round', 'барьер держит раунд: вторая команда ещё играет');
  const bteam = board.state.teams.find((t) => t.players > 0);
  ok(Array.isArray(bteam.stepRoles) && bteam.stepRoles.length === bteam.stepTotal,
    'табло знает роли по шагам: ' + JSON.stringify(bteam.stepRoles));
  ok(typeof bteam.step === 'number' && bteam.step <= bteam.stepTotal, 'табло знает текущий шаг');

  /* --- ведущий закрывает раунд досрочно --- */
  const trustBefore = team(solo).trust;
  host.send({ t: 'host:end' });
  await host.until((c) => c.state.phase === 'rating', 'ведущий закрыл раунд');
  await solo.until((c) => team(c) && c.state.phase === 'rating', 'вторая команда увидела рейтинг');
  const soloRow = host.state.rating.find((r) => r.name === 'Смена Б');
  ok(soloRow.cut === true, 'недоигравшая команда помечена «не успели»');
  ok(soloRow.trust === Math.max(0, trustBefore - 1), 'штраф доверия за незакрытые заявки: ' + trustBefore + ' → ' + soloRow.trust);
  ok(host.state.rating[0].teamId === 't1', 'полностью отыгравшая команда выше: ' +
    host.state.rating.map((r) => r.rank + '.' + r.name + ' a' + r.asks).join(' '));
  ok(!!host.state.truth, 'разбор «на самом деле» есть у ведущего');
  ok(!!host.state.logs && host.state.logs.length > 5, 'логи занятия пишутся: ' + (host.state.logs || []).length + ' строк');
  ok(board.state.phase === 'rating' && !!board.state.rating, 'табло показывает рейтинг');

  /* --- докатываем оставшиеся раунды --- */
  let guard = 0;
  while (host.state.phase !== 'final' && guard++ < 400) {
    if (host.state.phase === 'rating') {
      host.send({ t: 'host:next' });
      await wait(150);
      continue;
    }
    /* Гришу пересаживаем на нужную роль и ходим всеми */
    const st = team(solo);
    if (st && !st.roundDone) {
      if (st.turnFree) {
        solo.send({ t: 'seat', teamId: 't2', role: st.turnRole });
        await wait(60);
      }
      if (team(solo).yourTurn) solo.send({ t: 'pick', k: 2 });
    }
    const t1 = team(ps[0]);
    if (t1 && !t1.roundDone && t1.turnRole !== null) {
      const actor = ps[t1.turnRole];
      if (actor && team(actor) && team(actor).yourTurn) actor.send({ t: 'pick', k: 1 });
    }
    await wait(80);
  }
  ok(host.state.phase === 'final', 'смена дошла до итогов, итераций ' + guard);
  const fin = host.state.rating;
  out.push('Итоги: ' + fin.map((r) =>
    `${r.rank}. ${r.name} — уточнений ${r.asks}/${host.state.combatTotal}, доверие ${r.trust}, банк ${r.bank}, инцидентов ${r.incDone}`
  ).join(' | '));
  ok(fin.every((r) => r.asks <= host.state.combatTotal), 'уточнения в пределах боевых инцидентов');
  ok(fin[0].asks >= fin[1].asks, 'сортировка по уточнениям');
  ok(board.state.phase === 'final', 'табло видит итоги');

  /* --- второй ведущий и сброс --- */
  const host2 = client('второй ведущий');
  await host2.open;
  host2.send({ t: 'hello' });
  await host2.until((c) => c.id, 'welcome второго ведущего');
  host2.errors = [];
  host2.send({ t: 'host:take', code, pass: PASS });
  await wait(150);
  ok(host2.errors.some((e) => e.includes('уже есть')), 'второго ведущего одновременно не бывает');

  host.send({ t: 'host:reset' });
  await ps[0].until((c) => c.state.phase === 'lobby', 'сброс в лобби');
  ok(host.state.teams[0].players === 3, 'роли за игроками остались после сброса');

  for (const c of [host, host2, board, solo, ...ps]) c.ws.close();
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
