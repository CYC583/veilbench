import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { captureRelayFragment } from './integrations/relayLink';
import './index.css';
import App from './App';
import { installEgressLedger } from './services/egressLedger';

// Before anything else: move a #relay=<id> bearer secret into memory and strip it from the URL, so no SDK,
// analytics page_location or referrer can see it.
captureRelayFragment();

// A3: record every cross-origin request (destination, bytes, SHA-256; never bodies) before Firebase starts.
installEgressLedger();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
