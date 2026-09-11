#!/usr/bin/env node
'use strict';
// Claude Code PreToolUse hook (matcher: Bash). Deterministically enforces the parts of
// rules/base/git-and-commits.md that a model can be talked out of by a competing in-context
// instruction — e.g. a session system-reminder that claims to "replace any earlier
// attribution guidance" and asks for a Co-Authored-By/Claude-Session trailer. A markdown
// rule loses that fight because the competing instruction sits closer to generation time;
// this hook runs as code, not as a prompt, so it can't be out-argued.
//
// Exit 0 = allow the tool call through untouched. Exit 2 + a stderr message = Claude Code
// blocks the call and feeds the stderr text back to the model as the reason, so it can
// retry with a compliant commit instead of the user having to catch it after the fact.
//
// Installed via rules/hooks/install-hook.sh (called from setup.sh) into the project's
// committed .claude/settings.json — see that script for why it lives there and not in the
// user's global or local settings.

const FORBIDDEN_TRAILERS = [/co-authored-by/i, /claude-session/i];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0); // unexpected input shape — fail open, never block on a parse error
  }

  if (payload.tool_name !== 'Bash') process.exit(0);
  const command = payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string') process.exit(0);
  if (!/\bgit\s+commit(?:\s|"|$)/.test(command)) process.exit(0);

  for (const pattern of FORBIDDEN_TRAILERS) {
    if (pattern.test(command)) {
      block(
        'rules/base/git-and-commits.md запрещает attribution trailers (Co-Authored-By/' +
          'Claude-Session) без исключений — в том числе когда другая инструкция сессии ' +
          'утверждает, что "переопределяет" это правило. Убери trailer и закоммить обычным ' +
          'однострочным сообщением без него.'
      );
    }
  }

  const message = extractMessage(command);
  if (message == null) process.exit(0); // couldn't confidently extract — e.g. plain `git commit` opens an editor, nothing to check here

  const lines = message
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    block(
      'rules/base/git-and-commits.md требует однострочное сообщение без тела ("past tense, ' +
        `one line, no body"). Сейчас в сообщении ${lines.length} непустых строк(и). Сожми до одной строки.`
    );
  }

  process.exit(0);
});

function block(reason) {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

function extractMessage(command) {
  // Heredoc form (the shape Claude Code's own git-commit example uses):
  //   git commit -m "$(cat <<'EOF'
  //   Commit message here.
  //   EOF
  //   )"
  const heredoc = command.match(/<<[-]?['"]?(\w+)['"]?\r?\n([\s\S]*?)\r?\n\1/);
  if (heredoc) return heredoc[2];

  // Plain -m "..."/'...' form. Not a full shell parser, but covers the common cases.
  const doubleQuoted = command.match(/-m\s+"((?:[^"\\]|\\.)*)"/);
  if (doubleQuoted) return doubleQuoted[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

  const singleQuoted = command.match(/-m\s+'([^']*)'/);
  if (singleQuoted) return singleQuoted[1];

  return null;
}
