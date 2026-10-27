import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  extractSlug,
  MirrorIssue,
  parseIssueDoc,
  planSync,
  renderIssueBody,
  rewriteRelativeLinks,
  toDesiredIssue,
} from './docs-issue-mirror';

const repo = { owner: 'o', repo: 'r', ref: 'develop' };
const blob = 'https://github.com/o/r/blob/develop';

const sample = [
  '# 샘플 이슈',
  '',
  '| 항목 | 내용 |',
  '|---|---|',
  '| **상태**      | **보류** — 메모 |',
  '',
  '[해결](../resolved/2026-01-01-a.md#x) [코드](../../../infra/x.ts) [ext](https://e.com) [앵커](#y)',
  '',
  '```',
  '[펜스](../resolved/no.md)',
  '```',
].join('\n');

void describe('parseIssueDoc', () => {
  void test('active 문서는 open, 상태·제목 추출', () => {
    const doc = parseIssueDoc('docs/issues/active/2026-01-02-b.md', sample);
    assert.equal(doc.slug, '2026-01-02-b');
    assert.equal(doc.state, 'open');
    assert.equal(doc.title, '샘플 이슈');
    assert.equal(doc.status, '보류');
  });

  void test('resolved 문서는 closed, 모르는 상태는 undefined', () => {
    const doc = parseIssueDoc(
      'docs/issues/resolved/2026-01-01-a.md',
      '# t\n| **상태** | **이상함** |',
    );
    assert.equal(doc.state, 'closed');
    assert.equal(doc.status, undefined);
  });
});

void describe('rewriteRelativeLinks', () => {
  const out = rewriteRelativeLinks(
    sample,
    'docs/issues/active/2026-01-02-b.md',
    repo,
  );

  void test('상대 링크 → blob URL (앵커 유지)', () => {
    assert.ok(out.includes(`(${blob}/docs/issues/resolved/2026-01-01-a.md#x)`));
    assert.ok(out.includes(`(${blob}/infra/x.ts)`));
  });

  void test('외부·앵커·코드 펜스는 그대로', () => {
    assert.ok(out.includes('(https://e.com)'));
    assert.ok(out.includes('(#y)'));
    assert.ok(out.includes('[펜스](../resolved/no.md)'));
  });

  void test('디렉터리는 tree URL', () => {
    const dir = rewriteRelativeLinks(
      '[d](../active/)',
      'docs/issues/resolved/x.md',
      repo,
    );
    assert.equal(
      dir,
      '[d](https://github.com/o/r/tree/develop/docs/issues/active/)',
    );
  });
});

void describe('renderIssueBody', () => {
  void test('마커·SSOT 배너 포함, H1 제거, 결정적', () => {
    const doc = parseIssueDoc('docs/issues/active/2026-01-02-b.md', sample);
    const body = renderIssueBody(doc, repo);
    assert.equal(extractSlug(body), '2026-01-02-b');
    assert.ok(body.includes(`${blob}/docs/issues/active/2026-01-02-b.md`));
    assert.ok(!body.includes('# 샘플 이슈'));
    assert.equal(body, renderIssueBody(doc, repo));
  });

  void test('버전 점이 들어간 slug도 마커로 되읽는다', () => {
    const doc = parseIssueDoc(
      'docs/issues/resolved/2026-10-06-lxcfs-0.2.8-upgrade.md',
      '# t',
    );
    assert.equal(
      extractSlug(renderIssueBody(doc, repo)),
      '2026-10-06-lxcfs-0.2.8-upgrade',
    );
  });

  void test('너무 긴 본문은 65536자 안으로 자른다', () => {
    const doc = parseIssueDoc(
      'docs/issues/active/2026-01-02-b.md',
      `# t\n${'가'.repeat(70000)}`,
    );
    assert.ok(renderIssueBody(doc, repo).length <= 65536);
  });
});

void describe('planSync', () => {
  const activeDoc = parseIssueDoc('docs/issues/active/2026-01-02-b.md', sample);
  const desired = toDesiredIssue(activeDoc, repo);
  const synced = (over: Partial<MirrorIssue> = {}): MirrorIssue => ({
    number: 7,
    title: desired.title,
    body: desired.body,
    state: 'open',
    labels: [...desired.labels],
    ...over,
  });

  void test('Issue 없으면 create (slug 순)', () => {
    const other = { ...desired, slug: '2026-01-01-a' };
    const actions = planSync([desired, other], []);
    assert.deepEqual(
      actions.map(a => (a.kind === 'create' ? a.desired.slug : '')),
      ['2026-01-01-a', '2026-01-02-b'],
    );
  });

  void test('동일하면 아무것도 안 함', () => {
    assert.deepEqual(planSync([desired], [synced()]), []);
  });

  void test('사람이 붙인 라벨은 유지', () => {
    const issue = synced({ labels: [...desired.labels, 'priority'] });
    assert.deepEqual(planSync([desired], [issue]), []);
  });

  void test('resolved로 이동 → body 갱신 + close(completed)', () => {
    const closed = toDesiredIssue(
      parseIssueDoc('docs/issues/resolved/2026-01-02-b.md', sample),
      repo,
    );
    const [action] = planSync([closed], [synced()]);
    assert.equal(action.kind, 'update');
    if (action.kind !== 'update') return;
    assert.equal(action.changes.state, 'closed');
    assert.equal(action.stateReason, 'completed');
    assert.ok(action.changes.body);
  });

  void test('closed Issue인데 md가 active → reopen', () => {
    const [action] = planSync([desired], [synced({ state: 'closed' })]);
    assert.ok(action.kind === 'update' && action.stateReason === 'reopened');
  });

  void test('상태 라벨 교체', () => {
    const issue = synced({ labels: ['docs-mirror', 'status:조사중'] });
    const [action] = planSync([desired], [issue]);
    assert.ok(action.kind === 'update');
    if (action.kind !== 'update') return;
    assert.deepEqual(action.changes.labels, ['docs-mirror', 'status:보류']);
  });

  void test('md 사라짐 → not_planned close + docs:removed, 이후엔 no-op', () => {
    const [action] = planSync([], [synced()]);
    assert.ok(action.kind === 'update');
    if (action.kind !== 'update') return;
    assert.equal(action.stateReason, 'not_planned');
    assert.deepEqual(action.changes.labels, ['docs-mirror', 'docs:removed']);
    const after = synced({
      state: 'closed',
      labels: ['docs-mirror', 'docs:removed'],
    });
    assert.deepEqual(planSync([], [after]), []);
  });

  void test('같은 slug 중복 Issue는 번호 작은 것만 관리', () => {
    const actions = planSync(
      [desired],
      [synced({ number: 9, title: 'x' }), synced({ number: 3 })],
    );
    assert.deepEqual(actions, []);
  });
});
