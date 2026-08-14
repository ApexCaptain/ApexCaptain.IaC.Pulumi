'use strict';

// DevContainer Cleaner. 컨테이너 안 IDE(extensionHost)·터미널(pts)만 본다.
// 워크스페이스 last_used_at / FileBrowser / 호스트 세션은 해당 없다.
// compose 프로젝트면 skip 라벨 없는 실행 중 컨테이너를 같이 docker stop한다.

const path = require('path');
const lib = require('./lib');

const STATE_FILE = path.join(lib.stateDir, 'disconnected-devcontainers.json');
const CONFIG_LABEL = 'devcontainer.config_file';
const SKIP_LABEL = 'devcontainer-cleaner.skip';
const PROJECT_LABEL = 'com.docker.compose.project';

function loadMap() {
  const raw = lib.readJson(STATE_FILE, { containers: {} });
  const containers = raw && raw.containers && typeof raw.containers === 'object' ? raw.containers : {};
  const out = {};
  Object.keys(containers).forEach((id) => {
    if (!id) {
      return;
    }
    const val = containers[id];
    // 예전 스키마: containers[id] = epoch
    if (typeof val === 'number') {
      if (Number.isFinite(val) && val > 0) {
        out[id] = { inactiveSince: val, lastFingerprint: '' };
      }
      return;
    }
    if (!val || typeof val !== 'object') {
      return;
    }
    const epoch = Number(val.inactiveSince);
    out[id] = {
      inactiveSince: Number.isFinite(epoch) && epoch > 0 ? epoch : null,
      lastFingerprint: typeof val.lastFingerprint === 'string' ? val.lastFingerprint : '',
    };
  });
  return out;
}

function saveMap(map) {
  const containers = {};
  Object.keys(map).forEach((id) => {
    const entry = map[id];
    if (!entry) {
      return;
    }
    containers[id] = {
      inactiveSince: entry.inactiveSince,
      lastFingerprint: entry.lastFingerprint || '',
    };
  });
  lib.writeJsonAtomic(STATE_FILE, { containers });
}

function splitIds(stdout) {
  return stdout ? stdout.split(/\s+/).filter(Boolean) : [];
}

function listDevcontainerIds() {
  const result = lib.docker(['ps', '-aq', '--filter', `label=${CONFIG_LABEL}`]);
  if (!result.ok) {
    return [];
  }
  return splitIds(result.stdout);
}

function listByFilters(filters) {
  const args = ['ps', '-q'];
  filters.forEach((filter) => {
    args.push('--filter', filter);
  });
  const result = lib.docker(args);
  if (!result.ok) {
    return [];
  }
  return splitIds(result.stdout);
}

function projectOf(info) {
  const value = lib.labels(info)[PROJECT_LABEL];
  if (!value || value === '<no value>') {
    return '';
  }
  return value;
}

function isSkip(info) {
  return lib.labels(info)[SKIP_LABEL] === 'true';
}

function isRunning(info) {
  return Boolean(info && info.State && info.State.Running);
}

function fingerprint(report) {
  return [
    report.decision,
    (report.reasons || []).join(','),
    report.reason || '',
    report.action,
  ].join('|');
}

function remember(map, id, report, extra) {
  const fp = fingerprint(report);
  const prev = map[id] && map[id].lastFingerprint ? map[id].lastFingerprint : '';
  report.changed = prev !== fp;
  map[id] = Object.assign(
    {
      inactiveSince: null,
      lastFingerprint: fp,
    },
    extra || {},
    { lastFingerprint: fp }
  );
  return report;
}

function forget(map, id) {
  delete map[id];
}

function activityOf(id) {
  const extensionHost = lib.hasExtensionHostIn(id);
  const pts = lib.listUserPtsIn(id);
  const reasons = [];
  if (extensionHost) {
    reasons.push('extension_host');
  }
  if (pts.length > 0) {
    reasons.push('pts');
  }
  return {
    extensionHost,
    pts,
    reasons,
    active: reasons.length > 0,
  };
}

function stopDevcontainer(id, info) {
  const project = projectOf(info);
  if (!project) {
    const result = lib.docker(['stop', id]);
    return {
      ids: [id],
      names: [lib.containerName(info) || id],
      project: '',
      ok: result.ok,
      skippedAll: false,
    };
  }

  const running = listByFilters([`label=${PROJECT_LABEL}=${project}`]);
  const skipped = {};
  listByFilters([
    `label=${PROJECT_LABEL}=${project}`,
    `label=${SKIP_LABEL}=true`,
  ]).forEach((cid) => {
    skipped[cid] = true;
  });
  const toStop = running.filter((cid) => !skipped[cid]);
  if (toStop.length === 0) {
    return { ids: [], names: [], project, ok: true, skippedAll: true };
  }

  const names = toStop.map((cid) => {
    const stopInfo = lib.inspect(cid);
    return lib.containerName(stopInfo) || cid;
  });
  const result = lib.docker(['stop'].concat(toStop));
  return { ids: toStop, names, project, ok: result.ok, skippedAll: false };
}

function skipReport(id, name, reason) {
  return {
    id,
    name,
    decision: 'skip',
    reason,
    reasons: [],
    action: 'none',
  };
}

function pushClearedSkip(reports, map, id, name, reason) {
  if (!map[id]) {
    return;
  }
  forget(map, id);
  const report = skipReport(id, name, reason);
  report.changed = true;
  reports.push(report);
}

