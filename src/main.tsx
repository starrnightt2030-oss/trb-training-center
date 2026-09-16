import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('عنصر الجذر #root غير موجود في index.html');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// يُثبّت التطبيق على الجوال ويُسرّع الفتح عند ضعف الشبكة
registerServiceWorker();
