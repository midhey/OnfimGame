/* Поднимает сервер и клиент одной командой: npm run dev */
import { spawn } from 'node:child_process';

/* Клиент запускаем через оболочку одной строкой: на Windows npm — это .cmd,
   напрямую он не спавнится, а строка без отдельных аргументов не поднимает
   предупреждение о неэкранированных аргументах. */
const jobs = [
  { name: 'сервер', cmd: process.execPath, args: ['--watch', 'server/src/index.js'], shell: false },
  { name: 'клиент', cmd: 'npm run dev --workspace client', args: [], shell: true }
];

const kids = [];
let dying = false;

for (const job of jobs) {
  const kid = spawn(job.cmd, job.args, { shell: job.shell, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(kid);
  const tag = `[${job.name}] `;
  const pipe = (stream, to) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) if (line.trim()) to.write(tag + line + '\n');
    });
  };
  pipe(kid.stdout, process.stdout);
  pipe(kid.stderr, process.stderr);
  kid.on('exit', (code) => {
    if (dying) return;
    process.stdout.write(tag + 'остановлен, код ' + code + '\n');
    stop();
  });
}

function stop() {
  if (dying) return;
  dying = true;
  for (const kid of kids) { try { kid.kill(); } catch {} }
  setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
