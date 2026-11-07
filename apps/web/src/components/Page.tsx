import { Flex, Grid, theme, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { LAYOUT } from '../theme/fluent.ts';

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
  const pad = Grid.useBreakpoint().md ? LAYOUT.paddingLG : LAYOUT.paddingMD;
  return (
    <Flex vertical style={{ height: '100%' }}>
      <Flex
        align="center"
        justify="space-between"
        gap={LAYOUT.gapMD}
        wrap
        style={{
          minHeight: LAYOUT.headerHeight,
          padding: `${LAYOUT.paddingSM}px ${pad}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {actions && (
          <Flex gap={LAYOUT.gapSM} wrap align="center">
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
