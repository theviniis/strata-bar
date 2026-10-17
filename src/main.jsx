import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/styles.css';
import NativeBar from './components/status-bar/NativeBar';
const nativeView = Boolean(window.__TAURI_INTERNALS__);
createRoot(document.getElementById('root')).render(
  <React.StrictMode>{nativeView ? <NativeBar /> : <App />}</React.StrictMode>,
);
