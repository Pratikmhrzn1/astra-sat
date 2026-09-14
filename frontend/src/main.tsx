import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { connectSessionToHttp } from '@/features/auth';
import '@/app/styles/index.css';

// Before the first render, so no request can go out without the session.
connectSessionToHttp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
