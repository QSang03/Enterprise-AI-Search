"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";
import en from "../lib/locales/en.json";
import vi from "../lib/locales/vi.json";

type Language = "en" | "vi";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const dictionaries = { en, vi };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");

  useEffect(() => {
    const saved = (Cookies.get("app_lang") || localStorage.getItem("app_lang")) as Language;
    if (saved && (saved === "en" || saved === "vi")) {
      setLanguageState(saved);
      document.documentElement.lang = saved;
    } else {
      const browserLang = navigator.language;
      if (browserLang.startsWith("vi")) {
        setLanguageState("vi");
        document.documentElement.lang = "vi";
        Cookies.set("app_lang", "vi", { expires: 365 });
      } else {
        document.documentElement.lang = "en";
        Cookies.set("app_lang", "en", { expires: 365 });
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app_lang", lang);
    Cookies.set("app_lang", lang, { expires: 365 });
    document.documentElement.lang = lang;
  };

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const dict = dictionaries[language];
    const keys = key.split(".");
    let value: any = dict;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Fallback to English dictionary if not found in current dictionary
        let fallbackValue: any = dictionaries.en;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === "object" && fk in fallbackValue) {
            fallbackValue = fallbackValue[fk];
          } else {
            fallbackValue = null;
            break;
          }
        }
        if (typeof fallbackValue === "string") {
          value = fallbackValue;
        } else {
          return key;
        }
        break;
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (replacements) {
      return Object.entries(replacements).reduce((acc, [k, v]) => {
        return acc.replaceAll(`{${k}}`, String(v));
      }, value);
    }

    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
