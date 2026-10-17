import type { HaEntity } from '@cangze/contracts';
import { Empty, Segmented, Spin, theme } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHistory } from '../../api/ha.ts';
import { isNumeric } from '../../lib/entities.tsx';

export function HistoryChart({ entity }: { entity: HaEntity }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [hours, setHours] = useState(24);
  const history = useHistory(entity.entity_id, hours);
  const numeric = isNumeric(entity);
  const points = (history.data ?? []).map((p) => ({ t: p.t, v: numeric ? Number(p.s) : null, s: p.s }));

  return (
    <div>
      <Segmented
        size="small"
        value={hours}
        onChange={(v) => setHours(v as number)}
        options={[
          { label: t('devices.range.6h'), value: 6 },
          { label: t('devices.range.24h'), value: 24 },
          { label: t('devices.range.7d'), value: 168 },
        ]}
        style={{ marginBottom: 12 }}
      />
      {history.isLoading ? (
        <Spin />
      ) : points.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('devices.noHistory')} />
      ) : numeric ? (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={points} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke={token.colorBorderSecondary} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => dayjs(v).format(hours > 24 ? 'MM-DD' : 'HH:mm')}
              tick={{ fontSize: 11, fill: token.colorTextTertiary }}
              stroke={token.colorBorder}
            />
            <YAxis
              tick={{ fontSize: 11, fill: token.colorTextTertiary }}
              stroke={token.colorBorder}
              domain={['auto', 'auto']}
            />
            <Tooltip
              labelFormatter={(v) => dayjs(Number(v)).format('YYYY-MM-DD HH:mm')}
              contentStyle={{
                background: token.colorBgElevated,
                border: 'none',
                borderRadius: 8,
                boxShadow: token.boxShadow,
              }}
            />
            <Area
              type="stepAfter"
              dataKey="v"
              stroke={token.colorPrimary}
              fill={token.colorPrimaryBg}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Timeline points={points} start={Date.now() - hours * 3600_000} />
      )}
    </div>
  );
}

function Timeline({ points, start }: { points: Array<{ t: number; s: string }>; start: number }) {
  const { token } = theme.useToken();
  const end = Date.now();
  const span = end - start;
  const segments = points.map((p, i) => {
    const from = Math.max(p.t, start);
    const to = i + 1 < points.length ? points[i + 1]!.t : end;
    return { s: p.s, left: ((from - start) / span) * 100, width: Math.max(((to - from) / span) * 100, 0.3) };
  });
  const color = (s: string) =>
    ['on', 'open', 'unlocked', 'home', 'playing'].includes(s)
      ? token.colorPrimary
      : s === 'unavailable'
        ? token.colorErrorBg
        : token.colorFillSecondary;
  return (
    <div
      style={{
        position: 'relative',
        height: 28,
        borderRadius: 4,
        overflow: 'hidden',
        background: token.colorFillTertiary,
      }}
    >
      {segments.map((seg, i) => (
        <div
          key={i}
          title={seg.s}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${seg.left}%`,
            width: `${seg.width}%`,
            background: color(seg.s),
          }}
        />
      ))}
    </div>
  );
}
