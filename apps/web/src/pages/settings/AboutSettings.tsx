import { Descriptions, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useHaStatus, useSystemInfo } from '../../api/queries.ts';
import { Section } from './Section.tsx';

export function AboutSettings() {
  const { t } = useTranslation();
  const info = useSystemInfo();
  const ha = useHaStatus();
  return (
    <Section title={t('settings.about.title')}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('settings.about.version')}>{info.data?.version}</Descriptions.Item>
        <Descriptions.Item label={t('settings.about.haVersion')}>
          {ha.data?.haVersion ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Node.js">{info.data?.node}</Descriptions.Item>
        <Descriptions.Item label={t('settings.about.license')}>Apache-2.0</Descriptions.Item>
        <Descriptions.Item label={t('settings.about.source')}>
          <Typography.Link href="https://github.com/IGNGserver/cangze" target="_blank" rel="noreferrer">
            github.com/IGNGserver/cangze
          </Typography.Link>
        </Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('settings.about.privacy')}
      </Typography.Paragraph>
    </Section>
  );
}
