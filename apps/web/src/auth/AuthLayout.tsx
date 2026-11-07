import { Card, Flex, theme, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo.tsx';
import { LAYOUT } from '../theme/fluent.ts';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100%', padding: LAYOUT.paddingMD }}>
      <Card
        style={{ width: '100%', maxWidth: 420, boxShadow: token.boxShadowSecondary }}
        styles={{ body: { padding: 32 } }}
      >
        <Flex vertical gap={20}>
          <Flex align="center" gap={LAYOUT.gapMD}>
            <Logo size={40} />
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {t('app.name')}
              </Typography.Title>
              <Typography.Text type="secondary">{t('app.tagline')}</Typography.Text>
            </div>
          </Flex>
          <div>
            <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
              {title}
            </Typography.Title>
            {subtitle && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {subtitle}
              </Typography.Paragraph>
            )}
          </div>
          {children}
        </Flex>
      </Card>
    </Flex>
  );
}
