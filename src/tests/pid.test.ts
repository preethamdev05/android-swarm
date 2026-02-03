import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupStalePidFile, inspectPidFile } from '../utils/pid.js';

test('removes stale pid files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-pid-'));
  const pidFile = join(dir, 'swarm.pid');
  writeFileSync(pidFile, '999999');

  const inspection = cleanupStalePidFile(pidFile);
  assert.equal(inspection.status, 'stale');
  assert.equal(existsSync(pidFile), false);
});

test('keeps active pid files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-pid-'));
  const pidFile = join(dir, 'swarm.pid');
  writeFileSync(pidFile, String(process.pid));

  const inspection = cleanupStalePidFile(pidFile);
  assert.equal(inspection.status, 'active');
  assert.equal(existsSync(pidFile), true);
  unlinkSync(pidFile);
});

test('marks invalid pid files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-pid-'));
  const pidFile = join(dir, 'swarm.pid');
  writeFileSync(pidFile, 'not-a-pid');

  const inspection = cleanupStalePidFile(pidFile);
  assert.equal(inspection.status, 'invalid');
  assert.equal(existsSync(pidFile), false);

  const inspectionAfter = inspectPidFile(pidFile);
  assert.equal(inspectionAfter.status, 'missing');
});
