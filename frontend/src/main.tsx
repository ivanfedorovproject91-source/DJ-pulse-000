import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './services/i18n';
import { PrefsProvider } from './services/prefs';
import { loadApiConfig } from './services/api';
import { initTelegram } from './services/telegram';
import './styles/app.css';

initTelegram();

void loadApiConfig().finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </PrefsProvider>
  </StrictMode>,
));
