#!/usr/bin/env node
// peicd100-guard CLI
//   claude-hook                     Claude Code PreToolUse hook: reads the hook JSON on stdin, prints a deny decision when blocked.
//   check [--shell bash|powershell|cmd] [--cwd DIR] -- <command>   analyse one command, print the verdict as JSON.
//   report                          summarise the block log.
// Any internal error lets the call through and is written to errors.jsonl (fail open).
import { analyzeToolCall, analyzeCommand, summarizeLog, logError, GUARD_VERSION } from '../src/guard_v0.1.0.mjs';

const [, , mode, ...rest] = process.argv;

async function stdin() {
  const chunks = []; for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

if (mode === 'claude-hook') {
  try {
    const ev = JSON.parse(await stdin());
    const v = analyzeToolCall({ toolName: ev.tool_name, input: ev.tool_input, cwd: ev.cwd, source: 'claude', sessionId: ev.session_id });
    if (v.decision === 'block') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: v.message } }));
    }
  } catch (e) {
    logError({ source: 'claude-hook', error: String(e?.stack || e) });
  }
  process.exit(0);
} else if (mode === 'check') {
  let shell = 'bash', cwd = process.cwd(); let k = 0;
  for (; k < rest.length; k++) {
    if (rest[k] === '--shell') shell = rest[++k];
    else if (rest[k] === '--cwd') cwd = rest[++k];
    else if (rest[k] === '--') { k++; break; }
    else break;
  }
  const command = rest.slice(k).join(' ');
  process.stdout.write(JSON.stringify(analyzeCommand(command, { shell, cwd }), null, 2) + '\n');
} else if (mode === 'report') {
  process.stdout.write(JSON.stringify(summarizeLog(), null, 2) + '\n');
} else {
  process.stdout.write(`peicd100-guard ${GUARD_VERSION}\nusage: peicd100-guard claude-hook | check [--shell S] [--cwd D] -- <command> | report\n`);
}
