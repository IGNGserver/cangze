import { ArrowDown16Regular, ArrowUp16Regular, Pause16Regular } from '@fluentui/react-icons';
import type { HaEntity } from '@cangze/contracts';
import { App, Button, Flex, Popconfirm, Space, Switch, theme, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCallService } from '../../api/ha.ts';
import { domainIcon, formatState, isActive, isUnavailable, quickControl } from '../../lib/entities.tsx';
import { errorText } from '../../lib/errors.ts';

export function EntityTile({ entity, onOpen }: { entity: HaEntity; onOpen: () => void }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const call = useCallService();
  const control = quickControl(entity);
  const active = isActive(entity);
  const unavailable = isUnavailable(entity);

  const run = (service: string, data?: Record<string, unknown>, domain = entity.domain) =>
    call.mutate(
      { domain, service, target: { entity_id: entity.entity_id }, data },
      { onError: (e) => void message.error(errorText(t, e)) },
    );

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  let action: React.ReactNode = null;
  if (!unavailable) {
    if (control.kind === 'toggle') {
      action = (
        <Switch
          size="small"
          checked={active}
          loading={call.isPending}
          onClick={(checked, e) => {
            e.stopPropagation();
            run(checked ? 'turn_on' : 'turn_off');
          }}
        />
      );
    } else if (control.kind === 'lock') {
      action = (
        <Popconfirm
          title={entity.state === 'locked' ? t('devices.confirmUnlock') : t('devices.confirmLock')}
          onConfirm={() => run(entity.state === 'locked' ? 'unlock' : 'lock')}
          onPopupClick={stop}
        >
          <Button size="small" onClick={stop} loading={call.isPending}>
            {entity.state === 'locked' ? t('devices.unlock') : t('devices.lock')}
          </Button>
        </Popconfirm>
      );
    } else if (control.kind === 'run') {
      action = (
        <Button
          size="small"
          loading={call.isPending}
          onClick={(e) => {
            e.stopPropagation();
            run(control.service);
          }}
        >
          {t('devices.run')}
        </Button>
      );
    } else if (control.kind === 'cover') {
      action = (
        <Space.Compact size="small" onClick={stop}>
          <Button
            icon={<ArrowUp16Regular />}
            aria-label={t('devices.open')}
            onClick={() => run('open_cover')}
          />
          <Button
            icon={<Pause16Regular />}
            aria-label={t('devices.stop')}
            onClick={() => run('stop_cover')}
          />
          <Button
            icon={<ArrowDown16Regular />}
            aria-label={t('devices.close')}
            onClick={() => run('close_cover')}
          />
        </Space.Compact>
      );
    } else if (control.kind === 'climate' && typeof entity.attributes.temperature === 'number') {
      const temp = entity.attributes.temperature as number;
      const step = (entity.attributes.target_temp_step as number | undefined) ?? 0.5;
      action = (
        <Space.Compact size="small" onClick={stop}>
          <Button onClick={() => run('set_temperature', { temperature: temp - step })}>−</Button>
          <Button onClick={() => run('set_temperature', { temperature: temp + step })}>+</Button>
        </Space.Compact>
      );
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : undefined)}
      style={{
        cursor: 'pointer',
        padding: 12,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: active ? token.colorPrimaryBg : token.colorBgContainer,
        opacity: unavailable ? 0.6 : 1,
        transition: `background ${token.motionDurationMid}`,
        minHeight: 72,
      }}
    >
      <Flex align="center" gap={10} justify="space-between">
        <Flex align="center" gap={10} style={{ minWidth: 0 }}>
          <span style={{ color: active ? token.colorPrimary : token.colorTextSecondary, display: 'flex' }}>
            {domainIcon(entity)}
          </span>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong ellipsis style={{ display: 'block' }}>
              {entity.name}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
              {formatState(t, entity)}
            </Typography.Text>
          </div>
        </Flex>
        {action}
      </Flex>
    </div>
  );
}
