import type { HaEntity, HaService } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Descriptions, Drawer, Flex, Input, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useCallService } from '../../api/ha.ts';
import { formatState } from '../../lib/entities.tsx';
import { errorText } from '../../lib/errors.ts';
import { HistoryChart } from './HistoryChart.tsx';

export function EntityDrawer({
  entity,
  areaName,
  onClose,
}: {
  entity: HaEntity | null;
  areaName: (id: string | null) => string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Drawer open={Boolean(entity)} onClose={onClose} width={480} title={entity?.name} destroyOnHidden>
      {entity && (
        <Flex vertical gap={24}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {formatState(t, entity)}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t('devices.changed', { when: dayjs(entity.last_changed).fromNow() })}
            </Typography.Text>
          </div>
          {entity.domain === 'camera' && (
            <img
              src={`/api/v1/ha/camera/${entity.entity_id}?t=${encodeURIComponent(entity.last_updated)}`}
              alt={entity.name}
              style={{ width: '100%', borderRadius: 8 }}
            />
          )}
          <HistoryChart entity={entity} />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('devices.entityId')}>
              <Typography.Text copyable className="cz-mono">
                {entity.entity_id}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('devices.area')}>{areaName(entity.area_id) ?? '—'}</Descriptions.Item>
            {entity.labels.length > 0 && (
              <Descriptions.Item label={t('devices.labels')}>
                {entity.labels.map((l) => (
                  <Tag key={l}>{l}</Tag>
                ))}
              </Descriptions.Item>
            )}
            {entity.platform && (
              <Descriptions.Item label={t('devices.integration')}>{entity.platform}</Descriptions.Item>
            )}
          </Descriptions>
          <div>
            <Typography.Title level={5}>{t('devices.attributes')}</Typography.Title>
            <pre className="cz-mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(entity.attributes, null, 2)}
            </pre>
          </div>
          <ServiceCaller entity={entity} />
        </Flex>
      )}
    </Drawer>
  );
}

function ServiceCaller({ entity }: { entity: HaEntity }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const services = useQuery({
    queryKey: ['ha', 'services', entity.domain],
    queryFn: () => api.get<HaService[]>('/ha/services', { domain: entity.domain }),
  });
  const [service, setService] = useState<string | undefined>();
  const [data, setData] = useState('{}');
  const call = useCallService();
  const selected = useMemo(() => services.data?.find((s) => s.service === service), [services.data, service]);

  const submit = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data || '{}') as Record<string, unknown>;
    } catch {
      void message.error(t('devices.invalidJson'));
      return;
    }
    call.mutate(
      { domain: entity.domain, service: service!, target: { entity_id: entity.entity_id }, data: parsed },
      {
        onSuccess: () => void message.success(t('devices.serviceCalled')),
        onError: (e) => void message.error(errorText(t, e)),
      },
    );
  };

  return (
    <div>
      <Typography.Title level={5}>{t('devices.advanced')}</Typography.Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          placeholder={t('devices.chooseService')}
          value={service}
          onChange={setService}
          loading={services.isLoading}
          style={{ width: '100%' }}
          options={(services.data ?? []).map((s) => ({
            value: s.service,
            label: `${s.domain}.${s.service}`,
          }))}
        />
        {selected && Object.keys(selected.fields).length > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('devices.fields')}: {Object.keys(selected.fields).join(', ')}
          </Typography.Text>
        )}
        <Input.TextArea className="cz-mono" rows={3} value={data} onChange={(e) => setData(e.target.value)} />
        <Button type="primary" disabled={!service} loading={call.isPending} onClick={submit}>
          {t('devices.callService')}
        </Button>
      </Space>
    </div>
  );
}
