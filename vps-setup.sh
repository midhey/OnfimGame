#!/usr/bin/env bash
# ============================================================================
# «Смена» на чистом Ubuntu VPS одной командой + автодеплой из GitHub.
#
#   ssh root@ВАШ_VPS
#   REPO=https://github.com/midhey/onfimgame DOMAIN=smena.example.ru \
#     bash <(curl -fsSL https://raw.githubusercontent.com/midhey/onfimgame/master/vps-setup.sh)
#
# Что делает: ставит git и Node 22, клонирует репозиторий в /opt/smena,
# собирает клиент, заводит systemd-службу smena, ставит Caddy с автоматическим
# HTTPS для домена и включает smena-update.timer: раз в минуту git fetch,
# появился новый коммит в main — pull, build, restart. Пуш = деплой.
#
# Переменные: REPO (обязательно), DOMAIN (для HTTPS; без него — http на :80),
# SMENA_HOST_PASS (пароль ведущего, иначе сгенерируется), BRANCH (иначе ветка по умолчанию).
# Повторный запуск безопасен. Режим `--update` использует таймер.
# ============================================================================
set -euo pipefail

APP=${SMENA_APP:-/opt/smena}
ENV_FILE=/etc/smena.env
say() { printf '\033[32m>> %s\033[0m\n' "$*"; }
die() { printf '\033[31m!! %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- --update
if [ "${1:-}" = "--update" ]; then
  # один апдейт за раз; на системах без flock просто идём дальше
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${TMPDIR:-/tmp}/smena-update.lock"
    flock -n 9 || exit 0
  fi
  cd "$APP"
  BRANCH_NOW="$(git rev-parse --abbrev-ref HEAD)"
  git fetch -q origin "$BRANCH_NOW"
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH_NOW")"
  [ "$LOCAL" = "$REMOTE" ] && exit 0
  say "обновление: $LOCAL -> $REMOTE"
  git reset --hard "origin/$BRANCH_NOW"
  if npm install --no-audit --no-fund && npm run build; then
    systemctl restart smena
    say "обновлено и перезапущено: $REMOTE"
    exit 0
  fi
  # Сборка упала: возвращаем последнюю рабочую версию, иначе Vite уже вычистил
  # dist и сайт остался бы без клиента. Следующий тик попробует снова.
  say "СБОРКА УПАЛА — откат на $LOCAL, следующая попытка через минуту"
  git reset --hard "$LOCAL"
  npm install --no-audit --no-fund || true
  npm run build || true
  systemctl restart smena
  exit 1
fi

# ---------------------------------------------------------------- установка
[ "$(id -u)" = "0" ] || die "нужен root: запустите через sudo или под root"
REPO="${REPO:-}"; DOMAIN="${DOMAIN:-}"; BRANCH="${BRANCH:-}"
[ -n "$REPO" ] || die "укажите REPO=https://github.com/логин/репозиторий"

say "пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq git curl ca-certificates >/dev/null

if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)'; then
  say "Node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
say "node $(node -v)"

if [ -d "$APP/.git" ]; then
  say "репозиторий уже есть — обновляю"
  BR="${BRANCH:-$(git -C "$APP" rev-parse --abbrev-ref HEAD)}"
  git -C "$APP" fetch origin "$BR"
  git -C "$APP" reset --hard "origin/$BR"
else
  say "клонирую $REPO"
  if [ -n "$BRANCH" ]; then git clone --branch "$BRANCH" "$REPO" "$APP"; else git clone "$REPO" "$APP"; fi
fi

say "сборка"
cd "$APP"
npm install --no-audit --no-fund
npm run build

# --- конфигурация: создаётся один раз, пароль генерируется и печатается ---
PORT=8787
[ -n "$DOMAIN" ] || PORT=80
if [ ! -f "$ENV_FILE" ]; then
  GEN_PASS="${SMENA_HOST_PASS:-$(tr -dc a-z0-9 </dev/urandom | head -c 10 || true)}"
  URL="http://$(hostname -I | awk '{print $1}')"
  [ -n "$DOMAIN" ] && URL="https://$DOMAIN"
  printf 'PORT=%s\nSMENA_HOST_PASS=%s\nSMENA_URL=%s\n' "$PORT" "$GEN_PASS" "$URL" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  say "создан $ENV_FILE"
else
  say "$ENV_FILE уже есть — пароль не трогаю"
  [ -n "${SMENA_HOST_PASS:-}" ] && sed -i "s|^SMENA_HOST_PASS=.*|SMENA_HOST_PASS=$SMENA_HOST_PASS|" "$ENV_FILE"
  # порт всегда по режиму: с доменом за Caddy — 8787, без домена — 80
  sed -i "s|^PORT=.*|PORT=$PORT|" "$ENV_FILE"
  grep -q '^PORT=' "$ENV_FILE" || echo "PORT=$PORT" >> "$ENV_FILE"
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^SMENA_URL=.*|SMENA_URL=https://$DOMAIN|" "$ENV_FILE"
  else
    sed -i "s|^SMENA_URL=.*|SMENA_URL=http://$(hostname -I | awk '{print $1}')|" "$ENV_FILE"
  fi
fi

say "служба smena"
cat > /etc/systemd/system/smena.service <<UNIT
[Unit]
Description=Smena game
After=network.target

[Service]
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server/src/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

say "автообновление из git (smena-update.timer, раз в минуту)"
cat > /etc/systemd/system/smena-update.service <<UNIT
[Unit]
Description=Smena: pull & redeploy from git

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $APP/vps-setup.sh --update
UNIT

cat > /etc/systemd/system/smena-update.timer <<UNIT
[Unit]
Description=Smena: check git every minute

[Timer]
OnBootSec=45
OnUnitActiveSec=60
AccuracySec=10

[Install]
WantedBy=timers.target
UNIT

# --- HTTPS через Caddy, только если задан домен ---
if [ -n "$DOMAIN" ]; then
  if ! command -v caddy >/dev/null; then
    say "ставлю Caddy (автоматический HTTPS)"
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  say "Caddyfile для $DOMAIN"
  cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	reverse_proxy 127.0.0.1:8787
}
CADDY
  systemctl enable --now caddy >/dev/null 2>&1 || true
  systemctl restart caddy
fi

# --- файрвол, если включён ---
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  say "ufw: открываю 22, 80, 443"
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

systemctl daemon-reload
systemctl enable --now smena >/dev/null 2>&1 || true
systemctl restart smena
systemctl enable --now smena-update.timer >/dev/null 2>&1 || true

sleep 1
systemctl --no-pager -l status smena | head -5 || true

PASS_NOW="$(grep '^SMENA_HOST_PASS=' "$ENV_FILE" | cut -d= -f2)"
URL_NOW="$(grep '^SMENA_URL=' "$ENV_FILE" | cut -d= -f2)"
say "ГОТОВО"
echo "   игроки:   $URL_NOW"
echo "   табло:    $URL_NOW/#/board"
echo "   ведущий:  $URL_NOW/#/host"
echo "   пароль ведущего: $PASS_NOW   (лежит в $ENV_FILE)"
echo "   деплой: git push — сервер подтянет сам в течение минуты"
echo "   на время мероприятия автообновление лучше выключить:"
echo "     systemctl stop smena-update.timer     (обратно: start)"
echo "   перезапуск обнуляет идущие занятия — состояние живёт в памяти"
[ -n "$DOMAIN" ] && echo "   HTTPS заработает, когда A-запись $DOMAIN укажет на этот сервер"
