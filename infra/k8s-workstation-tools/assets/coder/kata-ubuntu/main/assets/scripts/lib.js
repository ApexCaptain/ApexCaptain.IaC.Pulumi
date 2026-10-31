'use strict';

// Auto Stop / DevContainer Cleaner 공통 유틸. npm 의존성 없이 Node 표준 라이브러리만 쓴다.
// 로그는 Home(LOG_DIR), 타이머 상태는 /tmp(STATE_DIR) — 워크스페이스 재시작 시 타이머만 리셋된다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function requiredEnv(name) {
  const value = process.env[name];
  if (value == null || value === '') {
    throw new Error(`missing env ${name}`);
  }
  return value;
}

const waitSeconds = Number(requiredEnv('WAIT_SECONDS'));
const logDir = requiredEnv('LOG_DIR');
const stateDir = requiredEnv('STATE_DIR');

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatLocalStamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Sysbox 워크스페이스는 컨테이너 부팅 = 워크스페이스 시작.
// 이전 세션의 Coder last_used_at과 구분할 때 이 시각을 하한으로 쓴다.
function workspaceStartEpoch() {
  try {
    const raw = fs.readFileSync('/proc/uptime', 'utf8').split(/\s+/)[0];
    const uptimeSecs = Math.floor(Number(raw));
    if (!Number.isFinite(uptimeSecs) || uptimeSecs < 0) {
      return Math.floor(Date.now() / 1000);
    }
    return Math.floor(Date.now() / 1000) - uptimeSecs;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

function workspaceStartDate() {
  return new Date(workspaceStartEpoch() * 1000);
}

const logFilePath = path.join(logDir, `${formatLocalStamp(workspaceStartDate())}.log`);

function ensureDirs() {
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
}

function isoFromEpoch(epoch) {
  if (epoch == null || !Number.isFinite(epoch)) {
    return null;
  }
  return new Date(epoch * 1000).toISOString();
}

function log(message) {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  fs.appendFileSync(logFilePath, `${new Date().toISOString()} ${text}\n`);
}

function fmtSecs(sec) {
  if (sec == null || !Number.isFinite(sec)) {
    return '?';
  }
  if (sec < 60) {
    return `${sec}초`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}분 ${s}초` : `${m}분`;
}

function fmtDecision(decision) {
  if (decision === 'stop') {
    return '종료';
  }
  if (decision === 'skip') {
    return '건너뜀';
  }
  return '유지';
}

function fmtPts(names) {
  if (!names || !names.length) {
    return '없음';
  }
  return names.map((name) => `pts/${name}`).join(', ');
}

function fmtRemaining(remainingSec, totalSec) {
  return `남은 ${fmtSecs(remainingSec)} / ${fmtSecs(totalSec)}`;
}

function joinLog(parts) {
  return parts.filter((part) => part != null && part !== '').join('  ·  ');
}

function run(cmd, args, opts) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts && opts.timeout != null ? opts.timeout : 15000,
    });
    return { ok: true, status: 0, stdout: stdout.trim() };
  } catch (err) {
    return {
      ok: false,
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout).trim() : '',
      stderr: err.stderr ? String(err.stderr).trim() : String(err.message),
    };
  }
}

function docker(args, opts) {
  return run('docker', args, opts);
}

function dockerRunning() {
  return docker(['ps', '-q']).ok;
}

function runningContainerIds() {
  const result = docker(['ps', '-q']);
  if (!result.ok) {
    return null;
  }
  return result.stdout ? result.stdout.split(/\s+/).filter(Boolean) : [];
}

function inspect(id) {
  const result = docker(['inspect', '--format', '{{json .}}', id]);
  if (!result.ok || !result.stdout) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function containerName(info) {
  if (!info || !info.Name) {
    return '';
  }
  return info.Name.charAt(0) === '/' ? info.Name.slice(1) : info.Name;
}

function labels(info) {
  return (info && info.Config && info.Config.Labels) || {};
}

function hasExtensionHost() {
  return run('pgrep', ['-f', 'extensionHost']).ok;
}

// /dev/pts에 있는 사용자 PTY. cron/kubectl exec가 만든 자기 TTY는 활동으로 치지 않는다.
function listUserPts() {
  let entries = [];
  try {
    entries = fs.readdirSync('/dev/pts');
  } catch {
    return [];
  }

  const own = {};
  [0, 1, 2].forEach((fd) => {
    try {
      const target = fs.readlinkSync(`/proc/self/fd/${fd}`);
      const match = String(target).match(/^\/dev\/pts\/(\d+)$/);
      if (match) {
        own[match[1]] = true;
      }
    } catch {
      // fd is not a pts (pipe, /dev/null, etc.)
    }
  });

  return parsePtsNames(entries.join('\n')).filter((name) => !own[name]);
}

function parsePtsNames(listing) {
  return String(listing || '')
    .split(/\s+/)
    .filter((name) => /^\d+$/.test(name));
}

function listUserPtsIn(containerId) {
  const result = docker(['exec', containerId, 'sh', '-c', 'ls -1 /dev/pts 2>/dev/null || true']);
  if (!result.ok) {
    return [];
  }
  return parsePtsNames(result.stdout);
}

// Coder가 IDE/SSH/웹 터미널 연결 때 갱신하는 last_used_at.
// FileBrowser 같은 coder_app만 연 것은 공식 활동이 아닐 수 있다.
function coderLastUsedAt(workspaceName) {
  if (!workspaceName) {
    return { at: null, epoch: null, error: 'CODER_WORKSPACE_NAME empty' };
  }

  const result = run('coder', ['list', '--search', `name:${workspaceName}`, '-o', 'json']);
  if (!result.ok) {
    return {
      at: null,
      epoch: null,
      error: result.stderr || `coder list exit ${result.status}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    return { at: null, epoch: null, error: 'coder list json parse failed' };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.workspaces)
      ? parsed.workspaces
      : [];
  const exact = list.filter((item) => item && item.name === workspaceName);
  const ws = exact[0] || (list.length === 1 ? list[0] : null);
  if (!ws) {
    return { at: null, epoch: null, error: 'workspace not found in coder list' };
  }
  if (!ws.last_used_at) {
    return { at: null, epoch: null, error: 'last_used_at missing' };
  }

  const ms = Date.parse(ws.last_used_at);
  if (!Number.isFinite(ms)) {
    return { at: null, epoch: null, error: 'last_used_at invalid' };
  }

  return { at: new Date(ms).toISOString(), epoch: Math.floor(ms / 1000), error: null };
}

function hasExtensionHostIn(containerId) {
  return docker(['exec', containerId, 'pgrep', '-f', 'extensionHost']).ok;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

module.exports = {
  waitSeconds,
  logDir,
  stateDir,
  logFilePath,
  workspaceStartEpoch,
  isoFromEpoch,
  ensureDirs,
  log,
  fmtSecs,
  fmtDecision,
  fmtPts,
  fmtRemaining,
  joinLog,
  run,
  docker,
  dockerRunning,
  runningContainerIds,
  inspect,
  containerName,
  labels,
  hasExtensionHost,
  hasExtensionHostIn,
  listUserPts,
  listUserPtsIn,
  coderLastUsedAt,
  readJson,
  writeJsonAtomic,
};
