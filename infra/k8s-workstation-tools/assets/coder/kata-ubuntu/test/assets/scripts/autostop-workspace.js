'use strict';

// 워크스페이스 Auto Stop. 30초 cron으로 돌며, 로컬 활동과 Coder last_used_at 중
// 더 최근 시각부터 WAIT_SECONDS가 지나면 `coder stop`한다.
// 상태 파일은 /tmp라서 재시작 후 타이머가 다시 시작한다.

const path = require('path');
const { spawn } = require('child_process');
const lib = require('./lib');

const STATE_FILE = path.join(lib.stateDir, 'workspace-status.json');

function loadState() {
  const raw = lib.readJson(STATE_FILE, {});
  const epoch = Number(raw.lastLocalActivityEpoch);
  return {
    lastLocalActivityEpoch: Number.isFinite(epoch) && epoch > 0 ? epoch : null,
    lastDecision: typeof raw.lastDecision === 'string' ? raw.lastDecision : '',
    lastReasons: typeof raw.lastReasons === 'string' ? raw.lastReasons : '',
  };
}

function saveState(state, snapshot) {
  lib.writeJsonAtomic(STATE_FILE, {
    lastLocalActivityEpoch: state.lastLocalActivityEpoch,
    lastDecision: state.lastDecision || '',
    lastReasons: state.lastReasons || '',
    lastActivityEpoch:
      snapshot && Number.isFinite(snapshot.lastActivityEpoch)
        ? snapshot.lastActivityEpoch
        : null,
    waitSeconds: Number.isFinite(lib.waitSeconds) ? lib.waitSeconds : null,
    dockerCount:
      snapshot && Number.isFinite(snapshot.dockerCount) ? snapshot.dockerCount : null,
    extensionHost:
      snapshot && typeof snapshot.extensionHost === 'boolean'
        ? snapshot.extensionHost
        : null,
    pts: snapshot && Array.isArray(snapshot.pts) ? snapshot.pts : [],
  });
}

function reasonsOf(signals, now) {
  const reasons = [];
  if (signals.dockerIds.length > 0) {
    reasons.push('docker');
  }
  if (signals.extensionHost) {
    reasons.push('extension_host');
  }
  if (signals.pts.length > 0) {
    reasons.push('pts');
  }
  // last_used_at이 "대기 시간 안"일 때만 이유에 넣는다. 타이머 기준 시각과는 별개다.
  if (
    signals.coder.usable &&
    signals.coder.epoch != null &&
    now - signals.coder.epoch < lib.waitSeconds
  ) {
    reasons.push('coder_last_used');
  }
  return reasons;
}

