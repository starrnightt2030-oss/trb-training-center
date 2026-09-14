import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'trb.theme';

interface ThemeCtx {
  choice: ThemeChoice;
  resolved: Resolved;
  setChoice: (c: ThemeChoice) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  choice: 'system', resolved: 'light', setChoice: () => {}, toggle: () => {},
});

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* التخزين المحلي قد يكون محجوباً */ }
  return 'system';
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** يطبّق السمة على عنصر <html> — نفس المنطق المستخدم في السكربت المبكر داخل index.html */
function apply(resolved: Resolved) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#090d14' : '#0a1c38');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    (typeof window === 'undefined' ? 'system' : readChoice()));
  const [sysDark, setSysDark] = useState<boolean>(() =>
    (typeof window === 'undefined' ? false : systemIsDark()));

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved: Resolved = choice === 'system' ? (sysDark ? 'dark' : 'light') : choice;

  useEffect(() => { apply(resolved); }, [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch { /* تجاهُل */ }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setChoice]);

  const value = useMemo(() => ({ choice, resolved, setChoice, toggle }), [choice, resolved, setChoice, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
