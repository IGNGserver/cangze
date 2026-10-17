import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';

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
    <Card title={title} extra={extra} style={{ marginBottom: 20 }}>
      {description && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          {description}
        </Typography.Paragraph>
      )}
      {children}
    </Card>
  );
}
