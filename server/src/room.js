/* Комната = одно занятие: ведущий, игроки, команды, раунды, табло, логи.
   Состояние живёт в памяти процесса: занятие идёт час, база не нужна. */
import { COMBAT_INCIDENTS, ROLES, ROUNDS, RULES, TEAM_NAMES } from './data.js';
import {
  applyPick, cutRound, newTeam, rating, resetAfterTrial, resetTeamScores,
  startRound, stepOptions, stepRole, stepsOf
} from './game.js';

const STARTING_TEAMS = 4;
const LOG_KEEP = 250;

const hhmmss = (ts) => new Date(ts).toTimeString().slice(0, 8);

export class Room {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';
    this.roundIndex = -1;
    this.roundEndsAt = null;
    this.players = new Map();
    this.teams = [];
    this.hostId = null;
    this.teamSeq = 0;
    this.logs = [];
    this.createdAt = Date.now();
    for (let i = 0; i < STARTING_TEAMS; i++) this.addTeam();
  }

  round() {
    return this.roundIndex >= 0 ? ROUNDS[this.roundIndex] : null;
  }

  /* роль, чей сейчас ход у команды; null — инцидентов больше нет */
  turnRoleOf(team) {
    const r = this.round();
    if (!r || team.roundDone) return null;
    const inc = r.incidents[team.incIndex];
    if (!inc) return null;
    const chain = stepsOf(inc);
    return team.step < chain.length ? chain[team.step].role : null;
  }

  log(text, teamName) {
    this.logs.push({ at: hhmmss(Date.now()), team: teamName || '', text });
    if (this.logs.length > LOG_KEEP) this.logs.splice(0, this.logs.length - LOG_KEEP);
  }

  addTeam() {
    if (this.teams.length >= TEAM_NAMES.length) return null;
    const name = TEAM_NAMES.find((n) => !this.teams.some((t) => t.name === n));
    if (!name) return null;
    const team = newTeam('t' + (++this.teamSeq), name);
    this.teams.push(team);
    return team;
  }

  /* Переименовать команду можно в любой момент — это только ярлык */
  renameTeam(teamId, name) {
    const team = this.team(teamId);
    if (!team) return 'Команда не найдена';
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return 'Пустое название';
    if (this.teams.some((t) => t !== team && t.name === clean)) return 'Такая команда уже есть';
    const was = team.name;
    team.name = clean;
    this.log('переименована из «' + was + '»', clean);
    return null;
  }

  /* Убрать можно только пустую команду и только в лобби */
  removeTeam(teamId) {
    if (this.phase !== 'lobby') return 'Команды меняют только в лобби';
    const team = this.team(teamId);
    if (!team) return 'Команда не найдена';
    if (team.seats.some(Boolean)) return 'В команде есть игроки';
    if (this.teams.length <= 1) return 'Должна остаться хотя бы одна команда';
    this.teams.splice(this.teams.indexOf(team), 1);
    this.log('Команда убрана', team.name);
    return null;
  }

  team(id) {
    return this.teams.find((t) => t.id === id) || null;
  }

  activeTeams() {
    return this.teams.filter((t) => t.seats.some(Boolean));
  }

  /* --- игроки --- */
  addPlayer(id, name, isHost) {
    const existing = this.players.get(id);
    if (existing) {
      existing.online = true;
      if (name) existing.name = name;
      return existing;
    }
    const player = { id, name: name || 'Без имени', teamId: null, role: null, online: true, isHost: !!isHost };
    if (isHost) this.hostId = id;
    this.players.set(id, player);
    return player;
  }

  setOffline(id) {
    const p = this.players.get(id);
    if (p) p.online = false;
  }

  hasHost() {
    const h = this.hostId ? this.players.get(this.hostId) : null;
    return !!(h && h.online);
  }

  leave(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.unseat(playerId);
    if (p.isHost || this.hostId === playerId) this.hostId = null;
    this.players.delete(playerId);
    if (!p.isHost) this.log(p.name + ' вышел из занятия');
  }

  takeHost(playerId) {
    if (this.hasHost()) return 'У этого занятия уже есть ведущий';
    const p = this.players.get(playerId);
    if (!p) return 'Игрок не найден';
    this.unseat(playerId);
    p.isHost = true;
    if (!p.name || p.name === 'Без имени') p.name = 'Ведущий';
    this.hostId = playerId;
    this.log('Ведущий подключился');
    return null;
  }

  becomePlayer(playerId, name) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.isHost || this.hostId === playerId) {
      p.isHost = false;
      this.hostId = null;
    }
    if (name) p.name = name;
  }

  /* Место можно занять в лобби и по ходу раунда (только свободное).
     Ушедший игрок место не освобождает — он вернётся. */
  seat(playerId, teamId, role) {
    if (this.phase !== 'lobby' && this.phase !== 'round') return 'Сейчас место занять нельзя';
    const player = this.players.get(playerId);
    const team = this.team(teamId);
    if (!player || !team) return 'Команда не найдена';
    if (player.isHost) return 'Ведущий не играет';
    if (role < 0 || role > 2) return 'Такой роли нет';
    const taken = team.seats[role];
    if (taken && taken !== playerId) return 'Роль уже занята';

    this.unseat(playerId);
    team.seats[role] = playerId;
    player.teamId = team.id;
    player.role = role;
    this.log(player.name + ' — ' + ROLES[role].name.toLowerCase(), team.name);
    if (this.phase === 'round') this.ensureRound(team);
    return null;
  }

  unseat(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    for (const team of this.teams) {
      for (let r = 0; r < 3; r++) if (team.seats[r] === playerId) team.seats[r] = null;
    }
    player.teamId = null;
    player.role = null;
  }

  /* --- раунды --- */
  ensureRound(team) {
    if (this.roundIndex < 0 || team.startedRound === this.roundIndex) return;
    startRound(team, this.round(), this.roundIndex);
  }

  startRoundAll(i) {
    this.roundIndex = i;
    this.phase = 'round';
    const r = ROUNDS[i];
    this.roundEndsAt = Date.now() + r.minutes * 60 * 1000;
    for (const team of this.activeTeams()) this.ensureRound(team);
    this.log('Начался ' + r.title.toLowerCase() + ' — ' + r.incidents.length +
      ' инцидент(а), ' + r.minutes + ' мин таймера');
  }

  start() {
    if (this.phase !== 'lobby') return 'Смена уже идёт';
    if (!this.activeTeams().length) return 'Ни одной команды с игроками';
    this.startRoundAll(0);
    return null;
  }

  /* Жёсткая ролевая система: ход делает только владелец роли.
     Пустую роль сперва надо занять. */
  pick(playerId, k) {
    if (this.phase !== 'round') return 'Раунд не идёт';
    const player = this.players.get(playerId);
    if (!player) return 'Игрок не найден';
    const team = this.team(player.teamId);
    if (!team) return 'Вы не в команде';
    if (team.roundDone) return 'Раунд для команды закончен';
    const role = this.turnRoleOf(team);
    if (role === null) return 'Раунд для команды закончен';
    const seatOwner = team.seats[role];
    if (seatOwner === null) return 'Роль ' + ROLES[role].gen + ' свободна — сначала займите её';
    if (seatOwner !== player.id) return 'Сейчас ход ' + ROLES[role].gen;

    const done = applyPick(team, this.round(), Number(k), !!this.round().trial);
    if (!done) return 'Такого варианта нет';
    this.log(
      ROLES[done.role].name + ' (' + player.name + '): «' + done.label + '» · ' +
        (done.dt || 0) + ' мин' + (done.dr ? ', доверие ' + (done.dr > 0 ? '+' : '') + done.dr : ''),
      team.name
    );
    if (team.roundDone) {
      this.log(team.outOfTime
        ? 'игровое время вышло, закрыто инцидентов: ' + team.incIndex
        : 'раунд отыгран полностью', team.name);
    }
    this.checkBarrier();
    return null;
  }

  checkBarrier() {
    const active = this.activeTeams();
    if (active.length && active.every((t) => t.roundDone)) this.toRating();
  }

  toRating() {
    this.phase = 'rating';
    this.roundEndsAt = null;
  }

  /* тик реального таймера: раунд закрывается сам */
  tick(now) {
    if (this.phase !== 'round' || !this.roundEndsAt || now < this.roundEndsAt) return false;
    for (const team of this.activeTeams()) {
      if (cutRound(team, this.round())) {
        this.log('не успели по таймеру, закрыто инцидентов: ' + team.incIndex + ', доверие −1', team.name);
      }
    }
    this.toRating();
    this.log('Раунд закрыт по таймеру');
    return true;
  }

  extend(sec) {
    if (this.phase !== 'round' || !this.roundEndsAt) return 'Раунд не идёт';
    this.roundEndsAt += sec * 1000;
    this.log('Ведущий добавил ' + Math.round(sec / 60) + ' мин к таймеру');
    return null;
  }

  endRound() {
    if (this.phase !== 'round') return 'Раунд не идёт';
    for (const team of this.activeTeams()) {
      if (cutRound(team, this.round())) {
        this.log('раунд закрыт ведущим досрочно, закрыто инцидентов: ' + team.incIndex, team.name);
      }
    }
    this.toRating();
    this.log('Ведущий закрыл раунд');
    return null;
  }

  next() {
    if (this.phase !== 'rating') return 'Сейчас не рейтинг';
    if (this.round() && this.round().trial) {
      for (const team of this.teams) resetAfterTrial(team);
      this.log('Разминка окончена, очки обнулены');
    }
    if (this.roundIndex >= ROUNDS.length - 1) {
      this.phase = 'final';
      this.log('Смена закончена');
      return null;
    }
    this.startRoundAll(this.roundIndex + 1);
    return null;
  }

  backToLobby() {
    this.phase = 'lobby';
    this.roundIndex = -1;
    this.roundEndsAt = null;
    for (const team of this.teams) resetTeamScores(team);
    this.log('Занятие сброшено в лобби');
    return null;
  }

  /* --- представления --- */
  teamStatus(team) {
    const players = team.seats.filter(Boolean).length;
    if (this.phase === 'lobby') return players ? players + ' из 3' : 'пусто';
    if (!players) return 'не играет';
    if (this.phase === 'round') {
      if (team.roundDone) return team.cutByTimer ? 'не успели' : 'готово';
      const role = this.turnRoleOf(team);
      return role === null ? 'готово' : 'ход ' + ROLES[role].gen;
    }
    return '';
  }

  teamCard(team) {
    const r = this.round();
    const inc = r ? r.incidents[team.incIndex] : null;
    const chain = inc ? stepsOf(inc) : [];
    return {
      id: team.id,
      name: team.name,
      seats: team.seats.map((pid) => {
        const p = pid ? this.players.get(pid) : null;
        return p ? { name: p.name, online: p.online } : null;
      }),
      players: team.seats.filter(Boolean).length,
      time: team.time,
      trust: team.trust,
      asks: team.asks,
      bank: team.bank,
      incIndex: team.incIndex,
      incTotal: r ? r.incidents.length : 0,
      step: team.step,
      stepTotal: chain.length,
      stepRoles: chain.map((s) => s.role),
      roundDone: team.roundDone,
      cut: team.cutByTimer,
      status: this.teamStatus(team)
    };
  }

  baseView(player) {
    const r = this.round();
    return {
      t: 'state',
      code: this.code,
      phase: this.phase,
      roundIndex: this.roundIndex,
      roundsTotal: ROUNDS.length,
      combatTotal: COMBAT_INCIDENTS,
      roundEndsAt: this.roundEndsAt,
      maxTrust: RULES.maxTrust,
      hasHost: this.hasHost(),
      roles: ROLES.map((x) => ({ key: x.key, name: x.name, gen: x.gen, job: x.job })),
      round: r
        ? { title: r.title, trial: !!r.trial, incTotal: r.incidents.length, budget: r.budget, minutes: r.minutes }
        : null,
      you: player
        ? {
            id: player.id, name: player.name, isHost: player.isHost,
            teamId: player.teamId, role: player.role,
            canHost: player.isHost || !this.hasHost()
          }
        : null,
      teams: this.teams.map((t) => this.teamCard(t)),
      team: null,
      rating: null,
      truth: null,
      hostStats: null,
      logs: null
    };
  }

  viewFor(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    const view = this.baseView(player);
    const r = this.round();
    const team = this.team(player.teamId);

    if (team && team.startedRound === this.roundIndex && r) {
      const inc = r.incidents[team.incIndex] || null;
      const role = this.turnRoleOf(team);
      const seatOwner = role !== null ? team.seats[role] : null;
      const yourTurn =
        this.phase === 'round' && !team.roundDone && role !== null && seatOwner === player.id;
      view.team = {
        id: team.id,
        name: team.name,
        time: team.time,
        trust: team.trust,
        asks: team.asks,
        bank: team.bank,
        incIndex: team.incIndex,
        incTotal: r.incidents.length,
        step: team.step,
        feed: team.feed,
        roundDone: team.roundDone,
        cut: team.cutByTimer,
        stepTotal: inc ? stepsOf(inc).length : 0,
        turnRole: role,
        turnName: role !== null ? ROLES[role].gen : null,
        turnFree: role !== null && seatOwner === null,
        turnWho: seatOwner ? ((this.players.get(seatOwner) || {}).name || null) : null,
        yourTurn,
        options: yourTurn && inc ? stepOptions(inc, team.step).map((o) => ({ label: o.label })) : null
      };
    } else if (team) {
      view.team = this.teamCard(team);
      view.team.feed = team.feed;
      view.team.yourTurn = false;
      view.team.options = null;
    }

    if (this.phase === 'rating' || this.phase === 'final') {
      view.rating = rating(this.activeTeams());
    }
    /* разбор последнего инцидента раунда — на экран рейтинга */
    if (this.phase === 'rating' && r) {
      const inc = r.incidents[r.incidents.length - 1];
      view.truth = { no: inc.ticketNo, title: inc.title, place: inc.place, text: inc.truth };
    }

    if (player.isHost) {
      const all = [...this.players.values()].filter((p) => !p.isHost);
      const active = this.activeTeams();
      view.hostStats = {
        players: all.length,
        online: all.filter((p) => p.online).length,
        seated: all.filter((p) => p.teamId).length,
        teamsActive: active.length,
        teamsDone: active.filter((t) => t.roundDone).length,
        waiting: all.filter((p) => !p.teamId && p.online).map((p) => p.name)
      };
      view.logs = this.logs.slice(-80).reverse();
    }

    return view;
  }

  /* табло: общий экран без личных данных */
  viewBoard() {
    const view = this.baseView(null);
    view.t = 'board';
    if (this.phase === 'rating' || this.phase === 'final') {
      view.rating = rating(this.activeTeams());
    }
    if (this.phase === 'rating') {
      const r = this.round();
      if (r) {
        const inc = r.incidents[r.incidents.length - 1];
        view.truth = { no: inc.ticketNo, title: inc.title, place: inc.place, text: inc.truth };
      }
    }
    return view;
  }
}
