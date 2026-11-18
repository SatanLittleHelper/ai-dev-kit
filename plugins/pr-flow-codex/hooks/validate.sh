#!/bin/sh
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 24 ? 1 : 0)'; then
  echo 'PR-flow: требуется Node.js 24 или новее.' >&2
  exit 2
fi
cli="${0%/*}/cli.mts"
for name in cli.mts check.mts shared/commands.ts shared/body.ts shared/severity.ts; do
  if [ ! -f "${0%/*}/$name" ]; then
    echo "PR-flow: файл проверки недоступен ($name). Обнови плагин." >&2
    exit 2
  fi
done
exec node "$cli" --base "$1" --body-file "$2"
