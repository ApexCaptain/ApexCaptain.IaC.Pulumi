import fs from 'fs';
import os from 'os';
import path from 'path';

import { resolveReferencedStackStage } from '../src/configs/stack-stage-fallback.config';
import { StackStage } from '../src/enums/stack-stage.enum';

describe('resolveReferencedStackStage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-fallback-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back from dev to prod when only Pulumi.prod.yaml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.prod.yaml'), '{}');
    expect(
      resolveReferencedStackStage('k8s-workstation-system', 'dev', tmpDir),
    ).toBe(StackStage.PROD);
  });

  test('returns caller stage when that yaml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.dev.yaml'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.prod.yaml'), '{}');
    expect(
      resolveReferencedStackStage('k8s-workstation-tools', 'dev', tmpDir),
    ).toBe(StackStage.DEV);
  });

  test('throws on unknown stage', () => {
    expect(() =>
      resolveReferencedStackStage('k8s-workstation-system', 'staging', tmpDir),
    ).toThrow(/Unknown stack stage/);
  });

  test('throws when no candidate yaml exists', () => {
    expect(() =>
      resolveReferencedStackStage('k8s-workstation-system', 'dev', tmpDir),
    ).toThrow(/Stack stage fallback not found/);
  });
});
