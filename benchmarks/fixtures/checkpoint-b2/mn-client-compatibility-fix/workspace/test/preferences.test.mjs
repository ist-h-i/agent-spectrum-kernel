import assert from 'node:assert/strict';
import test from 'node:test';
import { readPreference } from '../src/preferences.mjs';

test('current client reads present values and falls back for missing values', () => {
  assert.equal(readPreference({ compact: false }, 'compact', true), false);
  assert.equal(readPreference({}, 'compact', true), true);
});

test('supported mobile runtime without Object.hasOwn', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  try {
    Object.defineProperty(Object, 'hasOwn', { ...descriptor, value: undefined });
    assert.equal(readPreference({ theme: 'dark' }, 'theme', 'system'), 'dark');
    assert.equal(readPreference({}, 'theme', 'system'), 'system');
    assert.equal(Object.hasOwn, undefined);
  } finally {
    Object.defineProperty(Object, 'hasOwn', descriptor);
  }
});
