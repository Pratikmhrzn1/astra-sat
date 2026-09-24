import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from '@/app/App';
import { bindSessionToTransport } from '@/features/auth';
import '@/app/styles/index.css';

// Before the first render, so no request can go out without the session.
bindSessionToTransport();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
