/* Сервер: раздаёт собранный клиент, держит вебсокеты, тикает таймеры.
   Запуск: npm start (или npm run dev — тогда клиент поднимает Vite).
   Пароль ведущего: переменная окружения SMENA_HOST_PASS (по умолчанию smena). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { HOST_PASSWORD } from './data.js';
import { Room } from './room.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../client/dist');
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* --- комнаты --- */
const rooms = new Map();

function newCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}
function newId() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

/* --- статика --- */
function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(
      '<meta charset="utf-8"><body style="font:16px system-ui;padding:24px;max-width:38em">' +
        '<h1>Клиент не собран</h1><p>Для разработки: <code>npm run dev</code> — клиент на 5173.</p>' +
        '<p>Для занятия: <code>npm run serve</code> — соберёт клиент и раздаст отсюда.</p></body>'
    );
    return;
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST)) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  /* Клиент мог не собраться (упавший деплой) — отвечаем понятно, а не падаем */
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    res.writeHead(503, { 'Content-Type': MIME['.html'] });
    res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:24px">' +
      '<h1>Клиент собирается</h1><p>Сборка не завершена. Обновите страницу через минуту.</p></body>');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) if (net.family === 'IPv4' && !net.internal) out.push(net.address);
  }
  return out;
}
const JOIN_URL = process.env.SMENA_URL || 'http://' + (lanIPs()[0] || 'localhost') + ':' + PORT;

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function fail(ws, text) {
  send(ws, { t: 'error', text });
}
function pushOne(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.playerId) return;
  const view = room.viewFor(ws.playerId);
  if (!view) return;
  view.joinUrl = JOIN_URL;
  send(ws, view);
}
function pushRoom(room) {
  for (const ws of wss.clients) {
    if (ws.roomCode !== room.code) continue;
    if (ws.isBoard) {
      const view = room.viewBoard();
      view.joinUrl = JOIN_URL;
      send(ws, view);
    } else if (ws.playerId) {
      pushOne(ws);
    }
  }
}

const HOST_ONLY = new Set(['host:start', 'host:end', 'host:next', 'host:reset',
  'host:addTeam', 'host:removeTeam', 'host:renameTeam', 'host:extend']);

wss.on('connection', (ws) => {
  ws.playerId = null;
  ws.roomCode = null;
  ws.isBoard = false;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const t = msg && msg.t;

    /* возвращение после перезагрузки или спящего телефона */
    if (t === 'hello') {
      const id = msg.playerId || newId();
      ws.playerId = id;
      send(ws, { t: 'welcome', playerId: id });
      const room = msg.code ? rooms.get(String(msg.code)) : null;
      if (room && room.players.has(id)) {
        ws.roomCode = room.code;
        room.addPlayer(id, null, room.hostId === id);
        pushRoom(room);
      }
      return;
    }

    /* табло не имеет личности — только код */
    if (t === 'board:watch') {
      const room = rooms.get(String(msg.code || '').trim());
      if (!room) return fail(ws, 'Нет занятия с таким кодом');
      ws.isBoard = true;
      ws.roomCode = room.code;
      const view = room.viewBoard();
      view.joinUrl = JOIN_URL;
      send(ws, view);
      return;
    }

    if (!ws.playerId) return fail(ws, 'Соединение не готово, обновите страницу');

    if (t === 'host:create') {
      if (String(msg.pass || '') !== HOST_PASSWORD) return fail(ws, 'Неверный пароль ведущего');
      const code = newCode();
      const room = new Room(code);
      rooms.set(code, room);
      room.addPlayer(ws.playerId, 'Ведущий', true);
      room.log('Занятие создано, код ' + code);
      ws.roomCode = code;
      pushOne(ws);
      console.log('комната', code, 'создана');
      return;
    }

    if (t === 'host:take') {
      if (String(msg.pass || '') !== HOST_PASSWORD) return fail(ws, 'Неверный пароль ведущего');
      const room = rooms.get(String(msg.code || '').trim());
      if (!room) return fail(ws, 'Нет занятия с таким кодом');
      room.addPlayer(ws.playerId, 'Ведущий', false);
      const err = room.takeHost(ws.playerId);
      if (err) return fail(ws, err);
      ws.roomCode = room.code;
      pushRoom(room);
      return;
    }

    if (t === 'join') {
      const room = rooms.get(String(msg.code || '').trim());
      if (!room) return fail(ws, 'Нет занятия с таким кодом');
      const name = String(msg.name || '').trim().slice(0, 24);
      if (!name) return fail(ws, 'Введите имя');
      room.addPlayer(ws.playerId, name, false);
      room.becomePlayer(ws.playerId, name);
      ws.roomCode = room.code;
      pushRoom(room);
      return;
    }

    const room = rooms.get(ws.roomCode);
    if (!room) return fail(ws, 'Вы не в занятии');
    const player = room.players.get(ws.playerId);
    if (!player) return fail(ws, 'Вы не в занятии');
    /* занятием управляет только ведущий: игроки раунды не открывают */
    if (HOST_ONLY.has(t) && !player.isHost) {
      return fail(ws, 'Это может только ведущий');
    }

    let err = null;
    switch (t) {
      case 'leave':
        room.leave(ws.playerId);
        ws.roomCode = null;
        pushRoom(room);
        send(ws, { t: 'left' });
        return;
      case 'seat':
        err = room.seat(ws.playerId, String(msg.teamId), Number(msg.role));
        break;
      case 'unseat':
        room.unseat(ws.playerId);
        break;
      case 'pick':
        err = room.pick(ws.playerId, msg.k);
        break;
      case 'host:start':
        err = room.start();
        break;
      case 'host:end':
        err = room.endRound();
        break;
      case 'host:next':
        err = room.next();
        break;
      case 'host:extend':
        err = room.extend(Number(msg.sec) || 120);
        break;
      case 'host:reset':
        err = room.backToLobby();
        break;
      case 'host:addTeam':
        if (!room.addTeam()) err = 'Больше команд не бывает';
        break;
      case 'host:removeTeam':
        err = room.removeTeam(String(msg.teamId));
        break;
      case 'host:renameTeam':
        err = room.renameTeam(String(msg.teamId), msg.name);
        break;
      default:
        return;
    }
    if (err) fail(ws, err);
    pushRoom(room);
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room || !ws.playerId) return;
    const alive = [...wss.clients].some(
      (c) => c !== ws && c.playerId === ws.playerId && c.roomCode === ws.roomCode && c.readyState === 1
    );
    if (alive) return;
    room.setOffline(ws.playerId);
    pushRoom(room);
  });
});

/* реальный таймер раундов */
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.tick(now)) pushRoom(room);
  }
}, 1000);

/* мёртвые сокеты и старые пустые комнаты */
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch {}
  }
}, 25 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const live = [...wss.clients].some((c) => c.roomCode === code && c.readyState === 1);
    if (!live && now - room.createdAt > 3 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Смена — сервер на порту ' + PORT);
  console.log('  игроки:   ' + JOIN_URL);
  console.log('  табло:    ' + JOIN_URL + '/#/board');
  console.log('  ведущий:  ' + JOIN_URL + '/#/host  (пароль: ' +
    (process.env.SMENA_HOST_PASS ? 'из SMENA_HOST_PASS' : HOST_PASSWORD) + ')');
  if (!fs.existsSync(DIST)) console.log('  (клиент не собран — для разработки откройте порт 5173)');
});
