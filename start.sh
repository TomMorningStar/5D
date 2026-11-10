#!/usr/bin/env bash
# Запуск на Ubuntu: ./start.sh
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан файл .env - откройте его, поменяйте пароли и запустите снова."
  exit 1
fi
[ -d server/node_modules ] || npm run setup
[ -d client/dist ] || npm run build
npm start
