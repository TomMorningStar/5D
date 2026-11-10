#!/usr/bin/env bash
# Установка автозапуска на Ubuntu (один раз): ./install-ubuntu.sh
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
command -v node >/dev/null || { echo "Установите Node.js 22+ (https://nodejs.org) и запустите снова"; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан .env. Откройте его, поменяйте пароли и запустите установку снова."
  exit 1
fi
npm run setup
npm run build

cat > autostart/launch-ubuntu.sh <<EOF
#!/usr/bin/env bash
cd "$ROOT"
PORT=\$(grep -E '^PORT=' .env | cut -d= -f2); PORT=\${PORT:-3000}
if ! curl -fs "http://localhost:\$PORT/api/me" >/dev/null 2>&1; then
  mkdir -p data
  nohup node --env-file=.env server/index.js >> data/server.log 2>&1 &
  for i in \$(seq 1 40); do curl -fs "http://localhost:\$PORT/api/me" >/dev/null 2>&1 && break; sleep 0.5; done
fi
BROWSER=\$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
if [ -n "\$BROWSER" ]; then
  exec "\$BROWSER" --kiosk-printing --user-data-dir="$ROOT/data/browser-profile" --no-first-run --app="http://localhost:\$PORT"
else
  exec xdg-open "http://localhost:\$PORT"
fi
EOF
chmod +x autostart/launch-ubuntu.sh

ENTRY="[Desktop Entry]
Type=Application
Name=Номерки
Exec=$ROOT/autostart/launch-ubuntu.sh
Terminal=false"
mkdir -p ~/.config/autostart ~/.local/share/applications
echo "$ENTRY" > ~/.config/autostart/nomerki.desktop
echo "$ENTRY" > ~/.local/share/applications/nomerki.desktop
echo "Готово. После входа в систему программа запустится сама. Запустить сейчас: autostart/launch-ubuntu.sh"
