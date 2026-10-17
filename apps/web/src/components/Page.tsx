import { Flex, Grid, theme, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

/** Standard page frame: title bar with actions and a scrollable body. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  bodyStyle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyStyle?: CSSProperties;
}) {
  const { token } = theme.useToken();
  const pad = Grid.useBreakpoint().md ? 24 : 16;
  return (
    <Flex vertical style={{ height: '100%' }}>
      <Flex
        align="center"
        justify="space-between"
        gap={12}
        wrap
        style={{ padding: `16px ${pad}px`, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
        </div>
        {actions && (
          <Flex gap={8} wrap>
            {actions}
          </Flex>
        )}
      </Flex>
      <div className="cz-scroll" style={{ flex: 1, minHeight: 0, padding: pad, ...bodyStyle }}>
        {children}
      </div>
    </Flex>
  );
}
