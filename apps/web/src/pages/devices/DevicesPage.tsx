import { Search20Regular } from '@fluentui/react-icons';
import type { HaEntity } from '@cangze/contracts';
import { Alert, Button, Checkbox, Empty, Flex, Input, Segmented, Select, Skeleton, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAreas, useFloors, useLiveEntities } from '../../api/ha.ts';
import { useEntities, useHaStatus } from '../../api/queries.ts';
import { Page } from '../../components/Page.tsx';
import { EntityDrawer } from './EntityDrawer.tsx';
import { EntityTile } from './EntityTile.tsx';

const PRIMARY_DOMAINS = [
  'light',
  'switch',
  'climate',
  'cover',
  'lock',
  'fan',
  'media_player',
  'camera',
  'sensor',
  'binary_sensor',
  'scene',
  'script',
];

export function DevicesPage() {
  const { t } = useTranslation();
  useLiveEntities();
  const status = useHaStatus();
  const entities = useEntities();
  const areas = useAreas();
  const floors = useFloors();
  const [q, setQ] = useState('');
  const [floor, setFloor] = useState<string>('all');
  const [domains, setDomains] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const areaById = useMemo(() => new Map((areas.data ?? []).map((a) => [a.area_id, a])), [areas.data]);
  const areaName = (id: string | null) => (id ? (areaById.get(id)?.name ?? id) : null);

  const filtered = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (entities.data ?? []).filter((e) => {
      if (!showHidden && (e.hidden || e.entity_category)) return false;
      if (domains.length && !domains.includes(e.domain)) return false;
      if (floor !== 'all') {
        const f = e.area_id ? areaById.get(e.area_id)?.floor_id : null;
        if (floor === '_none' ? f : f !== floor) return false;
      }
      if (terms.length) {
        const hay = `${e.entity_id} ${e.name} ${areaName(e.area_id) ?? ''}`.toLowerCase();
        if (!terms.every((term) => hay.includes(term))) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities.data, q, floor, domains, showHidden, areaById]);

  const groups = useMemo(() => {
    const byArea = new Map<string, HaEntity[]>();
    for (const e of filtered) {
      const key = e.area_id ?? '_none';
      byArea.set(key, [...(byArea.get(key) ?? []), e]);
    }
    const ordered = [...byArea.entries()].sort(([a], [b]) => {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      return (areaName(a) ?? a).localeCompare(areaName(b) ?? b);
    });
    return ordered.map(([area, list]) => ({
      area,
      list: list.sort(
        (x, y) =>
          ((PRIMARY_DOMAINS.indexOf(x.domain) + 100) % 100) -
            ((PRIMARY_DOMAINS.indexOf(y.domain) + 100) % 100) || x.name.localeCompare(y.name),
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, areaById]);

  const domainOptions = useMemo(
    () =>
      [...new Set((entities.data ?? []).map((e) => e.domain))].sort().map((d) => ({ value: d, label: d })),
    [entities.data],
  );

  const open =
    filtered.find((e) => e.entity_id === openId) ??
    entities.data?.find((e) => e.entity_id === openId) ??
    null;
  const notConnected = status.data && status.data.state !== 'connected';

  return (
    <Page
      title={t('devices.title')}
      subtitle={status.data?.locationName ?? undefined}
      actions={
        <Input
          allowClear
          prefix={<Search20Regular />}
          placeholder={t('devices.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260 }}
        />
      }
    >
      {notConnected && (
        <Alert
          type={status.data?.state === 'unconfigured' ? 'info' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          message={t(`ha.state.${status.data!.state}`)}
          description={status.data?.error ?? t('devices.connectHint')}
          action={
            <Link to="/settings/home-assistant">
              <Button size="small">{t('devices.openSettings')}</Button>
            </Link>
          }
        />
      )}
      <Flex gap={12} wrap align="center" style={{ marginBottom: 20 }}>
        <Segmented
          value={floor}
          onChange={(v) => setFloor(String(v))}
          options={[
            { value: 'all', label: t('devices.allFloors') },
            ...(floors.data ?? []).map((f) => ({ value: f.floor_id, label: f.name })),
          ]}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder={t('devices.domains')}
          value={domains}
          onChange={setDomains}
          options={domainOptions}
          style={{ minWidth: 200 }}
          maxTagCount="responsive"
        />
        <Checkbox checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)}>
          {t('devices.showHidden')}
        </Checkbox>
        <Typography.Text type="secondary">{t('devices.count', { count: filtered.length })}</Typography.Text>
      </Flex>
      {entities.isLoading ? (
        <Skeleton active />
      ) : groups.length === 0 ? (
        <Empty description={t('devices.empty')} />
      ) : (
        <Flex vertical gap={28}>
          {groups.map((g) => (
            <section key={g.area}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                {g.area === '_none' ? t('devices.noArea') : areaName(g.area)}
              </Typography.Title>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                  gap: 10,
                }}
              >
                {g.list.map((e) => (
                  <EntityTile key={e.entity_id} entity={e} onOpen={() => setOpenId(e.entity_id)} />
                ))}
              </div>
            </section>
          ))}
        </Flex>
      )}
      <EntityDrawer entity={open} areaName={areaName} onClose={() => setOpenId(null)} />
    </Page>
  );
}
