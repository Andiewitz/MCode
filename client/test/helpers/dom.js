// Minimal DOM + xterm + Tauri IPC fakes for the terminal manager tests.
// The real terminal module only needs element creation, class toggling, and
// append/remove — enough to exercise tab and lifecycle logic under `node --test`.

class ClassList {
  constructor() {
    this.names = new Set();
  }
  add(...names) {
    for (const name of names) this.names.add(name);
  }
  remove(...names) {
    for (const name of names) this.names.delete(name);
  }
  contains(name) {
    return this.names.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.names.has(name) : Boolean(force);
    if (on) this.names.add(name);
    else this.names.delete(name);
    return on;
  }
}

export class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.classList = new ClassList();
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = {};
    this.tabIndex = 0;
    this.style = {};
  }
  get className() {
    return [...this.classList.names].join(' ');
  }
  set className(value) {
    this.classList.names = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }
  appendChild(node) {
    if (typeof node === 'string') {
      this.textContent += node;
      return node;
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === '.hidden' && node.classList.contains('hidden')) return node;
      node = node.parentElement;
    }
    return null;
  }
}

export class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.cols = 80;
    this.rows = 24;
    this.writes = [];
    this.disposed = false;
    this.focused = false;
  }
  open(element) {
    this.element = element;
  }
  loadAddon() {}
  onData(handler) {
    this.dataHandler = handler;
  }
  writeln(line) {
    this.writes.push(line);
  }
  write(data) {
    this.writes.push(data);
  }
  reset() {
    this.writes.push('[reset]');
  }
  dispose() {
    this.disposed = true;
  }
  focus() {
    this.focused = true;
  }
}

export class FakeFitAddon {
  fit() {
    this.fitted = true;
  }
}

export function installDom() {
  const terminals = [];
  const ipc = {
    calls: [],
    nextId: 1,
    listeners: new Map(),
  };

  class TrackedTerminal extends FakeTerminal {
    constructor(options) {
      super(options);
      terminals.push(this);
    }
  }

  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.self = globalThis;
  globalThis.window = {
    Terminal: TrackedTerminal,
    FitAddon: FakeFitAddon,
    __TAURI__: {
      core: {
        invoke: async (command, args = {}) => {
          ipc.calls.push({ command, args });
          if (command === 'terminal_create') return ipc.nextId++;
          return null;
        },
      },
      event: {
        listen: async (event, handler) => {
          ipc.listeners.set(event, handler);
          return () => ipc.listeners.delete(event);
        },
      },
    },
  };

  return { terminals, ipc };
}
