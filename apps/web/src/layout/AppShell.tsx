import { SignOut20Regular, WeatherMoon20Regular, WeatherSunny20Regular } from '@fluentui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Dropdown, Flex, Grid, theme, Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';
import { api } from '../api/client.ts';
import { qk, useHaStatus } from '../api/queries.ts';
import { useStreamRecovery, useStreamStatus } from '../api/stream.ts';
import { Logo } from '../components/Logo.tsx';
import { NotificationCenter } from '../components/NotificationCenter.tsx';
import { useThemeMode } from '../theme/ThemeProvider.tsx';
import { NAV } from './nav.tsx';

function StatusDot() {
  const { t } = useTranslation();
  const ha = useHaStatus();
  const streamStatus = useStreamStatus();
  const state = ha.data?.state ?? 'unconfigured';
  const status =
    streamStatus !== 'online'
      ? 'default'
      : state === 'connected'
        ? 'success'
        : state === 'connecting'
          ? 'processing'
          : 'error';
  const label = streamStatus !== 'online' ? t('status.hubOffline') : t(`ha.state.${state}`);
  return (
    <Tooltip title={label} placement="right">
      <Badge status={status} />
    </Tooltip>
  );
}

export function AppShell() {
  useStreamRecovery();
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const location = useLocation();
  const qc = useQueryClient();
  const { resolved, setMode } = useThemeMode();
  const mobile = !screens.md;

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    await qc.invalidateQueries({ queryKey: qk.auth });
  };

  const items = NAV.map((item) => {
    const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    const Icon = item.icon;
    return (
      <NavLink key={item.key} to={item.path} style={{ textDecoration: 'none' }} aria-label={t(item.labelKey)}>
        <Flex
          vertical={!mobile}
          align="center"
          justify="center"
          gap={mobile ? 0 : 2}
          style={{
            width: mobile ? 56 : 68,
            height: mobile ? 52 : 56,
            borderRadius: token.borderRadiusLG,
            color: active ? token.colorPrimary : token.colorTextSecondary,
            background: active ? token.colorBgContainer : 'transparent',
            boxShadow: active && !mobile ? token.boxShadowTertiary : 'none',
            position: 'relative',
          }}
        >
          <Icon filled={active} />
          <Typography.Text
            ellipsis
            style={{
              fontSize: 11,
              color: 'inherit',
              fontWeight: active ? 600 : 400,
              maxWidth: mobile ? 52 : 64,
            }}
          >
            {t(item.labelKey)}
          </Typography.Text>
        </Flex>
      </NavLink>
    );
  });

  const userMenu = (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'theme',
            icon: resolved === 'dark' ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />,
            label: resolved === 'dark' ? t('shell.lightMode') : t('shell.darkMode'),
            onClick: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
          },
          { type: 'divider' },
          {
            key: 'logout',
            icon: <SignOut20Regular />,
            label: t('auth.logout'),
            onClick: () => void logout(),
          },
        ],
      }}
    >
      <Button type="text" aria-label={t('shell.account')} style={{ padding: 4, height: 'auto' }}>
        <Logo size={28} />
      </Button>
    </Dropdown>
  );

  if (mobile) {
    return (
      <Flex vertical style={{ height: '100%' }}>
        <Flex
          align="center"
          justify="space-between"
          style={{ padding: '2px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          {userMenu}
          <Flex gap={12} align="center">
            <StatusDot />
            <NotificationCenter />
          </Flex>
        </Flex>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </div>
        <Flex
          justify="space-around"
          align="center"
          style={{
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgLayout,
            padding: '2px 4px',
          }}
        >
          {items}
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex style={{ height: '100%' }}>
      <Flex
        vertical
        align="center"
        justify="space-between"
        style={{
          width: 'var(--cz-rail-width)',
          padding: '12px 0',
          flexShrink: 0,
          background: token.colorBgLayout,
        }}
      >
        <Flex vertical align="center" gap={6}>
          {userMenu}
          <div style={{ height: 8 }} />
          {items}
        </Flex>
        <Flex vertical align="center" gap={10}>
          <NotificationCenter />
          <StatusDot />
        </Flex>
      </Flex>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          margin: '8px 8px 8px 0',
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadowTertiary,
          overflow: 'hidden',
        }}
      >
        <Outlet />
      </div>
    </Flex>
  );
}
