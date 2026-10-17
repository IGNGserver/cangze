import { Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { Page } from '../components/Page.tsx';

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <Page title={t(titleKey)}>
      <Empty description={t('common.comingSoon')} style={{ marginTop: 80 }} />
    </Page>
  );
}
