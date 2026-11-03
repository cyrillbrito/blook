import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@rrweb/replay/dist/style.css';
import '@/assets/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
