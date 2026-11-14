import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, FakeElement } from './helpers/dom.js';

const { terminals, ipc } = installDom();
const { createTerminal } = await import('../src/terminal.js');

function makeManager() {
  const host = new FakeElement('div');
  const tabs = new FakeElement('div');
  const statuses = [];
  const terminal = createTerminal({
    host,
    tabs,
    onStatus: (message) => statuses.push(message),
  });
  ipc.calls.length = 0;
  ipc.nextId = 1;
  terminals.length = 0;
  return { terminal, host, tabs, statuses };
}

function commands(name) {
  return ipc.calls.filter((call) => call.command === name);
}

test('add() starts a shell in the requested directory', async () => {
  const { terminal, host, tabs } = makeManager();

  const id = await terminal.add('/projects/alpha');

  assert.equal(typeof id, 'number');
  assert.equal(commands('terminal_create').length, 1);
  assert.equal(commands('terminal_create')[0].args.cwd, '/projects/alpha');
  assert.equal(tabs.children.length, 1);
  assert.equal(host.children.length, 1);
});

test('add() creates independent instances with their own tabs', async () => {
  const { terminal, host, tabs } = makeManager();

  await terminal.add('/projects/alpha');
  await terminal.add('/projects/beta');

  const creates = commands('terminal_create');
  assert.deepEqual(
    creates.map((call) => call.args.cwd),
    ['/projects/alpha', '/projects/beta']
  );
  assert.equal(tabs.children.length, 2);
  assert.equal(tabs.children[1].classList.contains('on'), true);
  assert.equal(host.children[0].classList.contains('hidden'), true);
  assert.equal(host.children[1].classList.contains('hidden'), false);
});

test('remove() kills the session and drops its tab', async () => {
  const { terminal, host, tabs } = makeManager();

  const first = await terminal.add('/projects/alpha');
  await terminal.add('/projects/beta');

  await terminal.remove(first);

  assert.equal(commands('terminal_kill').length, 1);
  assert.equal(commands('terminal_kill')[0].args.id, 1);
  assert.equal(tabs.children.length, 1);
  assert.equal(host.children.length, 1);
  assert.equal(tabs.children[0].children[0].textContent, 'Terminal 2');
});

test('removing the last terminal shows the empty state', async () => {
  const { terminal, host, tabs } = makeManager();

  const id = await terminal.add('/projects/alpha');
  await terminal.remove(id);

  assert.equal(tabs.children.length, 0);
  assert.equal(tabs.classList.contains('hidden'), true);
  const empty = host.children.find((child) => child.className === 'term-empty');
  assert.ok(empty, 'empty state should be rendered');
  assert.equal(empty.children[0].textContent, 'No terminals open');
});

test('resetAll() restarts every shell in the new project directory', async () => {
  const { terminal, tabs } = makeManager();

  await terminal.add('/projects/alpha');
  await terminal.add('/projects/alpha');
  ipc.calls.length = 0;

  await terminal.resetAll('/projects/beta');

  assert.equal(commands('terminal_kill').length, 2);
  const creates = commands('terminal_create');
  assert.equal(creates.length, 2);
  assert.deepEqual(
    creates.map((call) => call.args.cwd),
    ['/projects/beta', '/projects/beta']
  );
  assert.deepEqual(
    tabs.children.map((tab) => tab.children[0].textContent),
    ['Terminal 1', 'Terminal 2']
  );
});

test('resetAll() restarts the remaining shells when one cleanup fails', async () => {
  const { terminal, statuses } = makeManager();

  await terminal.add('/projects/alpha');
  await terminal.add('/projects/alpha');
  terminals[0].reset = () => {
    throw new Error('reset boom');
  };
  ipc.calls.length = 0;

  await terminal.resetAll('/projects/beta');

  assert.equal(commands('terminal_create').length, 2);
  assert.deepEqual(
    commands('terminal_create').map((call) => call.args.cwd),
    ['/projects/beta', '/projects/beta']
  );
  assert.ok(statuses.some((message) => message.includes('Terminal cleanup failed')));
});
