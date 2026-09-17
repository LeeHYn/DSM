#!/bin/sh
set -eu
npm run prisma:migrate:deploy
exec node dist/main.js
