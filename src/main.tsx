import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installEgressLedger } from './services/egressLedger';

// A3: record every cross-origin request (destination, bytes, SHA-256; never bodies) before Firebase starts.
installEgressLedger();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