function evaluateRunning(id, name, info, map, now) {
  const activity = activityOf(id);
  if (activity.active) {
    return remember(
      map,
      id,
      {
        id,
        name,
        decision: 'keep',
        reasons: activity.reasons,
        signals: { extensionHost: activity.extensionHost, pts: activity.pts },
        elapsedSec: 0,
        remainingSec: lib.waitSeconds,
        action: 'none',
      },
      { inactiveSince: null }
    );
  }

  const prev = map[id] && map[id].inactiveSince != null ? map[id].inactiveSince : now;
  const elapsedSec = Math.max(0, now - prev);
  const remainingSec = Math.max(0, lib.waitSeconds - elapsedSec);

  if (elapsedSec < lib.waitSeconds) {
    return remember(
      map,
      id,
      {
        id,
        name,
        decision: 'keep',
        reasons: [],
        signals: { extensionHost: false, pts: [] },
        inactiveSince: lib.isoFromEpoch(prev),
        elapsedSec,
        remainingSec,
        action: 'none',
      },
      { inactiveSince: prev }
    );
  }

  const stopped = stopDevcontainer(id, info);
  const report = {
    id,
    name,
    decision: stopped.skippedAll ? 'keep' : 'stop',
    reasons: [],
    signals: { extensionHost: false, pts: [] },
    inactiveSince: lib.isoFromEpoch(prev),
    elapsedSec,
    remainingSec: 0,
    project: stopped.project || undefined,
    stopped: stopped.names,
    action: stopped.skippedAll
      ? 'skipped_all_skip_labeled'
      : stopped.ok
        ? 'docker_stop'
        : 'docker_stop_failed',
  };
  if (stopped.skippedAll) {
    forget(map, id);
    report.changed = true;
    return report;
  }
  if (!stopped.ok) {
    return remember(map, id, report, { inactiveSince: prev });
  }
  forget(map, id);
  report.changed = true;
  return report;
}

function reasonLabel(reason) {
  if (reason === 'extension_host') {
    return 'IDE';
  }
  if (reason === 'pts') {
    return '터미널';
  }
  return reason;
}

function formatContainerLine(report) {
  const parts = [`[${lib.fmtDecision(report.decision)}]`, report.name];

  if (report.reason === 'skip_label') {
    parts.push('skip 라벨');
  } else if (report.reason === 'not_running') {
    parts.push('이미 중지됨');
  } else if (report.reason === 'gone' || report.reason === 'inspect_failed') {
    parts.push('컨테이너 없음');
  }

  if (report.reasons && report.reasons.length) {
    parts.push(`활성: ${report.reasons.map(reasonLabel).join(', ')}`);
  } else if (report.decision === 'keep' && !report.reason) {
    parts.push('활성: 없음');
  }

  if (report.signals && report.signals.pts) {
    parts.push(`터미널 ${lib.fmtPts(report.signals.pts)}`);
  }

  if (report.remainingSec != null) {
    parts.push(lib.fmtRemaining(report.remainingSec, lib.waitSeconds));
  }

  if (report.action === 'docker_stop') {
    const stopped = (report.stopped || []).join(', ');
    parts.push(
      report.project
        ? `docker stop (${report.project}: ${stopped})`
        : `docker stop (${stopped || report.name})`
    );
  } else if (report.action === 'docker_stop_failed') {
    parts.push('docker stop 실패');
  } else if (report.action === 'skipped_all_skip_labeled') {
    parts.push('compose 전부 skip 라벨 → 유지');
  }

  return lib.joinLog(parts);
}

function main() {
  lib.ensureDirs();

  if (!lib.dockerRunning()) {
    lib.log(lib.joinLog(['[건너뜀]', 'Docker 사용 불가']));
    return;
  }

  if (!Number.isFinite(lib.waitSeconds) || lib.waitSeconds < 0) {
    lib.log(
      lib.joinLog(['[건너뜀]', `대기시간 설정 오류 WAIT_SECONDS=${process.env.WAIT_SECONDS}`])
    );
    return;
  }

  const map = loadMap();
  const now = Math.floor(Date.now() / 1000);
  const ids = listDevcontainerIds();
  const seen = {};
  const reports = [];

  ids.forEach((id) => {
    seen[id] = true;
    const info = lib.inspect(id);
    const name = lib.containerName(info) || id;

    if (!info) {
      pushClearedSkip(reports, map, id, name, 'inspect_failed');
      return;
    }
    if (isSkip(info)) {
      pushClearedSkip(reports, map, id, name, 'skip_label');
      return;
    }
    if (!isRunning(info)) {
      pushClearedSkip(reports, map, id, name, 'not_running');
      return;
    }

    reports.push(evaluateRunning(id, name, info, map, now));
  });

  Object.keys(map).forEach((id) => {
    if (seen[id]) {
      return;
    }
    pushClearedSkip(reports, map, id, id, 'gone');
  });

  if (reports.length === 0) {
    lib.log(lib.joinLog(['[유지]', 'DevContainer 없음']));
  } else {
    // 매 틱 컨테이너 줄을 남긴다. 비활성 카운트다운이 "변경 없음"에 가려지지 않게.
    reports.forEach((report) => {
      lib.log(formatContainerLine(report));
    });
  }
  saveMap(map);
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
