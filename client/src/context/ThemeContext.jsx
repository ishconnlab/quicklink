import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'quicklink.theme';
const choices = new Set(['light', 'dark', 'system']);
const ThemeContext = createContext(null);

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return choices.has(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(storedTheme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && Boolean(media?.matches));
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    applyTheme();
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch { /* The active theme still applies when storage is unavailable. */ }
    if (theme !== 'system' || !media) return undefined;
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key !== STORAGE_KEY) return;
      setTheme(choices.has(event.newValue) ? event.newValue : 'system');
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const updateTheme = useCallback((value) => {
    if (choices.has(value)) setTheme(value);
  }, []);
  const contextValue = useMemo(() => ({ theme, setTheme: updateTheme }), [theme, updateTheme]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
