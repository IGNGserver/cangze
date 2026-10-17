import { XProvider } from '@ant-design/x';
import xEnUS from '@ant-design/x/locale/en_US';
import xZhCN from '@ant-design/x/locale/zh_CN';
import { App as AntApp } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fluentTheme } from './fluent.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeCtx {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ mode: 'system', resolved: 'light', setMode: () => undefined });

export const useThemeMode = () => useContext(Ctx);

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem('cangze.theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // storage unavailable
  }
  return 'system';
}

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      resolved,
      setMode: (m) => {
        setModeState(m);
        try {
          localStorage.setItem('cangze.theme', m);
        } catch {
          // ignore
        }
      },
    }),
    [mode, resolved],
  );

  const themeConfig = useMemo(() => fluentTheme(resolved), [resolved]);
  const locale = i18n.language === 'zh-CN' ? { ...zhCN, ...xZhCN } : { ...enUS, ...xEnUS };

  return (
    <Ctx.Provider value={value}>
      <XProvider theme={themeConfig} locale={locale}>
        <AntApp>{children}</AntApp>
      </XProvider>
    </Ctx.Provider>
  );
}
