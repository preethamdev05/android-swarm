import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskSpec, validateFilePath, sanitizeFilePath } from '../validators.js';
import { resolve } from 'node:path';

const baseSpec = {
  app_name: 'MyApp',
  features: ['login', 'list_items'],
  architecture: 'MVVM',
  ui_system: 'Compose',
  min_sdk: 24,
  target_sdk: 34,
  gradle_version: '8.2.0',
  kotlin_version: '1.9.20'
};

test('accepts a valid task spec', () => {
  assert.deepEqual(validateTaskSpec({ ...baseSpec }), baseSpec);
});

test('rejects app_name with surrounding whitespace', () => {
  assert.throws(
    () => validateTaskSpec({ ...baseSpec, app_name: ' MyApp' }),
    /app_name must not include leading or trailing whitespace/
  );
});

test('rejects feature names with surrounding whitespace', () => {
  assert.throws(
    () => validateTaskSpec({ ...baseSpec, features: ['login', ' list_items'] }),
    /must not include leading or trailing whitespace/
  );
});

test('rejects non-integer sdk values', () => {
  assert.throws(
    () => validateTaskSpec({ ...baseSpec, min_sdk: 24.5 }),
    /min_sdk must be an integer between 21 and 34/
  );

  assert.throws(
    () => validateTaskSpec({ ...baseSpec, target_sdk: 33.7 }),
    /target_sdk must be an integer >= min_sdk and <= 34/
  );
});

test('validateFilePath rejects unsafe patterns', () => {
  assert.equal(validateFilePath('app/src/MainActivity.kt'), true);
  assert.equal(validateFilePath('app\\src\\MainActivity.kt'), false);
  assert.equal(validateFilePath('app//src/MainActivity.kt'), false);
});

test('sanitizeFilePath rejects traversal and resolves safe paths', () => {
  const basePath = resolve('/tmp/android-swarm');
  assert.throws(
    () => sanitizeFilePath(basePath, '../escape.txt'),
    /Invalid file path/
  );

  const resolved = sanitizeFilePath(basePath, 'app/src/MainActivity.kt');
  assert.equal(resolved, resolve(basePath, 'app/src/MainActivity.kt'));
});
