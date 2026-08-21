/* Выгрузка всех дней и задач в читаемый TASKS.md — чтобы вычитывать тексты
   не в JSON, а глазами.

   Запуск: node scripts/tasks-md.mjs
   Источник — server/src/data.js (там же посчитаны бюджеты минут). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUNDS, RULES, NOISE, ROLES, TEAM_NAMES, COMBAT_INCIDENTS } from '../server/src/data.js';
import { planFor } from '../server/src/game.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'TASKS.md');

const STEPS = [
  ['manager', 'Менеджер', 'принимает заявку от бизнеса и ставит задачу'],
  ['engineer', 'Разработчик', 'делает по заявке'],
  ['tester', 'Тестировщик', 'проверяет до релиза'],
  ['engineerFix', 'Разработчик', 'доводит по замечаниям тестировщика'],
  ['managerClose', 'Менеджер', 'готовит релиз с бизнесом']
];

const min = (t) => '−' + Math.abs(t || 0) + ' мин';
const tr = (t) => (t > 0 ? '+' + t : t < 0 ? '−' + Math.abs(t) : '0');
const theme = (r) => (r.note || '').replace(/^Тема дня:\s*/, '');

/* добросовестная игра: на каждом шаге вариант с лучшим доверием */
const bestOf = (step) => step.options.reduce((a, b) => (b.trust > a.trust ? b : a), step.options[0]);
const carefulOf = (task) => STEPS
  .filter(([k]) => task[k])
  .reduce((s, [k]) => s + Math.abs(bestOf(task[k]).time || 0), 0);
const worstOf = (task) => STEPS
  .filter(([k]) => task[k])
  .reduce((s, [k]) => s + Math.max(...task[k].options.map((o) => Math.abs(o.time || 0))), 0);

const L = [];
const p = (s = '') => L.push(s);

/* ------------------------------------------------------------- шапка */
p('# Смена — все дни и задачи');
p();
p('Файл собран скриптом: `node scripts/tasks-md.mjs`. Тексты правятся в');
p('`scripts/tasks/*.json`, оттуда собирается `server/src/data.js`, а из него — этот файл.');
p('Правки прямо здесь потеряются.');
p();
p('## Как читать');
p();
p('Каждая задача — пять шагов по кругу разработки, на каждом шаге ровно три варианта.');
p('У варианта указаны цена в минутах смены и изменение доверия бизнеса.');
p();
p('| Пометка | Что значит |');
p('|---|---|');
p('| **уточнение** | менеджер сначала спросил. Ровно один такой вариант на задачу, даёт +' + RULES.score.ask + ' очков |');
p('| **изъян** | решение выглядит сделанным, но модуль с ним **упадёт на деплое**. В шагах тестировщика и доводки ровно один вариант без изъяна |');
p('| «в кавычках» после варианта | что из этого вышло — это видит команда |');
p('| Заявка | формулировка, которую увидят разработчик и тестировщик. Зависит от того, какой вариант выбрал менеджер |');
p();
p('## Правила в цифрах');
p();
p('| Параметр | Значение |');
p('|---|---|');
p('| Роли | ' + ROLES.map((r) => r.name).join(', ') + ' |');
p('| Доверие на старте | ' + RULES.startTrust + ' (границы от ' + RULES.minTrust + ' до ' + RULES.maxTrust + ') |');
p('| Боевых задач на команду за занятие | ' + COMBAT_INCIDENTS + ' |');
p('| Очки | уточнение +' + RULES.score.ask + ', доверие ×' + RULES.score.trust +
  ', модуль в проде +' + RULES.score.module + ', каждые ' + RULES.score.minutes + ' минут запаса +1 |');
p('| Штрафы | не успели по таймеру −' + RULES.lateTrustPenalty + ' доверия, минуты кончились −' +
  RULES.lostTrustPenalty + ' и день провален, упавший деплой −' + RULES.deployFailTrust + ' |');
p('| Названия команд | ' + TEAM_NAMES.join(', ') + ' |');
p();
p('Вечером менеджер выбирает один модуль из готовых задач, ведущий запускает деплой:');
p('пайплайн **сборка → тесты → выкладка → прод**. Модуль без изъяна доходит до прода,');
p('модуль с изъяном краснеет на последней стадии и откатывается.');
p();

