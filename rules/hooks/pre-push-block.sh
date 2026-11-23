# >>> ai-dev-kit flow-guard >>>
# Не даёт отправить ветку, пока у её задачи flow не закрыты стадии simplify, check, local-test, review. Проверяются ветка-источник
# и ветка-назначение каждой строки stdin git, а не текущая ветка. Обходится git push --no-verify.
if flow_refs_file="$(mktemp 2>/dev/null)" && cat >"$flow_refs_file"; then
  exec 0<"$flow_refs_file"
  flow_cli="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/ai-dev-kit/plugins/kit/tools/flow/cli/main.mts"
  flow_deny=""
  flow_check() {
    flow_code=0
    flow_out="$(node "$flow_cli" guard push "$@" --text </dev/null 2>/dev/null)" || flow_code=$?
    if [ "$flow_code" -eq 3 ]; then
      flow_deny="$flow_deny$flow_out
"
    fi
  }
  if [ -f "$flow_cli" ] && command -v node >/dev/null 2>&1; then
    while read -r flow_local_ref flow_local_sha flow_remote_ref flow_remote_sha; do
      case "$flow_local_sha" in
        *[!0]*)
          case "$flow_local_ref" in
            refs/heads/*) flow_check --branch "${flow_local_ref#refs/heads/}" ;;
            HEAD) flow_check ;;
          esac
          case "$flow_remote_ref" in
            refs/heads/*) [ "$flow_remote_ref" = "$flow_local_ref" ] || flow_check --branch "${flow_remote_ref#refs/heads/}" ;;
          esac
          ;;
      esac
    done <"$flow_refs_file"
  fi
  rm -f "$flow_refs_file"
  if [ -n "$flow_deny" ]; then
    printf '%s' "$flow_deny" >&2
    exit 1
  fi
else
  # Не удалось сохранить stdin: проверка пропускается (fail-open). Если сбой случился при записи, а не в mktemp, часть stdin уже прочитана.
  [ -z "${flow_refs_file:-}" ] || rm -f "$flow_refs_file"
fi
# <<< ai-dev-kit flow-guard <<<
