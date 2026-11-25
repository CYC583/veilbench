const origin = 'https://veilbench-hybrid-ai.web.app';
const destination = origin + '/';
let pageReady = false;

async function deliver() {
  if (window.location.href !== destination) return false;
  const payload = await chrome.runtime.sendMessage({ type: 'veilbench.deliver.v1' });
  if (payload?.type !== 'veilbench.intake.v1' || window.location.href !== destination) return false;
  window.postMessage(payload, origin);
  return true;
}

window.addEventListener('message', event => {
  if (window.location.href !== destination || pageReady || event.source !== window || event.origin !== origin || event.data?.type !== 'veilbench.ready.v1') return;
  pageReady = true;
  void deliver().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === 'veilbench.is-ready.v1') {
    respond(pageReady && window.location.href === destination);
    return false;
  }
  if (message.type !== 'veilbench.resume.v1' || !pageReady) return false;
  deliver().then(respond, () => respond(false));
  return true;
});