/* --------------------------------------------------------- оглавление */
p('## Дни');
p();
p('| День | Тема | Задач в пуле | На команду | Таймер | Бюджет минут |');
p('|---|---|---|---|---|---|');
for (const r of ROUNDS) {
  p('| [' + r.title + '](#' + r.key + ') | ' +
    (theme(r) || '—') + ' | ' + r.pool.length + ' | ' +
    r.perTeam + ' | ' + r.minutes + ' мин | ' + r.budget + ' |');
}
p();
p('Шум между задачами (тратит минуты, ничего не требует): ' +
  NOISE.map((n) => '«' + n.text + '» — ' + min(n.time)).join('; ') + '.');
p();

/* ------------------------------------------------------------ по дням */
for (const round of ROUNDS) {
  p('---');
  p();
  p('<a id="' + round.key + '"></a>');
  p();
  p('# ' + round.title + (theme(round) ? ' · тема ' + theme(round) : ''));
  p();
  const careful = Math.max(...Array.from({ length: TEAM_NAMES.length }, (_, t) =>
    planFor(round, t).reduce((s, i) => s + carefulOf(round.pool[i]), 0)));
  p('Задач в пуле ' + round.pool.length + ', команда играет ' + round.perTeam + '. ' +
    'Таймер ' + round.minutes + ' мин, бюджет ' + round.budget + ' минут смены ' +
    '(добросовестная игра тратит около ' + careful + ').' +
    (round.trial ? ' Разминка — очки не считаются.' : ''));
  p();

  /* раздача по командам */
  if (round.pool.length > 1) {
    p('**Кому что достаётся**');
    p();
    p('| Команда | Задачи |');
    p('|---|---|');
    for (let t = 0; t < Math.min(6, TEAM_NAMES.length); t++) {
      p('| ' + (t + 1) + ' — ' + TEAM_NAMES[t] + ' | ' +
        planFor(round, t).map((i) => round.pool[i].ticketNo).join(', ') + ' |');
    }
    p();
  }

  p('**Задачи дня**');
  p();
  p('| Номер | Задача | Что получается (модуль) | Заказчик |');
  p('|---|---|---|---|');
  for (const task of round.pool) {
    p('| ' + task.ticketNo + ' | ' + task.title + ' | ' + task.module.name + ' | ' +
      task.manager.author + ' |');
  }
  p();

  for (const task of round.pool) {
    p('## ' + task.ticketNo + ' · ' + task.title);
    p();
    p('**Модуль:** ' + task.module.name + ' &nbsp;·&nbsp; **Заказчик:** ' + task.manager.author +
      ' &nbsp;·&nbsp; ' + task.place + ', ' + task.clock +
      (task.channel ? ' &nbsp;·&nbsp; ' + task.channel : ''));
    p();
    p('Минут на задачу: добросовестно ' + carefulOf(task) + ', при всех самых дорогих решениях ' + worstOf(task) + '.');
    p();
    task.manager.lines.forEach((line, i) => {
      if (i) p('>');
      p('> ' + line);
    });
    p();

    STEPS.forEach(([key, role, what], idx) => {
      const step = task[key];
      if (!step) return;
      p('### ' + (idx + 1) + '. ' + role + ' — ' + what);
      p();
      if (step.prompt) { p('_' + step.prompt + '_'); p(); }
      for (const o of step.options) {
        const marks = [min(o.time), 'доверие ' + tr(o.trust)];
        if (o.asks) marks.push('**уточнение**');
        if (o.flaw) marks.push('**изъян:** ' + o.flaw);
        /* два пробела на конце — перевод строки внутри пункта списка */
        p('- **' + o.label + '** · ' + marks.join(' · ') + '  ');
        p('  ' + o.result + (o.ticket ? '  ' : ''));
        if (o.ticket) p('  *Заявка:* ' + o.ticket);
      }
      p();
    });

    p('### На самом деле');
    p();
    p('> ' + task.truth);
    p();
  }
}

fs.writeFileSync(OUT, L.join('\n').replace(/\n+$/, '') + '\n');
const tasks = ROUNDS.reduce((n, r) => n + r.pool.length, 0);
console.log('TASKS.md собран: дней ' + ROUNDS.length + ', задач ' + tasks +
  ', строк ' + L.length);
