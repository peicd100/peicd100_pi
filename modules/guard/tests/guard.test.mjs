// peicd100 guard: commands from real disaster reports must be blocked; normal cleanup must pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeCommand, analyzeToolCall, normalizePath, lex, PROMPT_LINES } from '../src/guard_v0.1.0.mjs';

const MODULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = 'C:\\Home\\u';
const fakeFs = {
  existsSync: p => ['d:\\proj\\.git'].includes(String(p).toLowerCase()),
  lstatSync: () => { throw new Error('ENOENT'); },
  readdirSync: () => [],
  statSync: () => { throw new Error('ENOENT'); },
  readFileSync: () => { throw new Error('ENOENT'); },
};
const WIN = {
  platform: 'win32', home: HOME, cwd: 'D:\\proj\\sub', tmp: 'C:\\Home\\u\\AppData\\Local\\Temp', fs: fakeFs,
  config: { enabled: true, extra_protected: ['E:\\keep'] },
  env: { USERPROFILE: HOME, SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData', TEMP: 'C:\\Home\\u\\AppData\\Local\\Temp' },
};
const verdict = (cmd, shell = 'bash') => analyzeCommand(cmd, { ...WIN, shell });
const enc = s => Buffer.from(s, 'utf16le').toString('base64');

const MUST_BLOCK = [
  // [shell, command, rule]
  ['bash', 'rm -rf /', 'important'],
  ['bash', 'rm -rf /*', 'important'],
  ['bash', 'rm -rf "$STEAMROOT/"*', 'runtime-path'],
  ['bash', 'rm -rf $BUILD_DIR/', 'runtime-path'],
  ['bash', 'rm -rf ~/', 'runtime-path'],
  ['bash', 'rm -rf tests/ patches/ plan/ ~/', 'runtime-path'],
  ['bash', 'rm -rf "$(dirname "$0")/.."', 'runtime-path'],
  ['bash', 'rm -rf /d', 'important'],
  ['bash', 'rm -rf /c/Home/u', 'important'],
  ['bash', 'rm -rf C:/Home/u/Documents', 'important'],
  ['bash', 'rm -rf "D:\\proj"', 'important'],
  ['bash', 'rm -fr //?/D:/proj/', 'important'],
  ['bash', 'rm -rf ..', 'important'],
  ['bash', 'rm -rf ./*', 'glob-start'],
  ['bash', 'rm -rf *', 'glob-start'],
  ['bash', 'rm -rf E:/', 'important'],
  ['bash', 'rm -rf E:/keep', 'important'],
  ['bash', 'rm -rf "C:/Program Files"', 'important'],
  ['bash', 'rm --recursive --force /c/Windows', 'important'],
  ['bash', 'cd $DIR && rm -rf build', 'cwd-unknown'],
  ['bash', 'cd /d/proj/.. && rm -rf proj', 'important'],
  ['bash', 'powershell -Command "Remove-Item -Recurse -Force build"', 'wrapped'],
  ['bash', 'cmd /c "rd /s /q build"', 'wrapped'],
  ['bash', "bash -c 'rm -rf node_modules'", 'wrapped'],
  ['bash', 'sudo rm -rf /', 'important'],
  ['bash', '{ rm -rf /; }', 'important'],
  ['bash', 'echo $(rm -rf /c/Home/u)', 'important'],
  ['bash', 'python -c "import shutil; shutil.rmtree(\'C:/Home/u\')"', 'important'],
  ['bash', "python - <<'EOF'\nimport shutil, pathlib\nshutil.rmtree(pathlib.Path.home())\nEOF", 'important'],
  ['bash', 'python3 -c "import os; os.system(\'rd /s /q D:\\\\\\\\\')"', 'important'],
  ['bash', 'node -e "require(\'fs\').rmSync(\'D:/\', {recursive: true, force: true})"', 'important'],
  ['bash', 'find / -delete', 'important'],
  ['bash', 'find /d/proj -mindepth 1 -delete', 'important'],
  ['bash', 'find . -name x | xargs rm -rf', 'runtime-path'],
  ['bash', 'format D: /q', 'format'],
  ['bash', 'diskpart /s wipe.txt', 'format'],
  ['bash', 'dd if=/dev/zero of=/dev/sda bs=1M', 'format'],
  ['bash', 'mkfs.ext4 /dev/sdb1', 'format'],
  ['bash', "echo '{}' > ~/.claude/settings.json", 'tamper'],
  ['powershell', 'Remove-Item -Recurse -Force C:\\', 'important'],
  ['powershell', 'Remove-Item -Recurse -Force $env:TEMPDIR\\*', 'runtime-path'],
  ['powershell', 'Remove-Item D:\\proj -Recurse -Force', 'important'],
  ['powershell', 'rm -r -fo C:\\Home\\u\\Desktop', 'important'],
  ['powershell', 'Remove-Item -LiteralPath "C:\\Home\\u" -Recurse', 'important'],
  ['powershell', 'Get-ChildItem D:\\ | Remove-Item -Recurse -Force', 'important'],
  ['powershell', 'Get-ChildItem $root | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }', 'runtime-path'],
  ['powershell', 'Clear-Disk -Number 1 -RemoveData', 'format'],
  ['powershell', 'Format-Volume -DriveLetter D', 'format'],
  ['powershell', 'cmd /c rd /s /q D:\\', 'important'],
  ['powershell', 'iex "Remove-Item -Recurse C:\\Windows"', 'important'],
  ['powershell', 'powershell -NoProfile -EncodedCommand ' + enc('Remove-Item -Recurse -Force C:\\'), 'important'],
  ['powershell', 'Set-Location $x; Remove-Item -Recurse build', 'cwd-unknown'],
  ['powershell', 'robocopy C:\\empty D:\\proj /MIR', 'important'],
  ['cmd', 'rd /s /q D:\\', 'important'],
  ['cmd', 'del /s /q C:\\*', 'important'],
  ['cmd', 'rmdir /s /q %USERPROFILE%', 'runtime-path'],
];

const MUST_ALLOW = [
  ['bash', 'rm -rf node_modules'],
  ['bash', 'rm -rf dist build .next coverage'],
  ['bash', 'rm -rf D:/proj/sub/runtime/tmp'],
  ['bash', 'rm -rf /d/proj/sub/dist/*'],
  ['bash', 'rm -rf "$TMPDIR/x"'],
  ['bash', 'rm -rf /tmp/abc'],
  ['bash', 'rm file.txt'],
  ['bash', 'rm -f ~/x.txt'],
  ['bash', 'rm -f /'],
  ['bash', 'git clean -fdx'],
  ['bash', 'python -c "import shutil; shutil.rmtree(\'build\')"'],
  ['bash', 'node -e "fs.rmSync(dir, {recursive: true})"'],
  ['bash', "find . -name '*.pyc' -delete"],
  ['bash', 'find /d/proj -type d -name __pycache__ -exec rm -rf {} +'],
  ['bash', 'ls -la ~ && cat ~/.claude/settings.json'],
  ['bash', 'cp ~/.claude/settings.json /tmp/backup.json'],
  ['bash', 'echo hi > out.txt 2>&1'],
  ['bash', 'npm run build && npm test'],
  ['bash', 'env -u ANTHROPIC_BASE_URL runtime/envs/control/python.exe sf.py status'],
  ['bash', 'git log --format=%H -3'],
  ['bash', 'cd /d/proj/sub && rm -rf build'],
  ['powershell', 'Remove-Item -Recurse -Force .\\dist'],
  ['powershell', 'Remove-Item -Recurse -Force D:\\proj\\sub\\build'],
  ['powershell', 'Get-ChildItem -Recurse -Filter *.pyc | Remove-Item'],
  ['powershell', 'Remove-Item C:\\Home\\u\\file.txt'],
  ['powershell', 'Remove-Item -Recurse "$env:TEMP\\x"'],
  ['powershell', 'Get-ChildItem C:\\ | Format-Table Name'],
  ['cmd', 'rd /s /q build'],
  ['cmd', 'del /q *.log'],
];

for (const [shell, cmd, rule] of MUST_BLOCK) {
  test(`block [${shell}] ${cmd.split('\n')[0].slice(0, 70)}`, () => {
    const v = verdict(cmd, shell);
    assert.equal(v.decision, 'block', JSON.stringify(v));
    assert.equal(v.rule, rule, v.message);
    assert.match(v.message, /這個 session 之後都適用/);
  });
}
for (const [shell, cmd] of MUST_ALLOW) {
  test(`allow [${shell}] ${cmd.slice(0, 70)}`, () => {
    const v = verdict(cmd, shell);
    assert.equal(v.decision, 'allow', JSON.stringify(v));
  });
}

test('path spellings normalise to one location', () => {
  const ctx = { win: true, P: path.win32, home: HOME, cwd: 'D:\\proj\\sub', temps: ['C:\\T'] };
  const want = 'D:\\x';
  for (const p of ['/d/x', 'D:\\x', 'D:/x', '\\\\?\\D:\\x', 'd:/x/', '/cygdrive/d/x', '..\\..\\x']) assert.equal(normalizePath(p, ctx).toLowerCase(), want.toLowerCase(), p);
  assert.equal(normalizePath('~/a', ctx), 'C:\\Home\\u\\a');
});

test('heredoc body is attached to its command', () => {
  const segs = lex("python - <<'EOF'\nprint(1)\nEOF\necho done", 'bash');
  assert.equal(segs[0].heredoc, 'print(1)');
  assert.equal(segs[1].words[0].text, 'echo');
});

test('prompt lines are positive guidance without command examples', () => {
  assert.ok(PROMPT_LINES.length >= 2 && PROMPT_LINES.length <= 3);
  for (const l of PROMPT_LINES) assert.doesNotMatch(l, /rm |Remove-Item|rd \/s|-rf/);
});

test('recursive delete through a junction or symlink is blocked', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  try {
    const victim = path.join(base, 'victim'); fs.mkdirSync(victim); fs.writeFileSync(path.join(victim, 'keep.txt'), 'x');
    const work = path.join(base, 'work'); fs.mkdirSync(path.join(work, 'inner'), { recursive: true });
    fs.symlinkSync(victim, path.join(work, 'inner', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const home = path.join(base, 'home'); fs.mkdirSync(home);
    const opts = { cwd: base, home, env: { USERPROFILE: home, HOME: home }, config: { enabled: true, extra_protected: [] } };
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';
    const v = analyzeCommand(shell === 'powershell' ? `Remove-Item -Recurse -Force "${work}"` : `rm -rf "${work}"`, { ...opts, shell });
    assert.equal(v.decision, 'block', JSON.stringify(v)); assert.equal(v.rule, 'link');
    const ok = path.join(base, 'plain'); fs.mkdirSync(path.join(ok, 'a'), { recursive: true });
    assert.equal(analyzeCommand(`rm -rf "${ok}"`, { ...opts, shell: 'bash' }).decision, 'allow');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('guard files and settings are protected against tampering', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-home-'));
  try {
    const env = { USERPROFILE: home, HOME: home };
    const settings = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    fs.writeFileSync(settings, '{"hooks":{"PreToolUse":[{"hooks":[{"command":"node peicd100-guard.mjs claude-hook"}]}]}}');
    const call = (toolName, input) => analyzeToolCall({ toolName, input, cwd: home, source: 'test' }, { env, home, config: { enabled: true, extra_protected: [] } });
    assert.equal(call('Write', { file_path: settings, content: '{}' }).rule, 'tamper');
    assert.equal(call('Edit', { file_path: settings, old_string: '"command":"node peicd100-guard.mjs claude-hook"', new_string: '"command":"true"' }).rule, 'tamper');
    assert.equal(call('Write', { file_path: path.join(home, 'proj', '.claude', 'settings.local.json'), content: '{"disableAllHooks": true}' }).rule, 'tamper');
    assert.equal(call('Edit', { file_path: settings, old_string: '"hooks"', new_string: '"hooks" ' }).decision, 'allow');
    assert.equal(call('write', { path: path.join(home, '.pi', 'agent', 'config', 'peicd100-guard', 'config.json'), content: '{"enabled": false}' }).rule, 'tamper');
    assert.equal(call('Bash', { command: `rm -rf "${MODULE_DIR}"` }).rule, 'tamper');
    assert.equal(call('Bash', { command: `mv "${path.join(MODULE_DIR, 'src')}" /tmp/x` }).rule, 'tamper');
    assert.equal(call('Bash', { command: `cat "${path.join(MODULE_DIR, 'src', 'guard_v0.1.0.mjs')}"` }).decision, 'allow');
    const log = fs.readFileSync(path.join(home, '.pi', 'agent', 'config', 'peicd100-guard', 'blocks.jsonl'), 'utf8').trim().split('\n');
    assert.ok(log.length >= 6);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('disabled config lets everything through', () => {
  assert.equal(analyzeCommand('rm -rf /', { ...WIN, config: { enabled: false } }).decision, 'allow');
});

test('claude-hook CLI denies a disaster and stays silent otherwise; broken input fails open', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-cli-'));
  try {
    const bin = path.join(MODULE_DIR, 'bin', 'peicd100-guard.mjs');
    const env = { ...process.env, USERPROFILE: home, HOME: home };
    const run = input => spawnSync(process.execPath, [bin, 'claude-hook'], { input, env, encoding: 'utf8' });
    const bad = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf ~/' }, cwd: home, session_id: 's' }));
    assert.equal(bad.status, 0);
    const out = JSON.parse(bad.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    const ok = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: home }));
    assert.equal(ok.status, 0); assert.equal(ok.stdout, '');
    const broken = run('not json');
    assert.equal(broken.status, 0); assert.equal(broken.stdout, '');
    assert.ok(fs.existsSync(path.join(home, '.pi', 'agent', 'config', 'peicd100-guard', 'errors.jsonl')));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
