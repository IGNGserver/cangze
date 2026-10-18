import { Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import { Page } from '../../components/Page.tsx';
import { AuditPanel } from './AuditPanel.tsx';
import { SystemLogPanel } from './SystemLogPanel.tsx';
import { UsagePanel } from './UsagePanel.tsx';

export function LogsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('nav.logs')} subtitle={t('logs.subtitle')}>
      <Tabs
        destroyOnHidden
        items={[
          { key: 'audit', label: t('logs.tabs.audit'), children: <AuditPanel /> },
          { key: 'usage', label: t('logs.tabs.usage'), children: <UsagePanel /> },
          { key: 'system', label: t('logs.tabs.system'), children: <SystemLogPanel /> },
        ]}
      />
    </Page>
  );
}