function scheduleStop(workspace) {
  const child = spawn('coder', ['stop', workspace, '-y'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function reasonLabel(reason) {
  switch (reason) {
    case 'docker':
      return 'Docker';
    case 'extension_host':
      return 'IDE';
    case 'pts':
      return '터미널';
    case 'coder_last_used':
      return '사용시각';
    default:
      return reason;
  }
}

function formatUsedAt(opts) {
  if (opts.coderAgeSec == null) {
    if (opts.coderError) {
      return `사용시각 오류 (${opts.coderError})`;
    }
    return '사용시각 없음';
  }
  const age = `${lib.fmtSecs(opts.coderAgeSec)} 전`;
  if (opts.coderIgnoredStale) {
    return `사용시각 ${age} (이전 부팅, 무시)`;
  }
  if (opts.coderError) {
    return `사용시각 ${age} (오류: ${opts.coderError})`;
  }
  return `사용시각 ${age}`;
}

function formatTick(opts) {
  const parts = [`[${lib.fmtDecision(opts.decision)}]`];

  if (opts.reason) {
    parts.push(opts.reason);
  } else if (opts.reasons && opts.reasons.length) {
    parts.push(`이유: ${opts.reasons.map(reasonLabel).join(', ')}`);
  } else if (opts.decision === 'keep') {
    parts.push('이유: 없음');
  }

  if (opts.pts) {
    parts.push(`터미널 ${lib.fmtPts(opts.pts)}`);
  }
  if (opts.dockerCount != null) {
    parts.push(`Docker ${opts.dockerCount}개`);
  }
  if (opts.extensionHost != null) {
    parts.push(`IDE ${opts.extensionHost ? '연결' : '없음'}`);
  }
  if (opts.coderAgeSec != null || opts.coderError) {
    parts.push(formatUsedAt(opts));
  }
  if (opts.remainingSec != null && opts.waitSeconds != null) {
    parts.push(lib.fmtRemaining(opts.remainingSec, opts.waitSeconds));
  }
  if (opts.seeded) {
    parts.push('타이머 시작 (부팅)');
  }
  if (opts.action && opts.action !== 'none') {
    parts.push(
      opts.workspace ? `${opts.action} "${opts.workspace}"` : opts.action
    );
  }
  return lib.joinLog(parts);
}

function main() {
  lib.ensureDirs();
  const workspace = process.env.CODER_WORKSPACE_NAME || '';
  const state = loadState();
  const startedAt = lib.workspaceStartEpoch();

  if (!Number.isFinite(lib.waitSeconds) || lib.waitSeconds < 0) {
    lib.log(formatTick({
      decision: 'skip',
      reason: `대기시간 설정 오류 WAIT_SECONDS=${process.env.WAIT_SECONDS}`,
      workspace,
    }));
    return;
  }

  const dockerIds = lib.runningContainerIds();
  if (dockerIds == null) {
    lib.log(formatTick({
      decision: 'skip',
      reason: 'Docker 사용 불가',
      workspace,
    }));
    state.lastDecision = 'skip';
    saveState(state, { dockerCount: null, extensionHost: null, pts: [] });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const coder = lib.coderLastUsedAt(workspace);
  // 재시작 직후 이전 세션 last_used_at으로 바로 종료되지 않게, 이번 부팅 이후만 쓴다.
  const coderUsable = coder.epoch != null && coder.epoch >= startedAt;
  const signals = {
    dockerIds,
    extensionHost: lib.hasExtensionHost(),
    pts: lib.listUserPts(),
    coder: Object.assign({}, coder, { usable: coderUsable }),
  };
  const reasons = reasonsOf(signals, now);
  const localActive =
    signals.dockerIds.length > 0 || signals.extensionHost || signals.pts.length > 0;

  if (localActive) {
    state.lastLocalActivityEpoch = now;
  }

  if (state.lastLocalActivityEpoch != null && state.lastLocalActivityEpoch < startedAt) {
    state.lastLocalActivityEpoch = null;
  }

  const activityEpochs = [];
  if (state.lastLocalActivityEpoch != null) {
    activityEpochs.push(state.lastLocalActivityEpoch);
  }
  if (coderUsable) {
    activityEpochs.push(coder.epoch);
  }

  let seeded = false;
  if (activityEpochs.length === 0) {
    // 신호 없음: 부팅 시각부터 비활성으로 센다.
    state.lastLocalActivityEpoch = startedAt;
    activityEpochs.push(startedAt);
    seeded = true;
  }

  const lastActivityEpoch = Math.max.apply(null, activityEpochs);
  const elapsedSec = Math.max(0, now - lastActivityEpoch);
  const remainingSec = Math.max(0, lib.waitSeconds - elapsedSec);
  const shouldStop = elapsedSec >= lib.waitSeconds;
  const decision = shouldStop ? 'stop' : 'keep';
  state.lastDecision = decision;
  state.lastReasons = reasons.join(',');

  let action = 'none';
  if (shouldStop) {
    if (!workspace) {
      action = '워크스페이스 이름 없음';
    } else {
      action = 'coder stop';
      scheduleStop(workspace);
    }
  }

  lib.log(formatTick({
    decision,
    reasons,
    pts: signals.pts,
    dockerCount: signals.dockerIds.length,
    extensionHost: signals.extensionHost,
    coderAgeSec: coder.epoch != null ? now - coder.epoch : null,
    coderIgnoredStale: coder.epoch != null && !coderUsable,
    coderError: coder.error,
    remainingSec,
    waitSeconds: lib.waitSeconds,
    seeded,
    action,
    workspace,
  }));
  saveState(state, {
    lastActivityEpoch,
    dockerCount: signals.dockerIds.length,
    extensionHost: signals.extensionHost,
    pts: signals.pts,
  });
}

try {
  main();
} catch (err) {
  try {
    lib.ensureDirs();
    lib.log(`[치명] ${err && err.stack ? err.stack : err}`);
  } catch (_) {
    // 로그 디렉터리조차 못 만들면 더 할 일이 없다.
  }
  process.exitCode = 1;
}
