import { getInitData } from './telegram';
import type { Prefs } from './prefs';

let API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Адрес бота: из переменной сборки или из data/bot.json, который записывает workflow «Deploy bot». */
export async function loadApiConfig(): Promise<void> {
  if (API) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(`${import.meta.env.BASE_URL}data/bot.json`, { cache: 'no-cache', signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const j = (await res.json()) as { api?: unknown };
    if (typeof j.api === 'string' && /^https:\/\//.test(j.api)) API = j.api.replace(/\/$/, '');
  } catch { /* бот не подключён — дайджест недоступен, остальное работает */ }
}

export type SyncResult = 'ok' | 'no-api' | 'no-telegram' | 'error' | 'unauthorized';

/**
 * Сохраняет настройки дайджеста на Worker. Worker проверяет подпись initData по токену бота
 * (HMAC-SHA256) — без подтверждённой подписи данные пользователя не принимаются.
 */
export async function saveDigestPrefs(prefs: Prefs): Promise<SyncResult> {
  if (!API) return 'no-api';
  const initData = getInitData();
  if (!initData) return 'no-telegram';
  try {
    const res = await fetch(`${API}/api/prefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
      body: JSON.stringify({ digest: { ...prefs.digest, favGenres: prefs.favGenres }, lang: prefs.lang }),
    });
    if (res.status === 401) return 'unauthorized';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export const isApiConfigured = () => Boolean(API);
