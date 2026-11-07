import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';
import { LAYOUT } from '../../theme/fluent.ts';

export function Section({
  title,
  description,
  extra,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} extra={extra} style={{ marginBottom: LAYOUT.gapLG }}>
      {description && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          {description}
        </Typography.Paragraph>
      )}
      {children}
    </Card>
  );
}
