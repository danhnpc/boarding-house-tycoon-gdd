import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

// StrictMode double-mounts effects on purpose: it is the cheapest regression
// test that the Phaser host cannot leak a duplicate game instance (tech doc 3.3).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
