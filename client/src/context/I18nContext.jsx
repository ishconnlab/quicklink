import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { translate, LANGUAGES } from '../lib/i18n.js';

const STORAGE_KEY = 'quicklink.lang';
const I18nContext = createContext(null);

function initialLang() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  return 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((code) => {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    localStorage.setItem(STORAGE_KEY, code);
    setLangState(code);
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export default I18nContext;
