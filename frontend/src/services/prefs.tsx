import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readStore, writeStore } from './storage';
import { telegramLang } from './telegram';

export type Lang = 'ru' | 'en';
export const SECTIONS = ['trend', 'favorites', 'chart', 'genres', 'tracks', 'releases', 'insights', 'news'] as const;
export type SectionId = (typeof SECTIONS)[number];
export const DIGEST_SECTIONS = ['trend', 'mine', 'genres', 'tracks', 'insights'] as const;
export type DigestSection = (typeof DIGEST_SECTIONS)[number];

export interface Prefs {
  lang: Lang;
  hidden: SectionId[];
  favGenres: string[];
  digest: { freq: 'off' | 'daily' | 'weekly'; sections: DigestSection[] };
}

const KEY = 'djpulse.prefs.v1';

function defaults(): Prefs {
  const tl = telegramLang();
  return {
    lang: tl && !tl.startsWith('ru') ? 'en' : 'ru',
    hidden: [],
    favGenres: [],
    digest: { freq: 'off', sections: [...DIGEST_SECTIONS] },
  };
}

/** Настройки, сохранённые старой версией, могут содержать удалённые разделы — отбрасываем их. */
function clean(p: Prefs): Prefs {
  return {
    ...p,
    hidden: p.hidden.filter((s) => SECTIONS.includes(s)),
    digest: { ...p.digest, sections: p.digest.sections.filter((s) => DIGEST_SECTIONS.includes(s)) },
  };
}

interface Ctx {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  toggleFav: (kind: 'favGenres', id: string) => void;
}

const PrefsCtx = createContext<Ctx>(null as unknown as Ctx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => clean(readStore(KEY, defaults())));
  const update = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      writeStore(KEY, next);
      return next;
    });
  }, []);
  const toggleFav = useCallback((kind: 'favGenres', id: string) => {
    setPrefs((cur) => {
      const list = cur[kind].includes(id) ? cur[kind].filter((x) => x !== id) : [...cur[kind], id];
      const next = { ...cur, [kind]: list };
      writeStore(KEY, next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ prefs, update, toggleFav }), [prefs, update, toggleFav]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);
