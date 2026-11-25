import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
test('delivers only the selected payload to its destination and verifies a single claim', async () => {
  const hooks = {};
  const event = name => ({ addListener: handler => { hooks[name] = handler; } });
  const storage = {};
  const destination = 'https://veilbench-hybrid-ai.web.app/';
  const chrome = {
    runtime: { onInstalled: event('install'), onMessage: event('internal'), onMessageExternal: event('external') },
    contextMenus: { onClicked: event('click') },
    tabs: { query: async () => [], create: async () => ({ id: 15 }), update: async () => {}, onRemoved: event('close'), onUpdated: event('navigate') },
    storage: { session: { set: async obj => Object.assign(storage, obj), get: async () => storage, remove: async key => { delete storage[key]; } } },
  };
  vm.runInNewContext(await readFile(new URL('./worker.js', import.meta.url), 'utf8'), { chrome, TextEncoder, crypto });
  await hooks.click({ menuItemId: 'check-with-veilbench', selectionText: ' synthetic selection ' }, { title: 'Test' });
  const sender = { url: destination, frameId: 0, tab: { id: 15 } };
  const request = (hook, msg, caller = sender) => new Promise(resolve => {
    if (!hooks[hook](msg, caller, resolve)) resolve(null);
  });
  const deliver = { type: 'veilbench.deliver.v1' };
  assert.equal(await request('internal', deliver, { ...sender, frameId: 1 }), null);
  assert.equal(await request('internal', deliver, { ...sender, tab: { id: 99 } }), null);
  for (const url of [destination + 'other', destination + '?query', destination + '#hash', 'https://not-veilbench.example/']) {
    assert.equal(await request('internal', deliver, { ...sender, url }), null);
  }
  const data = await request('internal', deliver);
  assert.equal(data.text, ' synthetic selection ');
  assert.equal(storage['intake-15'].payload, undefined);
  assert.match(storage['intake-15'].hash, /^[a-f0-9]{64}$/);
  assert.equal(await request('internal', deliver), null);
  const verify = { ...data, type: 'veilbench.verify.v1' };
  assert.equal(await request('external', { ...verify, text: 'different' }), false);
  assert.deepEqual(await Promise.all([request('external', verify), request('external', verify)]), [true, null]);
  assert.equal(await request('internal', deliver), null);
});

test('focuses an existing ready workbench without reloading or opening a duplicate tab', async () => {
  const hooks = {};
  const event = name => ({ addListener: handler => { hooks[name] = handler; } });
  const storage = {};
  const calls = [];
  const destination = 'https://veilbench-hybrid-ai.web.app/';
  const chrome = {
    runtime: { onInstalled: event('install'), onMessage: event('internal'), onMessageExternal: event('external') },
    contextMenus: { onClicked: event('click') },
    tabs: {
      query: async filter => { assert.equal(filter.url, destination); return [{ id: 11, windowId: 12 }]; },
      sendMessage: async (id, message, options) => {
        assert.equal(id, 11);
        assert.equal(options.frameId, 0);
        calls.push(message.type);
        if (message.type === 'veilbench.resume.v1') assert.equal(storage['intake-11'].payload.text, 'selected');
        return true;
      },
      update: async (_id, options) => { assert.equal(options.active, true); assert.equal(options.url, undefined); },
      onRemoved: event('close'), onUpdated: event('navigate'),
    },
    windows: { update: async (id, options) => { assert.equal(id, 12); assert.equal(options.focused, true); } },
    storage: { session: { set: async obj => Object.assign(storage, obj), get: async () => storage, remove: async key => { delete storage[key]; } } },
  };
  vm.runInNewContext(await readFile(new URL('./worker.js', import.meta.url), 'utf8'), { chrome, TextEncoder, crypto });
  await hooks.click({ menuItemId: 'check-with-veilbench', selectionText: 'selected' }, { title: 'Test' });
  assert.deepEqual(calls, ['veilbench.is-ready.v1', 'veilbench.resume.v1']);
});
