// peicd100 guard 0.1.0 — blocks only large-scale disasters (recursive deletes of important locations,
// disk formatting, runtime-resolved delete paths, deletes wrapped in nested shells, deletes through
// junctions/symlinks) and tampering with the guard itself. Everything else passes.
// Shared by the Pi extension (tool_call) and the Claude Code PreToolUse hook (bin/peicd100-guard.mjs).
// No UI prompts: a blocked call gets a short reason and a suggested rewrite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD_VERSION = '0.1.0';
export const MARKER = 'peicd100-guard';
const SESSION_NOTE = '這條規則在這個 session 之後都適用。';

// Positive guidance only (never write dangerous command examples into prompts).
export const PROMPT_LINES = [
  '刪除資料夾時，寫出要刪的那一層的明確絕對路徑，只刪專案內或暫存資料夾裡要清掉的東西。',
  '刪除直接在目前的 shell 執行，路徑先算好再寫進指令，不靠變數或萬用字元在執行時決定。',
  '要移除的資料夾裡有 junction 或 symlink 時，先單獨移除連結，再刪資料夾。',
];

const MODULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(MODULE_DIR, '..', '..');

// ---------------------------------------------------------------- environment
function homeDir(env) { return env.USERPROFILE || env.HOME || os.homedir(); }
export function guardHome(env = process.env) { return path.join(homeDir(env), '.pi', 'agent', 'config', 'peicd100-guard'); }

export function loadConfig(env = process.env) {
  const file = path.join(guardHome(env), 'config.json');
  const base = { enabled: true, extra_protected: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...base, ...raw, extra_protected: Array.isArray(raw.extra_protected) ? raw.extra_protected : [] };
  } catch { return base; }
}

function appendJsonl(name, row, env = process.env) {
  try {
    const dir = guardHome(env); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, name), JSON.stringify(row) + '\n');
  } catch { /* logging must never break the tool */ }
}
export function logBlock(row, env) { appendJsonl('blocks.jsonl', { at: new Date().toISOString(), version: GUARD_VERSION, ...row }, env); }
export function logError(row, env) { appendJsonl('errors.jsonl', { at: new Date().toISOString(), version: GUARD_VERSION, ...row }, env); }

// ---------------------------------------------------------------- paths
function makeCtx(opts = {}) {
  const env = opts.env || process.env;
  const win = (opts.platform || process.platform) === 'win32';
  const P = win ? path.win32 : path.posix;
  const home = P.resolve(opts.home || homeDir(env));
  const cwd = P.resolve(opts.cwd || process.cwd());
  const temps = [opts.tmp || os.tmpdir(), env.TEMP, env.TMP, env.TMPDIR].filter(Boolean).map(t => P.resolve(t));
  if (!win) temps.push('/tmp');
  return { env, win, P, home, cwd, temps, config: opts.config || loadConfig(env), fsx: opts.fs || fs };
}

