// Entry of the standalone viewer.html (bun run build:viewer). No extension APIs.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ViewerApp } from '../ViewerApp';
import '@rrweb/replay/dist/style.css';
import './standalone.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViewerApp />
  </React.StrictMode>,
);
