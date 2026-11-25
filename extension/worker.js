const destination = 'https://veilbench-hybrid-ai.web.app/';
const menuId = 'check-with-veilbench';
const maxLength = 200_000;
const ttl = 2 * 60_000;
const key = tabId => 'intake-' + tabId;
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: menuId, title: 'Check with VeilBench', contexts: ['selection'] });
});
async function openSelection(info, source) {
  if (info.menuItemId !== menuId || !info.selectionText?.trim()) return;
  if (info.selectionText.length > maxLength) {
    // The destination enforces the same size limit. Never submit a silently truncated document.
    await chrome.tabs.create({ url: chrome.runtime.getURL('too-long.html') });
    return;
  }
  const payload = { type: 'veilbench.intake.v1', title: (source?.title?.trim() || 'Browser selection').slice(0, 120), text: info.selectionText };
  // An already loaded workbench may contain unsaved local work. Deliver without reloading it.
  const candidates = await chrome.tabs.query({ url: destination });
  for (const tab of candidates) {
    if (!Number.isInteger(tab.id)) continue;
    try {
      if (!await chrome.tabs.sendMessage(tab.id, { type: 'veilbench.is-ready.v1' }, { frameId: 0 })) continue;
      await chrome.storage.session.set({ [key(tab.id)]: { payload, expires: Date.now() + ttl } });
      if (await chrome.tabs.sendMessage(tab.id, { type: 'veilbench.resume.v1' }, { frameId: 0 })) {
        // Once posted, a closing window must not send the same selection to a second tab.
        await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        return;
      }
    } catch {
      // A pre-install tab has no content script, or the tab navigated during the handshake.
    }
    await chrome.storage.session.remove(key(tab.id));
  }
  const target = await chrome.tabs.create({ url: 'about:blank' });
  const slot = key(target.id);
  try {
    await chrome.storage.session.set({ [slot]: { payload, expires: Date.now() + ttl } });
    await chrome.tabs.update(target.id, { url: destination });
  } catch {
    await chrome.storage.session.remove(slot);
  }
}
let lastSelection = Promise.resolve();
chrome.contextMenus.onClicked.addListener((info, source) => {
  lastSelection = lastSelection.catch(() => {}).then(() => openSelection(info, source));
  return lastSelection;
});
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(key(tabId)));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url && change.url !== destination) void chrome.storage.session.remove(key(tabId));
});
const claims = new Map();
async function receipt(title, text) {
  const bytes = new TextEncoder().encode(JSON.stringify([title, text]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function handle(message, sender, respond, verify) {
  if (sender.url !== destination || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) return false;
  if (message?.type !== (verify ? 'veilbench.verify.v1' : 'veilbench.deliver.v1')) return false;
  const slot = key(sender.tab.id);
  const previous = claims.get(slot) || Promise.resolve();
  const operation = previous.then(async () => {
    const stored = (await chrome.storage.session.get(slot))[slot];
    if (!stored || Date.now() >= stored.expires) {
      await chrome.storage.session.remove(slot);
      return respond(null);
    }
    if (!verify) {
      if (!stored.payload) return respond(null);
      // Legacy workbenches do not send a verification callback. Discard the raw selection now.
      const hash = await receipt(stored.payload.title, stored.payload.text);
      await chrome.storage.session.set({ [slot]: { hash, expires: stored.expires } });
      return respond(stored.payload);
    }
    if (!stored.hash || typeof message.text !== 'string' || message.text.length > maxLength ||
        typeof message.title !== 'string' || message.title.length > 120) return respond(false);
    if (await receipt(message.title, message.text) !== stored.hash) return respond(false);
    await chrome.storage.session.remove(slot);
    respond(true);
  }).catch(() => respond(null));
  claims.set(slot, operation);
  void operation.then(() => { if (claims.get(slot) === operation) claims.delete(slot); });
  return true;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => handle(message, sender, respond, false));
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => handle(message, sender, respond, true));
