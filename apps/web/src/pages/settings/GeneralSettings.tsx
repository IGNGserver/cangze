import { Form, Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeMode, type ThemeMode } from '../../theme/ThemeProvider.tsx';
import { Section } from './Section.tsx';

export function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useThemeMode();
  const setLocale = (l: string) => {
    void i18n.changeLanguage(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem('cangze.locale', l);
    } catch {
      // ignore
    }
  };
  return (
    <Section title={t('settings.appearance')}>
      <Form layout="vertical">
        <Form.Item label={t('settings.language')}>
          <Segmented
            value={i18n.language}
            onChange={(v) => setLocale(String(v))}
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('settings.theme')}>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as ThemeMode)}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </Form.Item>
      </Form>
    </Section>
  );
}
