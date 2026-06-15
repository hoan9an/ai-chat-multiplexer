import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { vi, type TranslationKey } from "./vi";
import { en } from "./en";
import { zh } from "./zh";

export type Lang = "vi" | "en" | "zh";
export type { TranslationKey } from "./vi";

export const LANG_STORAGE_KEY = "ai-chat-multiplexer-lang";
export const DEFAULT_LANG: Lang = "vi";

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { vi, en, zh };

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslateParams) => string;

function applyParams(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

// Resolve a key for a given language: try the active language, fall back to the
// Vietnamese value, then to the raw key string.
export function translate(lang: Lang, key: TranslationKey, params?: TranslateParams): string {
  const template = dictionaries[lang]?.[key] ?? vi[key] ?? key;
  return applyParams(template, params);
}

export function loadLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "vi" || saved === "en" || saved === "zh") return saved;
  } catch {
    // ignore storage access errors (e.g. SSR / privacy mode)
  }
  return DEFAULT_LANG;
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => loadLang());

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage write errors
    }
  }, [lang]);

  const t = useCallback<Translate>((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo<LanguageContextValue>(() => ({ lang, setLang, t }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// When used outside a provider (e.g. isolated component/hook tests), fall back to
// the default Vietnamese translator. This keeps `t` callable everywhere without
// forcing every render site to wrap in <LanguageProvider>.
export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    lang: DEFAULT_LANG,
    setLang: () => undefined,
    t: (key, params) => translate(DEFAULT_LANG, key, params),
  };
}
