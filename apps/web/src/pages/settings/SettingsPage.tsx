import { Grid, Menu, Select, theme } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Page } from '../../components/Page.tsx';
import { AboutSettings } from './AboutSettings.tsx';
import { ClientsSettings } from './ClientsSettings.tsx';
import { DataSettings } from './DataSettings.tsx';
import { GeneralSettings } from './GeneralSettings.tsx';
import { HaSettings } from './HaSettings.tsx';
import { ModelsSettings } from './ModelsSettings.tsx';
import { RiskSettings } from './RiskSettings.tsx';
import { SecuritySettings } from './SecuritySettings.tsx';

export interface SettingsTab {
  key: string;
  labelKey: string;
  render: () => ReactNode;
}

/** Tabs are registered here; later milestones add models, policies and backups. */
export const SETTINGS_TABS: SettingsTab[] = [
  { key: 'general', labelKey: 'settings.tabs.general', render: () => <GeneralSettings /> },
  { key: 'models', labelKey: 'settings.tabs.models', render: () => <ModelsSettings /> },
  { key: 'home-assistant', labelKey: 'settings.tabs.ha', render: () => <HaSettings /> },
  { key: 'risk', labelKey: 'settings.tabs.risk', render: () => <RiskSettings /> },
  { key: 'security', labelKey: 'settings.tabs.security', render: () => <SecuritySettings /> },
  { key: 'clients', labelKey: 'settings.tabs.clients', render: () => <ClientsSettings /> },
  { key: 'data', labelKey: 'settings.tabs.data', render: () => <DataSettings /> },
  { key: 'about', labelKey: 'settings.tabs.about', render: () => <AboutSettings /> },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { tab } = useParams();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const current = SETTINGS_TABS.find((x) => x.key === tab);
  if (!current) return <Navigate to={`/settings/${SETTINGS_TABS[0]!.key}`} replace />;

  const items = SETTINGS_TABS.map((x) => ({ key: x.key, label: t(x.labelKey) }));

  return (
    <Page
      title={t('nav.settings')}
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: screens.md ? 'row' : 'column' }}
    >
      {screens.md ? (
        <Menu
          mode="inline"
          selectedKeys={[current.key]}
          items={items}
          onClick={(e) => navigate(`/settings/${e.key}`)}
          style={{
            width: 220,
            flexShrink: 0,
            padding: 8,
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        />
      ) : (
        <div style={{ padding: '12px 16px 0' }}>
          <Select
            value={current.key}
            options={items.map((i) => ({ value: i.key, label: i.label }))}
            onChange={(k) => navigate(`/settings/${k}`)}
            style={{ width: '100%' }}
          />
        </div>
      )}
      <div className="cz-scroll" style={{ flex: 1, minWidth: 0, padding: 24 }}>
        <div style={{ maxWidth: 760 }}>{current.render()}</div>
      </div>
    </Page>
  );
}
