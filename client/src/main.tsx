import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Variable font CSS — must be imported here so Vite bundles the font files
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/jetbrains-mono';

import './index.css';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
