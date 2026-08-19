#!/usr/bin/env bash
# ============================================================================
# Быстрое развёртывание «Смены» на VPS.
#
#   С локальной машины (Git Bash / Linux / macOS):
#       ./deploy.sh user@vps.example.ru            # зальёт в /opt/smena и запустит
#       ./deploy.sh user@vps.example.ru /srv/smena # свой путь
#
#   Прямо на сервере (из папки проекта):
#       ./deploy.sh --local
#
#   Переменные (необязательно, действуют при первом деплое и обновляют env):
#       SMENA_HOST_PASS=секрет  SMENA_URL=https://smena.example.ru  PORT=8787
#
# Что делает: заливает код (без node_modules/dist), ставит зависимости,
# собирает клиент, пишет /etc/smena.env (пароль генерируется, если не задан),
# ставит systemd-юнит smena.service и перезапускает его.
# Повторный запуск — просто обновление: env-файл не перетирается.
# ============================================================================
set -euo pipefail

APP_DIR_DEFAULT=/opt/smena
SERVICE=smena
ENV_FILE=/etc/smena.env

say()  { printf '\033[32m>> %s\033[0m\n' "$*"; }
die()  { printf '\033[31m!! %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- на сервере
local_deploy() {
  cd "$(dirname "$0")"

  command -v node >/dev/null || die "node не найден. Поставьте Node 20+: https://nodejs.org или nvm/NodeSource"
  node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' \
    || die "нужен Node 20+, сейчас $(node -v)"

  SUDO=""
  [ "$(id -u)" = "0" ] || SUDO="sudo"

  say "зависимости"
  npm install --no-audit --no-fund
  say "сборка клиента"
  npm run build

  # env-файл: создаётся один раз, дальше только точечно обновляется
  if [ ! -f "$ENV_FILE" ]; then
    GEN_PASS="${SMENA_HOST_PASS:-$(tr -dc a-z0-9 </dev/urandom | head -c 10 || true)}"
    say "создаю $ENV_FILE (пароль ведущего: $GEN_PASS)"
    printf 'PORT=%s\nSMENA_HOST_PASS=%s\nSMENA_URL=%s\n' \
      "${PORT:-8787}" "$GEN_PASS" "${SMENA_URL:-}" | $SUDO tee "$ENV_FILE" >/dev/null
    $SUDO chmod 600 "$ENV_FILE"
  else
    say "$ENV_FILE уже есть — не трогаю (пароль там)"
    for kv in "SMENA_HOST_PASS=${SMENA_HOST_PASS:-}" "SMENA_URL=${SMENA_URL:-}" "PORT=${PORT:-}"; do
      k="${kv%%=*}"; v="${kv#*=}"
      [ -n "$v" ] || continue
      say "обновляю $k в $ENV_FILE"
      $SUDO sed -i "s|^$k=.*|$k=$v|" "$ENV_FILE"
      grep -q "^$k=" "$ENV_FILE" || echo "$k=$v" | $SUDO tee -a "$ENV_FILE" >/dev/null
    done
  fi

  if command -v systemctl >/dev/null; then
    UNIT=/etc/systemd/system/$SERVICE.service
    say "systemd-юнит $UNIT"
    printf '[Unit]\nDescription=Smena game\nAfter=network.target\n\n[Service]\nWorkingDirectory=%s\nEnvironmentFile=%s\nExecStart=%s server/src/index.js\nRestart=always\nRestartSec=2\n\n[Install]\nWantedBy=multi-user.target\n' \
      "$PWD" "$ENV_FILE" "$(command -v node)" | $SUDO tee "$UNIT" >/dev/null
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable "$SERVICE" >/dev/null 2>&1 || true
    say "перезапуск $SERVICE"
    $SUDO systemctl restart "$SERVICE"
    sleep 1
    $SUDO systemctl --no-pager -l status "$SERVICE" | head -8 || true
  else
    say "systemd нет — запускайте вручную:"
    echo "   set -a; . $ENV_FILE; set +a; node server/src/index.js"
  fi

  PORT_NOW="$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)"
  URL_NOW="$(grep '^SMENA_URL=' "$ENV_FILE" | cut -d= -f2)"
  BASE="${URL_NOW:-http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT_NOW}"
  say "готово:"
  echo "   игроки:  $BASE"
  echo "   табло:   $BASE/#/board"
  echo "   ведущий: $BASE/#/host   (пароль — в $ENV_FILE)"
  echo "   если впереди nginx — проксируйте и вебсокет /ws (Upgrade/Connection)"
}

# ------------------------------------------------------------- с локальной
remote_deploy() {
  TARGET="$1"
  DIR="${2:-$APP_DIR_DEFAULT}"
  cd "$(dirname "$0")"

  say "заливаю код на $TARGET:$DIR"
  tar czf - \
    --exclude=node_modules --exclude='*/node_modules' \
    --exclude=client/dist --exclude=.git \
    . | ssh "$TARGET" "mkdir -p '$DIR' && tar xzf - -C '$DIR'"

  say "разворачиваю на сервере"
  ssh -t "$TARGET" "cd '$DIR' && \
    PORT='${PORT:-}' SMENA_HOST_PASS='${SMENA_HOST_PASS:-}' SMENA_URL='${SMENA_URL:-}' \
    bash deploy.sh --local"
}

# ------------------------------------------------------------------- разбор
case "${1:-}" in
  --local) local_deploy ;;
  ""|-h|--help)
    sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *) remote_deploy "$@" ;;
esac