// Normalise any spelling (/d/x, D:\x, D:/x, \\?\D:\x, ~/x, relative) to one absolute path.
export function normalizePath(raw, ctx, cwd = ctx.cwd) {
  let p = String(raw).trim();
  if (!p) return null;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = ctx.home + p.slice(1);
  if (ctx.win) {
    p = p.replace(/^(\\\\|\/\/)[?.][\\/]UNC[\\/]/i, '\\\\').replace(/^(\\\\|\/\/)[?.][\\/]/, '');
    let m;
    if ((m = /^\/(?:cygdrive\/|mnt\/)?([a-zA-Z])(?=\/|$)(.*)$/.exec(p))) p = m[1] + ':' + (m[2] || '\\');
    else if (/^\/tmp(?=\/|$)/i.test(p)) p = ctx.temps[0] + p.slice(4);
    else if (/^[a-zA-Z]:$/.test(p)) p += '\\';
    else if (/^[a-zA-Z]:[^\\/]/.test(p)) p = p.slice(0, 2) + '\\' + p.slice(2);
    else if (p === '/') p = ctx.P.parse(cwd).root;
    p = p.replace(/\//g, '\\');
  }
  let r = ctx.P.resolve(cwd, p);
  if (r.length > ctx.P.parse(r).root.length) r = r.replace(/[\\/]+$/, '');
  return r;
}
function key(p, ctx) { return ctx.win ? p.toLowerCase() : p; }
function within(child, parent, ctx) { // child === parent or child under parent
  const c = key(child, ctx), q = key(parent, ctx);
  if (c === q) return true;
  const sep = ctx.win ? '\\' : '/';
  return c.startsWith(q.endsWith(sep) ? q : q + sep);
}

function projectRoot(ctx) {
  const fx = ctx.fsx; let d = ctx.cwd;
  const seen = [];
  for (;;) { seen.push(d); const up = ctx.P.dirname(d); if (up === d) break; d = up; }
  for (const markers of [['.git'], ['package.json', 'pyproject.toml', 'sf.py', 'AGENTS.md', 'CLAUDE.md', 'Cargo.toml', 'go.mod']]) {
    for (const dir of seen) {
      if (key(dir, ctx) === key(ctx.home, ctx) || ctx.P.parse(dir).root === dir) continue;
      for (const m of markers) { try { if (fx.existsSync(ctx.P.join(dir, m))) return dir; } catch { /* ignore */ } }
    }
  }
  return null;
}

export function importantLocations(ctx) {
  const L = [], add = (p, label) => { if (p) L.push({ path: ctx.P.resolve(p), label }); };
  const h = ctx.home, e = ctx.env;
  add(h, '家目錄');
  for (const n of ['Desktop', 'Documents', 'Downloads']) add(ctx.P.join(h, n), n);
  if (e.OneDrive) { add(e.OneDrive, 'OneDrive'); for (const n of ['Desktop', 'Documents']) add(ctx.P.join(e.OneDrive, n), 'OneDrive ' + n); }
  if (ctx.win) {
    add(e.SystemRoot || e.windir || 'C:\\Windows', 'Windows');
    for (const k of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData']) add(e[k], k);
    if (!e.ProgramFiles) add('C:\\Program Files', 'ProgramFiles');
  } else {
    for (const d of ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/opt', '/proc', '/root', '/sbin', '/srv', '/sys', '/usr', '/var', '/Applications', '/System', '/Library']) add(d, '系統資料夾');
  }
  add(projectRoot(ctx), '目前專案根');
  for (const x of ctx.config.extra_protected || []) { const n = normalizePath(x, ctx); if (n) L.push({ path: n, label: '額外重要位置' }); }
  return L;
}

function protectedHit(target, ctx) {
  const root = ctx.P.parse(target).root;
  if (key(target, ctx) === key(root, ctx)) return { label: '磁碟根目錄', path: target };
  if (ctx.win && /^\\\\[^\\]+\\[^\\]+$/.test(target)) return { label: '網路磁碟根目錄', path: target };
  for (const l of ctx.important || (ctx.important = importantLocations(ctx))) if (within(l.path, target, ctx)) return l;
  return null;
}

// Look for junctions/symlinks at or under target, with a budget (fail open when exceeded).
function findLink(target, ctx, budget = { entries: 20000, until: Date.now() + 1500 }) {
  const fx = ctx.fsx; let st;
  try { st = fx.lstatSync(target); } catch { return null; }
  if (st.isSymbolicLink()) return { link: target };
  if (!st.isDirectory()) return null;
  const stack = [target];
  while (stack.length) {
    const d = stack.pop(); let list;
    try { list = fx.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const ent of list) {
      if (--budget.entries < 0 || Date.now() > budget.until) return { incomplete: true };
      const p = ctx.P.join(d, ent.name);
      if (ent.isSymbolicLink()) return { link: p };
      if (ent.isDirectory()) {
        // Windows junctions can appear as directories through Dirent; confirm with lstat.
        try { if (fx.lstatSync(p).isSymbolicLink()) return { link: p }; } catch { /* ignore */ }
        stack.push(p);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- lexer
// One pragmatic lexer for bash, PowerShell and cmd. Produces segments of words; keeps raw text,
// variable/glob flags, command substitutions, heredoc bodies and redirection targets.
export function lex(text, shell) {
  const segs = []; let seg = newSeg(), word = null, i = 0; const n = text.length;
  const pendingHeredocs = [];
  function newSeg(sep = null) { return { words: [], redirects: [], heredoc: null, subs: [], sep }; }
  function startWord() { if (!word) word = { text: '', raw: '', start: i, quoted: false, hasVar: false, glob: false, globAtStart: false, tilde: false, here: false }; }
  function endWord() {
    if (!word) return;
    word.raw = text.slice(word.start, i);
    if (seg.pendingRedirect) { seg.redirects.push({ op: seg.pendingRedirect, target: word }); seg.pendingRedirect = null; }
    else if (seg.pendingHeredoc) { pendingHeredocs.push({ seg, delim: word.text, strip: seg.pendingHeredoc === '<<-' }); seg.pendingHeredoc = null; }
    else seg.words.push(word);
    word = null;
  }
  function endSeg(sep) { endWord(); if (seg.words.length || seg.redirects.length || seg.heredoc) segs.push(seg); seg = newSeg(sep); }
  function readBalanced(open, close, from) { // returns index after the matching close
    let depth = 1, j = from, q = null;
    while (j < n && depth) {
      const c = text[j];
      if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && shell === 'bash') j++; }
      else if (c === "'" || c === '"') q = c;
      else if (c === open) depth++;
      else if (c === close) depth--;
      j++;
    }
    return j;
  }
  function consumeHeredocs() {
    while (pendingHeredocs.length) {
      const h = pendingHeredocs.shift(); const lines = [];
      for (;;) {
        if (i >= n) break;
        let e = text.indexOf('\n', i); if (e < 0) e = n;
        let line = text.slice(i, e).replace(/\r$/, ''); i = e + 1;
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
        lines.push(line);
      }
      h.seg.heredoc = (h.seg.heredoc ? h.seg.heredoc + '\n' : '') + lines.join('\n');
    }
  }
  const markVar = () => { startWord(); word.hasVar = true; };
  while (i < n) {
    const c = text[i];
    // separators
    if (c === '\n') { endSeg(';'); i++; if (pendingHeredocs.length) consumeHeredocs(); continue; }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue; }
    if (c === ';' || (c === '&' && shell !== 'powershell') || c === '|' || c === '(' || c === ')' || ((c === '{' || c === '}') && shell === 'powershell' && !word)) {
      if (shell === 'cmd' && c === '(' && word) { word.text += c; i++; continue; }
      let op = c; if ((c === '&' || c === '|') && text[i + 1] === c) op = c + c;
      if (c === '&' && text[i + 1] === '>') { endWord(); seg.pendingRedirect = '&>'; i += text[i + 2] === '>' ? 3 : 2; continue; }
      endSeg(op === '|' ? '|' : ';'); i += op.length; continue;
    }
    if (shell === 'powershell' && c === '&' && text[i + 1] === '&') { endSeg(';'); i += 2; continue; }
    if (shell === 'powershell' && c === '&' && !word) { i++; continue; } // call operator
    // comments
    if (c === '#' && !word && shell !== 'cmd') { while (i < n && text[i] !== '\n') i++; continue; }
    if (shell === 'powershell' && c === '<' && text[i + 1] === '#') { const e = text.indexOf('#>', i + 2); i = e < 0 ? n : e + 2; continue; }
    // redirections
    if ((c === '>' || c === '<') && !(shell === 'powershell' && c === '<')) {
      if (word && /^\d$/.test(word.text) && !word.quoted) word = null; else endWord();
      if (c === '<' && text[i + 1] === '<' && shell === 'bash') {
        if (text[i + 2] === '<') { endWord(); seg.pendingRedirect = '<<<'; i += 3; continue; }
        endWord(); seg.pendingHeredoc = text[i + 2] === '-' ? '<<-' : '<<'; i += text[i + 2] === '-' ? 3 : 2; continue;
      }
      let op = c; if (text[i + 1] === c) op += c; if (text[i + op.length] === '&') { op += '&'; }
      endWord(); i += op.length;
      if (op.endsWith('&')) { while (i < n && /[0-9-]/.test(text[i])) i++; continue; }
      seg.pendingRedirect = op; continue;
    }
    // PowerShell here-strings
    if (shell === 'powershell' && c === '@' && (text[i + 1] === "'" || text[i + 1] === '"') && /^\r?\n/.test(text.slice(i + 2, i + 4))) {
      const q = text[i + 1]; const close = new RegExp('\\r?\\n' + q + '@', 'g'); close.lastIndex = i + 2;
      const m = close.exec(text); startWord(); word.quoted = true; word.here = true;
      const body = text.slice(text.indexOf('\n', i) + 1, m ? m.index : n);
      word.text += body; if (q === '"' && /\$[\w{(:]/.test(body)) word.hasVar = true;
      i = m ? m.index + m[0].length : n; continue;
    }
    // quotes
    if (c === "'" && shell !== 'cmd') {
      startWord(); word.quoted = true; let j = i + 1;
      for (;;) {
        if (j >= n) break;
        if (text[j] === "'") { if (shell === 'powershell' && text[j + 1] === "'") { word.text += "'"; j += 2; continue; } break; }
        word.text += text[j++];
      }
      i = j + 1; continue;
    }
    if (c === '"') {
      startWord(); word.quoted = true; let j = i + 1;
      while (j < n && text[j] !== '"') {
        const d = text[j];
        if (shell === 'bash' && d === '\\' && j + 1 < n && '$`"\\\n'.includes(text[j + 1])) { word.text += text[j + 1]; j += 2; continue; }
        if (shell === 'powershell' && d === '`' && j + 1 < n) { word.text += text[j + 1]; j += 2; continue; }
        if (shell === 'powershell' && d === '"' && text[j + 1] === '"') { word.text += '"'; j += 2; continue; }
        if (d === '$' && shell !== 'cmd') {
          if (text[j + 1] === '(') { const e = readBalanced('(', ')', j + 2); seg.subs.push(text.slice(j + 2, e - 1)); word.hasVar = true; word.text += text.slice(j, e); j = e; continue; }
          if (/[\w{:]/.test(text[j + 1] || '')) word.hasVar = true;
        }
        if (d === '`' && shell === 'bash') { const e = text.indexOf('`', j + 1); seg.subs.push(text.slice(j + 1, e < 0 ? n : e)); word.hasVar = true; word.text += text.slice(j, e < 0 ? n : e + 1); j = e < 0 ? n : e + 1; continue; }
        if (d === '%' && /%[\w()]+%/.test(text.slice(j, j + 40))) word.hasVar = true;
        word.text += d; j++;
      }
      i = j + 1; continue;
    }
    // escapes
    if (c === '\\' && shell === 'bash' && i + 1 < n) { startWord(); if (text[i + 1] === '\n') { i += 2; continue; } word.text += text[i + 1]; i += 2; continue; }
    if (c === '`' && shell === 'powershell' && i + 1 < n) { startWord(); if (text[i + 1] === '\n' || text[i + 1] === '\r') { i += text[i + 1] === '\r' ? 3 : 2; continue; } word.text += text[i + 1]; i += 2; continue; }
    if (c === '^' && shell === 'cmd' && i + 1 < n) { startWord(); word.text += text[i + 1]; i += 2; continue; }
    // variables and substitutions
    if (c === '$' && shell !== 'cmd') {
      if (text[i + 1] === '(') { markVar(); const e = readBalanced('(', ')', i + 2); seg.subs.push(text.slice(i + 2, e - 1)); word.text += text.slice(i, e); i = e; continue; }
      if (text[i + 1] === '{') { markVar(); const e = readBalanced('{', '}', i + 2); word.text += text.slice(i, e); i = e; continue; }
      if (/[\w?@*#!$:-]/.test(text[i + 1] || '')) { markVar(); word.text += c; i++; continue; }
    }
    if (c === '`' && shell === 'bash') { markVar(); const e = text.indexOf('`', i + 1); seg.subs.push(text.slice(i + 1, e < 0 ? n : e)); word.text += text.slice(i, e < 0 ? n : e + 1); i = e < 0 ? n : e + 1; continue; }
    if ((c === '%' || c === '!') && shell === 'cmd' && new RegExp('^\\' + c + '[\\w()]+\\' + c).test(text.slice(i, i + 40))) { markVar(); const e = text.indexOf(c, i + 1); word.text += text.slice(i, e + 1); i = e + 1; continue; }
    if (c === '%' && shell === 'powershell' && !word) { startWord(); word.text += c; i++; continue; }
    // ordinary character
    startWord();
    if (c === '~' && word.text === '' && !word.quoted) word.tilde = true;
    if ((c === '*' || c === '?' || c === '[') && !word.quoted && shell !== 'cmd') {
      if (!word.glob && !/[\\/]/.test(word.text.replace(/^\.[\\/]/, ''))) word.globAtStart = true;
      word.glob = true;
    }
    if ((c === '*' || c === '?') && shell === 'cmd') { if (!word.glob && !/[\\/]/.test(word.text)) word.globAtStart = true; word.glob = true; }
    word.text += c; i++;
  }
  endSeg(null);
  if (pendingHeredocs.length) consumeHeredocs();
  // link pipelines
  for (let k = 1; k < segs.length; k++) if (segs[k].sep === '|') segs[k].pipeFrom = segs[k - 1];
  return segs;
}

// ---------------------------------------------------------------- command analysis
const PREFIX_CMDS = new Set(['{', 'sudo', 'doas', 'nohup', 'time', 'command', 'builtin', 'exec', 'nice', 'ionice', 'stdbuf', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', 'call', 'start-job']);
function cmdName(w) {
  let s = (w || '').replace(/^.*[\\/]/, '').toLowerCase();
  s = s.replace(/^microsoft\.powershell\.[a-z]+\\/, '');
  return s.replace(/\.(exe|cmd|bat|com|ps1)$/, '');
}
function stripPrefixes(words) {
  let k = 0;
  for (;;) {
    const w = words[k]; if (!w) break; const nm = cmdName(w.text);
    if (/^[A-Za-z_][\w]*=/.test(w.text) && !w.quoted) { k++; continue; }
    if (PREFIX_CMDS.has(nm)) { k++; if (nm === 'nice' && words[k] && /^-/.test(words[k].text)) k++; continue; }
    if (nm === 'env') { k++; while (words[k] && (/^-/.test(words[k].text) || /^[A-Za-z_]\w*=/.test(words[k].text))) k++; continue; }
    if (nm === 'timeout' && words[k + 1] && /^\d/.test(words[k + 1].text)) { k += 2; continue; }
    break;
  }
  return words.slice(k);
}

const PS_REMOVE = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir']);
const FORMAT_CMDS = new Set(['format', 'diskpart', 'clear-disk', 'format-volume', 'initialize-disk', 'remove-partition', 'wipefs', 'mkfs']);
const WRAPPERS_BASH = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'git-bash', 'busybox']);
const WRAPPERS_PS = new Set(['powershell', 'pwsh', 'powershell_ise']);
const PY = /^(python[\d.]*w?|py|pypy3?)$/;
const NODE = new Set(['node', 'nodejs', 'bun', 'deno', 'tsx', 'ts-node']);
const FIND_FILTERS = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-type', '-newer', '-mtime', '-mmin', '-atime', '-amin', '-ctime', '-cmin', '-size', '-user', '-group', '-empty', '-perm', '-links', '-inum', '-samefile', '-lname', '-ilname', '-newermt', '-used']);

function psParam(text, full, min = 2) { const t = text.toLowerCase().replace(/:.*$/, ''); return t.startsWith('-') && t.length >= min && full.startsWith(t); }

// Returns { deletes:[{word, selective, kind}], format, wrappers:[{shell, text, name}], scripts:[{lang, code, file}], tamperTargets:[{word, verb}] }
function inspectSegment(seg, shell, ctx) {
  const out = { deletes: [], format: null, wrappers: [], scripts: [], tamper: [], cd: null, xargsDelete: false };
  const words = stripPrefixes(seg.words);
  if (!words.length) return out;
  const nm = cmdName(words[0].text); const args = words.slice(1);
  const lower = args.map(a => a.text.toLowerCase());
  // cd
  if (['cd', 'set-location', 'sl', 'chdir', 'pushd', 'push-location'].includes(nm)) {
    const t = shell === 'cmd' ? args.find(w => !/^\/[a-z]$/i.test(w.text)) : args.find(w => !/^-/.test(w.text));
    out.cd = t ? t : { text: shell === 'cmd' ? '.' : '~', tilde: shell !== 'cmd' };
    return out;
  }
  // formatting / disk wiping
  if (FORMAT_CMDS.has(nm) || /^mkfs(\.|$)/.test(nm)) { out.format = words[0].text; return out; }
  if (nm === 'dd' && args.some(a => /^of=(\/dev\/|\\\\\.\\)/i.test(a.text))) { out.format = 'dd'; return out; }
  if (nm === 'cipher' && lower.some(a => a.startsWith('/w'))) { out.format = 'cipher /w'; return out; }
  if (nm === 'sgdisk' && lower.some(a => a.startsWith('--zap') || a === '-z')) { out.format = 'sgdisk'; return out; }
  // wrappers
  if (WRAPPERS_BASH.has(nm) || nm === 'wsl') {
    for (let k = 0; k < args.length; k++) {
      const t = args[k].text;
      if (/^-[a-z]*c[a-z]*$/i.test(t) && args[k + 1]) { out.wrappers.push({ shell: 'bash', text: args[k + 1].text, name: nm }); return out; }
      if (nm === 'wsl' && (t === '-e' || t === '--exec' || t === '--')) { out.wrappers.push({ shell: 'bash', text: args.slice(k + 1).map(w => w.raw).join(' '), name: nm }); return out; }
      if (!/^-/.test(t)) { if (nm !== 'wsl') out.scripts.push({ lang: 'bash', file: t }); else out.wrappers.push({ shell: 'bash', text: args.slice(k).map(w => w.raw).join(' '), name: nm }); return out; }
    }
    if (seg.heredoc != null) out.wrappers.push({ shell: 'bash', text: seg.heredoc, name: nm });
    return out;
  }
  if (WRAPPERS_PS.has(nm)) {
    for (let k = 0; k < args.length; k++) {
      const t = args[k].text;
      if (psParam(t, '-encodedcommand', 2) && !psParam(t, '-executionpolicy', 3) || /^-(e|ec|enc)$/i.test(t)) {
        let decoded = ''; try { decoded = Buffer.from(args[k + 1].text, 'base64').toString('utf16le'); } catch { /* ignore */ }
        out.wrappers.push({ shell: 'powershell', text: decoded, name: nm }); return out;
      }
      if (psParam(t, '-command', 2) || t === '-c' || t === '/c') { const rest = args.slice(k + 1); out.wrappers.push({ shell: 'powershell', text: rest.length === 1 ? rest[0].text : rest.map(w => w.raw).join(' '), name: nm }); return out; }
      if (psParam(t, '-file', 2)) { if (args[k + 1]) out.scripts.push({ lang: 'powershell', file: args[k + 1].text }); return out; }
      if (/^-/.test(t)) { if (/^-(executionpolicy|ep|ex|exec|windowstyle|w|configurationname|workingdirectory|wd|inputformat|outputformat|settingsfile|version|v|psconsolefile)$/i.test(t)) k++; continue; }
      const rest = args.slice(k); out.wrappers.push({ shell: 'powershell', text: rest.length === 1 ? rest[0].text : rest.map(w => w.raw).join(' '), name: nm }); return out;
    }
    return out;
  }
  if (nm === 'cmd') {
    const k = lower.findIndex(a => a === '/c' || a === '/k' || /^\/[a-z]*[ck]$/.test(a) && a.length <= 4);
    if (k >= 0) { const rest = args.slice(k + 1); out.wrappers.push({ shell: 'cmd', text: rest.length === 1 ? rest[0].text : rest.map(w => w.raw).join(' '), name: nm }); }
    return out;
  }
  if (['eval', 'invoke-expression', 'iex'].includes(nm)) {
    const rest = args.filter(w => !psParam(w.text, '-command', 2));
    out.wrappers.push({ shell: shell === 'powershell' ? 'powershell' : 'bash', text: rest.length === 1 ? rest[0].text : rest.map(w => w.raw).join(' '), name: nm });
    return out;
  }
  if (nm === 'source' || nm === '.') { if (args[0]) out.scripts.push({ lang: shell === 'powershell' ? 'powershell' : 'bash', file: args[0].text }); return out; }
  if (/\.(sh|ps1)$/i.test(words[0].text) && /[\\/]/.test(words[0].text)) { out.scripts.push({ lang: /\.ps1$/i.test(words[0].text) ? 'powershell' : 'bash', file: words[0].text }); }
  // scripting languages
  if (PY.test(nm) || NODE.has(nm)) {
    const lang = PY.test(nm) ? 'python' : 'node';
    let code = null, file = null;
    for (let k = 0; k < args.length; k++) {
      const t = args[k].text;
      if (lang === 'python' && t === '-c') { code = args[k + 1]?.text ?? ''; break; }
      if (lang === 'python' && /^-[a-zA-Z]*c$/.test(t) && !/^-[A-Z]$/.test(t)) { code = args[k + 1]?.text ?? ''; break; }
      if (lang === 'node' && (t === '-e' || t === '--eval' || t === '-p' || t === '--print' || t === 'eval')) { code = args[k + 1]?.text ?? ''; break; }
      if (lang === 'python' && t === '-m') break;
      if (t === '-') { code = seg.heredoc ?? stdinText(seg); break; }
      if (/^-/.test(t)) { if (lang === 'python' && /^-[WX]$/.test(t)) k++; continue; }
      file = t; break;
    }
    if (code == null && file == null && args.every(a => /^-/.test(a.text))) code = seg.heredoc ?? stdinText(seg);
    if (code != null) out.scripts.push({ lang, code });
    else if (file) out.scripts.push({ lang, file });
    return out;
  }
  // xargs <delete>
  if (nm === 'xargs') {
    let k = 0; while (args[k] && /^-/.test(args[k].text)) { if (/^-[IdLnPsE]$/.test(args[k].text)) k++; k++; }
    const inner = inspectSegment({ words: args.slice(k), redirects: [], heredoc: null, subs: [] }, shell, ctx);
    if (inner.deletes.length || (args[k] && ['rm', 'rmdir', 'remove-item'].includes(cmdName(args[k].text)) && args.slice(k).some(a => /^-[a-z]*r/i.test(a.text)))) out.xargsDelete = true;
    return out;
  }
  // recursive deletes
  if (nm === 'rm' || (shell === 'powershell' && PS_REMOVE.has(nm)) || ((nm === 'rd' || nm === 'rmdir' || nm === 'del' || nm === 'erase') && (shell === 'cmd' || lower.some(a => a === '/s')))) {
    let recursive = false, selective = false; const targets = []; let endOpts = false;
    for (let k = 0; k < args.length; k++) {
      const w = args[k], t = w.text, tl = t.toLowerCase();
      if (!endOpts && t === '--') { endOpts = true; continue; }
      if (!endOpts && (shell === 'cmd' || ['rd', 'rmdir', 'del', 'erase'].includes(nm)) && /^\/[a-z]/i.test(t) && t.length <= 3) { if (tl === '/s') recursive = true; continue; }
      if (!endOpts && tl === '--recursive') { recursive = true; continue; }
      if (!endOpts && /^-[a-z]+$/i.test(t) && shell !== 'powershell' && nm === 'rm' && !t.startsWith('--')) { if (/r/i.test(t)) recursive = true; continue; }
      if (!endOpts && t.startsWith('-') && t.length > 1) {
        if (psParam(t, '-recurse', 2) && !/:\$false$/i.test(t)) { recursive = true; continue; }
        if (psParam(t, '-path', 3) || psParam(t, '-literalpath', 2) || /^-(lp|pspath)$/i.test(t)) { if (args[k + 1]) { for (const p of args[k + 1].text.split(',')) targets.push({ ...args[k + 1], text: p.trim() }); } k++; continue; }
        if (psParam(t, '-filter', 2) || psParam(t, '-include', 2) || psParam(t, '-exclude', 3)) { const v = args[k + 1]?.text; if (v && v !== '*' && !psParam(t, '-exclude', 3)) selective = true; k++; continue; }
        if (/^-(credential|stream)$/i.test(t)) { k++; continue; }
        if (shell === 'powershell') continue;
        continue;
      }
      if (shell === 'powershell' && t.includes(',') && !w.quoted) { for (const p of t.split(',')) if (p) targets.push({ ...w, text: p }); continue; }
      targets.push(w);
    }
    if (nm === 'del' || nm === 'erase') { if (!recursive) return out; }
    if (recursive) {
      if (!targets.length && seg.pipeFrom) {
        const up = stripPrefixes(seg.pipeFrom.words), un = cmdName(up[0]?.text || '');
        if (['get-childitem', 'gci', 'ls', 'dir'].includes(un)) {
          const ua = up.slice(1); let base = null, filtered = false;
          for (let k = 0; k < ua.length; k++) { const t = ua[k].text; if (/^-/.test(t)) { if (psParam(t, '-filter', 2) || psParam(t, '-include', 2)) { filtered = true; k++; } else if (psParam(t, '-path', 3) || psParam(t, '-literalpath', 2)) { base = ua[k + 1]; k++; } continue; } if (!base) base = ua[k]; }
          if (!filtered) out.deletes.push({ word: base ? { ...base, glob: true, globAtStart: false } : { text: '.', raw: '.', globContents: true }, kind: 'pipeline', contents: true });
        } else out.xargsDelete = true;
      }
      for (const w of targets) out.deletes.push({ word: w, kind: nm, selective });
    }
  }
  if (nm === 'find' && shell === 'bash') {
    const del = args.some(a => a.text === '-delete') || args.some((a, k) => ['-exec', '-execdir'].includes(a.text) && cmdName(args[k + 1]?.text) === 'rm' && args.slice(k + 2, k + 4).some(x => /^-[a-z]*r/i.test(x.text)));
    if (del) {
      const filtered = args.some(a => FIND_FILTERS.has(a.text));
      const roots = []; for (const a of args) { if (/^[-(!]/.test(a.text)) { if (['-H', '-L', '-P'].includes(a.text)) continue; break; } roots.push(a); }
      if (!filtered) for (const w of roots.length ? roots : [{ text: '.', raw: '.' }]) out.deletes.push({ word: w, kind: 'find', contents: true });
    }
  }
  if (nm === 'robocopy' && lower.some(a => a === '/mir' || a === '/purge')) { const pos = args.filter(a => !a.text.startsWith('/')); if (pos[1]) out.deletes.push({ word: pos[1], kind: 'robocopy', contents: true }); }
  if (nm === 'rsync' && lower.some(a => a.startsWith('--delete'))) { const pos = args.filter(a => !a.text.startsWith('-')); if (pos.length >= 2) out.deletes.push({ word: pos[pos.length - 1], kind: 'rsync', contents: true }); }
  // tamper candidates (any write/move/delete verb)
  const TAMPER_VERBS = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni', 'cp', 'copy', 'copy-item', 'cpi', 'set-content', 'sc', 'out-file', 'clear-content', 'clc', 'add-content', 'ac', 'tee', 'tee-object', 'truncate', 'shred', 'sed', 'perl', 'unlink', 'install', 'ln', 'new-item', 'ni']);
  if (TAMPER_VERBS.has(nm)) {
    const pos = args.filter(a => !/^-/.test(a.text) && !(shell === 'cmd' && /^\/[a-z]$/i.test(a.text)));
    if (['cp', 'copy', 'copy-item', 'cpi', 'install', 'ln'].includes(nm)) { if (pos.length) out.tamper.push({ word: pos[pos.length - 1], verb: nm }); }
    else if (nm === 'sed' || nm === 'perl') { if (args.some(a => /^-[a-z]*i/.test(a.text))) for (const w of pos.slice(1)) out.tamper.push({ word: w, verb: nm }); }
    else {
      const moves = ['mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni'].includes(nm);
      const deletes = ['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri'].includes(nm);
      const recursive = args.some(a => a.text === '--recursive' || a.text.toLowerCase() === '/s' || psParam(a.text, '-recurse', 2) || (nm === 'rm' && shell !== 'powershell' && /^-[a-z]*r[a-z]*$/i.test(a.text)));
      for (const w of pos) out.tamper.push({ word: w, verb: nm, ancestors: moves || (deletes && recursive) });
    }
  }
  return out;
}
function stdinText(seg) {
  const up = seg.pipeFrom; if (!up) return null;
  if (up.heredoc != null) return up.heredoc;
  const w = stripPrefixes(up.words);
  if (w.length === 1 && w[0].quoted) return w[0].text;
  if (['echo', 'printf', 'write-output', 'write-host', 'cat', 'type', 'get-content', 'gc'].includes(cmdName(w[0]?.text))) return w.slice(1).map(x => x.text).join(' ');
  return null;
}

// ---------------------------------------------------------------- script scanning
function literalArg(expr, lang, ctx) {
  const e = expr.trim();
  let m;
  if ((m = /^[rRbBuUfF]?(['"])(.*)\1$/s.exec(e)) && !(lang === 'python' && /^[fF]/.test(e) && /\{/.test(m[2]))) return m[2];
  if (lang === 'node' && (m = /^`([^`$]*)`$/.exec(e))) return m[1];
  if (lang === 'python') {
    if ((m = /^(?:pathlib\.)?Path\(\s*[rR]?(['"])(.*)\1\s*\)$/s.exec(e))) return m[2];
    if ((m = /^os\.path\.expanduser\(\s*[rR]?(['"])(.*)\1\s*\)$/s.exec(e))) return m[2];
    if (/^(?:pathlib\.)?Path\.home\(\)$/.test(e) || /^os\.path\.expanduser\(\s*['"]~['"]\s*\)$/.test(e)) return '~';
    if ((m = /^(?:pathlib\.)?Path\.home\(\)\s*\/\s*[rR]?(['"])(.*)\1$/.exec(e))) return '~/' + m[2];
  }
  if (lang === 'node') {
    if (/^(?:os\.)?homedir\(\)$/.test(e)) return '~';
    if ((m = /^path\.(?:join|resolve)\(\s*(?:os\.)?homedir\(\)\s*(?:,\s*(['"`])([^'"`$]*)\1\s*)?\)$/.exec(e))) return '~' + (m[2] ? '/' + m[2] : '');
  }
  return null;
}
function splitArgs(s) { // first top-level argument of a call's argument text
  let depth = 0, q = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) return [s.slice(0, k), s.slice(k)]; depth--; }
    else if (c === ',' && depth === 0) return [s.slice(0, k), s.slice(k + 1)];
  }
  return [s, ''];
}
export function scanScript(code, lang) {
  const found = []; // {kind:'delete', expr} | {kind:'shell', text}
  const re = lang === 'python'
    ? /(?<![\w])(?:shutil\s*\.\s*)?rmtree\s*\(|(?<![\w])os\s*\.\s*system\s*\(|(?<![\w])subprocess\s*\.\s*(?:run|call|Popen|check_call|check_output)\s*\(/g
    : /(?<![\w])(?:rmSync|rmdirSync|rm|rmdir|rimraf|rimrafSync|removeSync|remove|emptyDirSync)\s*\(|(?<![\w])(?:execSync|exec|spawnSync|execFileSync)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const callee = m[0];
    const [first, rest] = splitArgs(code.slice(m.index + callee.length));
    if (/system|subprocess|exec|spawn/.test(callee)) {
      const lit = /^\s*[rR]?(['"`])([^]*)\1\s*$/.exec(first);
      if (lit && !lit[2].includes('${')) found.push({ kind: 'shell', text: lit[2] });
      const arr = /^\s*\[([^\]]*)\]\s*$/.exec(first);
      if (arr) { const items = [...arr[1].matchAll(/(['"])((?:(?!\1).)*)\1/g)].map(x => x[2]); if (items.length) found.push({ kind: 'shell', text: items.map(x => /[\s"']/.test(x) ? JSON.stringify(x) : x).join(' ') }); }
      continue;
    }
    if (lang === 'node' && /^(rm|rmdir|rmSync|rmdirSync)\s*\($/.test(callee.replace(/\s/g, '')) && !/recursive\s*:\s*true/.test(rest.slice(0, 200))) continue;
    found.push({ kind: 'delete', expr: first });
  }
  return found;
}

// ---------------------------------------------------------------- verdicts
function block(rule, reason, suggestion, extra = {}) {
  return { decision: 'block', rule, message: `[peicd100 防災] 已擋下：${reason}。${suggestion}。${SESSION_NOTE}`, ...extra };
}
const ALLOW = { decision: 'allow' };

function isTempVarPath(text) {
  return /^(\$\{?(TMPDIR|TEMP|TMP)\}?|%(TEMP|TMP)%|\$env:(TEMP|TMP))[\\/][^$%`~*?]+$/i.test(text);
}

function checkTarget(d, ctx, cwd, cwdKnown) {
  const w = d.word; const t = w.text;
  if (!t) return null;
  if (!d.literal) {
    if (w.hasVar || w.tilde) {
      if (isTempVarPath(t)) return null;
      return block('runtime-path', `遞迴刪除的路徑「${t}」含變數、~ 或 $(...)，要到執行時才決定`, '先把路徑算好，改寫成明確的絕對路徑（暫存資料夾除外）', { target: t });
    }
    if (w.globAtStart) return block('glob-start', `遞迴刪除的路徑「${t}」以萬用字元開頭`, '改寫成要刪的那個資料夾的明確絕對路徑', { target: t });
    const absolute = ctx.win ? /^([a-zA-Z]:|[\\/])/.test(t) : t.startsWith('/');
    if (!absolute && !cwdKnown) return block('cwd-unknown', `前面的 cd 用了變數，相對路徑「${t}」無法確定指向哪裡`, '改用明確的絕對路徑', { target: t });
  }
  let target = t;
  if (w.glob || d.contents || /[*?]/.test(t)) {
    const parts = t.split(/[\\/]/); const idx = parts.findIndex(p => /[*?[]/.test(p));
    if (idx >= 0) target = parts.slice(0, idx).join('/') || (t.startsWith('/') || t.startsWith('\\') ? '/' : '.');
  }
  const abs = normalizePath(target, ctx, cwd); if (!abs) return null;
  const hit = protectedHit(abs, ctx);
  if (hit) return block('important', `遞迴刪除的目標 ${abs} 是重要位置（${hit.label}：${hit.path}）或它的上層`, '只刪下層要清掉的那個資料夾，寫明確的絕對路徑', { target: abs });
  const lk = findLink(abs, ctx);
  if (lk && lk.link) return block('link', `${abs} 本身或底下有 junction／symlink（${lk.link}），遞迴刪除可能刪到連結指向的地方`, '先單獨移除連結（不加遞迴），再刪資料夾', { target: abs, link: lk.link });
  if (lk && lk.incomplete) logError({ kind: 'link-scan-incomplete', target: abs }, ctx.env);
  return null;
}

function guardPaths(ctx) {
  const claude = ctx.P.join(ctx.home, '.claude', 'settings.json');
  return [
    { path: MODULE_DIR, label: '防災檢查程式' },
    { path: ctx.P.join(REPO_DIR, 'extensions', 'guard.ts'), label: '防災插件入口' },
    { path: ctx.P.join(guardHome(ctx.env), 'config.json'), label: '防災設定' },
    { path: claude, label: 'Claude 使用者設定（含防災 hook）' },
    { path: ctx.P.join(ctx.home, '.pi', 'agent', 'settings.json'), label: 'Pi 設定（載入防災插件）' },
  ];
}
function tamperHit(abs, ctx, ancestors) {
  for (const g of guardPaths(ctx)) {
    if (within(abs, g.path, ctx)) return g;
    if (ancestors && within(g.path, abs, ctx)) return g;
  }
  return null;
}

// Analyse one shell command string.
export function analyzeCommand(command, opts = {}) {
  const ctx = opts.ctx || makeCtx(opts);
  if (ctx.config.enabled === false) return ALLOW;
  return analyzeIn(String(command || ''), opts.shell || 'bash', ctx, { depth: 0, cwd: ctx.cwd, cwdKnown: true, literalOnly: false });
}

function analyzeIn(text, shell, ctx, st) {
  if (st.depth > 4) return ALLOW;
  const segs = lex(text, shell);
  let cwd = st.cwd, cwdKnown = st.cwdKnown;
  for (const seg of segs) {
    const r = inspectSegment(seg, shell, ctx);
    for (const sub of seg.subs) { const v = analyzeIn(sub, shell, ctx, { ...st, depth: st.depth + 1, cwd, cwdKnown }); if (v.decision === 'block') return v; }
    if (r.cd) {
      const w = r.cd;
      if (w.hasVar || w.tilde && w.text !== '~' || w.text === '-') cwdKnown = false;
      else { const n = normalizePath(w.text, ctx, cwd); if (n) cwd = n; }
      continue;
    }
    if (r.format) return block('format', `${r.format} 會格式化或清除磁碟`, '這類指令請頻道主自己執行');
    if (r.xargsDelete && !st.literalOnly) return block('runtime-path', '遞迴刪除的路徑來自前一個指令的輸出，要到執行時才決定', '先列出要刪的路徑，再逐一用明確的絕對路徑刪除');
    for (const w of r.wrappers) {
      const inner = analyzeIn(w.text, w.shell, ctx, { ...st, depth: st.depth + 1, cwd, cwdKnown });
      if (inner.decision === 'block') return inner;
      if (!st.literalOnly && hasRecursiveDelete(w.text, w.shell, ctx, st.depth + 1)) return block('wrapped', `遞迴刪除包在 ${w.name} 裡（多層 shell）`, '直接在目前的 shell 執行刪除，並寫明確的絕對路徑');
    }
    for (const s of r.scripts) {
      let code = s.code;
      if (code == null && s.file) { code = readSmall(normalizePath(s.file, ctx, cwd), ctx); if (code == null) continue; }
      const v = s.lang === 'python' || s.lang === 'node'
        ? analyzeScript(code, s.lang, ctx, { ...st, depth: st.depth + 1, cwd, cwdKnown })
        : analyzeIn(code, s.lang, ctx, { ...st, depth: st.depth + 1, cwd, cwdKnown, literalOnly: true });
      if (v.decision === 'block') return v;
    }
    for (const d of r.deletes) {
      if (d.selective) continue;
      if (st.literalOnly && (d.word.hasVar || d.word.tilde || d.word.globAtStart)) continue;
      const v = checkTarget(d, ctx, cwd, cwdKnown);
      if (v) return v;
    }
    for (const t of r.tamper) {
      if (t.word.hasVar) continue;
      const abs = normalizePath(t.word.text, ctx, cwd); const hit = abs && tamperHit(abs, ctx, t.ancestors);
      if (hit) return block('tamper', `這會改動或移除 peicd100 防災設定（${hit.label}：${hit.path}）`, '防災設定由頻道主自己調整', { target: abs });
    }
    for (const rd of seg.redirects) {
      if (!/^(>|>>|&>|1>|2>)/.test(rd.op) || rd.target.hasVar) continue;
      const abs = normalizePath(rd.target.text, ctx, cwd); const hit = abs && tamperHit(abs, ctx, false);
      if (hit) return block('tamper', `這會改動或移除 peicd100 防災設定（${hit.label}：${hit.path}）`, '防災設定由頻道主自己調整', { target: abs });
    }
  }
  return ALLOW;
}

function hasRecursiveDelete(text, shell, ctx, depth) {
  if (depth > 4) return false;
  for (const seg of lex(text, shell)) {
    const r = inspectSegment(seg, shell, ctx);
    if (r.deletes.length || r.xargsDelete) return true;
    for (const w of r.wrappers) if (hasRecursiveDelete(w.text, w.shell, ctx, depth + 1)) return true;
    for (const sub of seg.subs) if (hasRecursiveDelete(sub, shell, ctx, depth + 1)) return true;
  }
  return false;
}

function readSmall(file, ctx) {
  try { const st = ctx.fsx.statSync(file); if (!st.isFile() || st.size > 512 * 1024) return null; return ctx.fsx.readFileSync(file, 'utf8'); } catch { return null; }
}

function analyzeScript(code, lang, ctx, st) {
  for (const f of scanScript(code, lang)) {
    if (f.kind === 'shell') {
      const v = analyzeIn(f.text, ctx.win ? 'cmd' : 'bash', ctx, { ...st, literalOnly: true });
      if (v.decision === 'block') return v;
      if (ctx.win) { const v2 = analyzeIn(f.text, 'bash', ctx, { ...st, literalOnly: true }); if (v2.decision === 'block') return v2; }
      continue;
    }
    const lit = literalArg(f.expr, lang, ctx);
    if (lit == null) continue; // non-literal paths in scripts are left to the script author
    const word = { text: lit, raw: lit, quoted: true, hasVar: false, tilde: false, glob: /[*?]/.test(lit), globAtStart: false };
    const v = checkTarget({ word, literal: true }, ctx, st.cwd, true);
    if (v) return v;
  }
  return ALLOW;
}

// ---------------------------------------------------------------- file edits (tamper only)
const CLAUDE_HOOK_MARK = MARKER;
const PI_PACKAGE_MARK = 'peicd100_pi';
export function analyzeFileWrite({ file, oldTexts = [], newTexts = [], whole = null }, opts = {}) {
  const ctx = opts.ctx || makeCtx(opts);
  if (!file) return ALLOW;
  const abs = normalizePath(file, ctx); if (!abs) return ALLOW;
  const base = ctx.P.basename(abs).toLowerCase();
  const added = whole != null ? [whole] : newTexts;
  const isClaudeSettings = /^settings(\.local)?\.json$/.test(base) && ctx.P.basename(ctx.P.dirname(abs)).toLowerCase() === '.claude';
  const userClaude = key(abs, ctx) === key(ctx.P.join(ctx.home, '.claude', 'settings.json'), ctx);
  const piSettings = key(abs, ctx) === key(ctx.P.join(ctx.home, '.pi', 'agent', 'settings.json'), ctx);
  const guardConfig = key(abs, ctx) === key(ctx.P.join(guardHome(ctx.env), 'config.json'), ctx);
  const t = (why, label) => block('tamper', `這會改動或移除 peicd100 防災設定（${label}：${abs}，${why}）`, '防災設定由頻道主自己調整', { target: abs });
  if (isClaudeSettings && added.some(x => /"disableAllHooks"\s*:\s*true/.test(x))) return t('關閉所有 hook', 'Claude 設定');
  const dropped = mark => {
    if (whole != null) { const cur = readSmall(abs, ctx); return cur != null && cur.includes(mark) && !whole.includes(mark); }
    return oldTexts.some((o, k) => o.includes(mark) && !(newTexts[k] || '').includes(mark));
  };
  if (userClaude && dropped(CLAUDE_HOOK_MARK)) return t('移除防災 hook', 'Claude 使用者設定');
  if (piSettings && dropped(PI_PACKAGE_MARK)) return t('移除載入防災的工具箱', 'Pi 設定');
  if (guardConfig && added.some(x => /"enabled"\s*:\s*false/.test(x))) return t('關閉防災', '防災設定');
  return ALLOW;
}

// ---------------------------------------------------------------- tool-call entry (Pi and Claude)
export function analyzeToolCall({ toolName, input, cwd, source, sessionId }, opts = {}) {
  const ctx = makeCtx({ ...opts, cwd });
  if (ctx.config.enabled === false) return ALLOW;
  const tn = String(toolName || '').toLowerCase();
  const inp = input || {};
  let v = ALLOW;
  if (typeof inp.command === 'string' && /bash|shell|powershell|terminal|exec|cmd/.test(tn)) {
    const shell = /powershell|pwsh/.test(tn) ? 'powershell' : /^cmd$/.test(tn) ? 'cmd' : 'bash';
    v = analyzeCommand(inp.command, { ctx, shell });
  } else if (/^(write|edit|multiedit|str_replace|create)/.test(tn) || ['write', 'edit', 'multiedit'].includes(tn)) {
    const file = inp.file_path || inp.path || inp.filePath;
    const edits = Array.isArray(inp.edits) ? inp.edits : [inp];
    const oldTexts = edits.map(e => e.old_string ?? e.oldText ?? e.old_str ?? '').map(String);
    const newTexts = edits.map(e => e.new_string ?? e.newText ?? e.new_str ?? '').map(String);
    const whole = typeof inp.content === 'string' ? inp.content : null;
    v = analyzeFileWrite({ file, oldTexts, newTexts, whole }, { ctx });
  }
  if (v.decision === 'block') logBlock({ source, session: sessionId, cwd: ctx.cwd, tool: toolName, command: String(inp.command ?? inp.file_path ?? inp.path ?? '').slice(0, 600), rule: v.rule, target: v.target }, ctx.env);
  return v;
}

export function summarizeLog(env = process.env) {
  const f = path.join(guardHome(env), 'blocks.jsonl');
  let rows = []; try { rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { /* none */ }
  const by = {}; for (const r of rows) by[r.rule] = (by[r.rule] || 0) + 1;
  return { file: f, total: rows.length, by_rule: by, last: rows.slice(-10) };
}
