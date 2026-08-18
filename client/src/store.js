import { reactive } from 'vue';

const KEY = 'smena.web.v2';

export const S = reactive({
  conn: 'wait',      // wait | live | lost
  view: null,        // последний снимок состояния с сервера
  error: '',
  page: pageFromHash(),   // play | host | board
  nowSec: Date.now(),     // тикает раз в полсекунды — для таймера раунда
  me: load()
});

function pageFromHash() {
  const h = location.hash || '';
  if (h.startsWith('#/host')) return 'host';
  if (h.startsWith('#/board')) return 'board';
  return 'play';
}
window.addEventListener('hashchange', () => {
  S.page = pageFromHash();
  /* табло живёт без личности: при заходе на него переподписываемся */
  if (S.page === 'board' && S.me.boardCode) watchBoard(S.me.boardCode);
});
setInterval(() => { S.nowSec = Date.now(); }, 500);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { playerId: null, code: null, name: '', boardCode: '' };
}
function keep() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S.me));
  } catch {}
}

let ws = null;
let tries = 0;
let errorTimer = null;

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');

  ws.onopen = () => {
    tries = 0;
    S.conn = 'live';
    if (S.page === 'board') {
      if (S.me.boardCode) watchBoard(S.me.boardCode);
    } else {
      send({ t: 'hello', playerId: S.me.playerId, code: S.me.code });
    }
  };
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === 'welcome') {
      S.me.playerId = msg.playerId;
      keep();
      return;
    }
    if (msg.t === 'error') {
      showError(msg.text);
      return;
    }
    if (msg.t === 'left') {
      forget();
      return;
    }
    if (msg.t === 'state' || msg.t === 'board') {
      S.view = msg;
      if (msg.t === 'state' && msg.code !== S.me.code) {
        S.me.code = msg.code;
        keep();
      }
    }
  };
  ws.onclose = () => {
    S.conn = 'lost';
    tries++;
    setTimeout(connect, Math.min(500 * tries, 4000));
  };
  ws.onerror = () => {};
}

export function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function watchBoard(code) {
  S.me.boardCode = code;
  keep();
  send({ t: 'board:watch', code });
}

export function showError(text) {
  S.error = text;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => (S.error = ''), 4000);
}

export function forget() {
  S.me = { playerId: S.me.playerId, code: null, name: S.me.name, boardCode: S.me.boardCode };
  S.view = null;
  keep();
}

export function leave(question) {
  if (question && !confirm(question)) return;
  send({ t: 'leave' });
  forget();
}

/* остаток реального таймера раунда, секунд; null — таймера нет */
export function timerLeft() {
  const v = S.view;
  if (!v || !v.roundEndsAt) return null;
  return Math.max(0, Math.round((v.roundEndsAt - S.nowSec) / 1000));
}
export function fmtTimer(sec) {
  if (sec === null) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
