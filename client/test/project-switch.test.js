import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectSwitch } from '../src/project-switch.js';

test('terminals restart before the file tree mounts', async () => {
  const order = [];
  const tree = { root: '/projects/beta' };
  let mounted = null;

  await applyProjectSwitch({
    path: '/projects/beta',
    resetTerminals: async (path) => order.push(`reset:${path}`),
    mountTree: async (path) => {
      order.push(`mount:${path}`);
      return tree;
    },
    onTree: (next) => {
      mounted = next;
    },
  });

  assert.deepEqual(order, ['reset:/projects/beta', 'mount:/projects/beta']);
  assert.equal(mounted, tree);
});

test('a failed terminal reset does not block the project tree', async () => {
  const errors = [];
  let mounted = null;

  await applyProjectSwitch({
    path: '/projects/beta',
    resetTerminals: async () => {
      throw new Error('pty unavailable');
    },
    mountTree: async () => ({ root: '/projects/beta' }),
    onTree: (next) => {
      mounted = next;
    },
    onTerminalError: (err) => errors.push(err.message),
  });

  assert.deepEqual(errors, ['pty unavailable']);
  assert.ok(mounted, 'tree should still mount');
});

test('a failed tree mount still restarts terminals first', async () => {
  const calls = [];

  await assert.rejects(
    applyProjectSwitch({
      path: '/projects/beta',
      resetTerminals: async () => calls.push('reset'),
      mountTree: async () => {
        calls.push('mount');
        throw new Error('scan failed');
      },
    }),
    /scan failed/
  );

  assert.deepEqual(calls, ['reset', 'mount']);
});
