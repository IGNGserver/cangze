import type { UsageRow } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Segmented, Statistic, Table, theme } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client.ts';

const PALETTE = ['#0F6CBD', '#13A10E', '#CA5010', '#8764B8', '#038387', '#C239B3', '#986F0B', '#4F6BED'];

export function UsagePanel() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['usage', days], queryFn: () => api.get<UsageRow[]>('/usage', { days }) });
  const rows = useMemo(() => q.data ?? [], [q.data]);

  const { byDay, models, byPrincipal, totals } = useMemo(() => {
    const models = [...new Set(rows.map((r) => r.model))];
    const dayMap = new Map<string, Record<string, number | string>>();
    const principal = new Map<
      string,
      {
        key: string;
        name: string;
        kind: string;
        cost: number;
        input: number;
        output: number;
        requests: number;
        unknownRequests: number;
      }
    >();
    const totals = { cost: 0, input: 0, output: 0, requests: 0, unknownRequests: 0 };
    for (const r of rows) {
      const d = dayMap.get(r.day) ?? { day: r.day.slice(5) };
      d[r.model] = Math.round(((Number(d[r.model]) || 0) + r.cost) * 10000) / 10000;
      dayMap.set(r.day, d);
      const k = `${r.principalKind}:${r.principalId}`;
      const p = principal.get(k) ?? {
        key: k,
        name: r.principalName,
        kind: r.principalKind,
        cost: 0,
        input: 0,
        output: 0,
        requests: 0,
        unknownRequests: 0,
      };
      p.cost += r.cost;
      p.input += r.input;
      p.output += r.output;
      p.requests += r.requests;
      p.unknownRequests += r.unknownRequests;
      principal.set(k, p);
      totals.cost += r.cost;
      totals.input += r.input;
      totals.output += r.output;
      totals.requests += r.requests;
      totals.unknownRequests += r.unknownRequests;
    }
    return {
      byDay: [...dayMap.values()],
      models,
      byPrincipal: [...principal.values()].sort((a, b) => b.cost - a.cost),
      totals,
    };
  }, [rows]);

  return (
    <>
      <Segmented
        value={days}
        onChange={(v) => setDays(Number(v))}
        options={[7, 30, 90].map((d) => ({ value: d, label: t('logs.days', { n: d }) }))}
        style={{ marginBottom: 16 }}
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('logs.cost')} value={totals.cost} precision={4} prefix="$" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('logs.requests')} value={totals.requests} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('logs.inputTokens')} value={totals.input} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('logs.outputTokens')} value={totals.output} />
          </Card>
        </Col>
      </Row>
      {rows.length === 0 ? (
        <Empty description={t('logs.noUsage')} />
      ) : (
        <>
          {totals.unknownRequests > 0 && (
            <Card size="small" type="inner" style={{ marginBottom: 16 }}>
              {t('logs.unknownPriceUsage', { requests: totals.unknownRequests })}
            </Card>
          )}
          <Card size="small" title={t('logs.costPerDay')} style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDay} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke={token.colorBorderSecondary} vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: token.colorTextTertiary }}
                  stroke={token.colorBorder}
                />
                <YAxis tick={{ fontSize: 11, fill: token.colorTextTertiary }} stroke={token.colorBorder} />
                <Tooltip
                  contentStyle={{
                    background: token.colorBgElevated,
                    border: 'none',
                    borderRadius: 8,
                    boxShadow: token.boxShadow,
                  }}
                />
                <Legend />
                {models.map((m, i) => (
                  <Bar
                    key={m}
                    dataKey={m}
                    stackId="cost"
                    fill={PALETTE[i % PALETTE.length]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Table
            size="small"
            rowKey="key"
            dataSource={byPrincipal}
            pagination={false}
            columns={[
              { title: t('logs.who'), dataIndex: 'name' },
              {
                title: t('logs.kind'),
                dataIndex: 'kind',
                width: 100,
                render: (k: string) => t(`logs.kinds.${k}`, { defaultValue: k }),
              },
              { title: t('logs.requests'), dataIndex: 'requests', width: 100 },
              { title: t('logs.unknownPriceRequests'), dataIndex: 'unknownRequests', width: 140 },
              { title: t('logs.inputTokens'), dataIndex: 'input', width: 120 },
              { title: t('logs.outputTokens'), dataIndex: 'output', width: 120 },
              {
                title: t('logs.cost'),
                dataIndex: 'cost',
                width: 110,
                render: (c: number) => `$${c.toFixed(4)}`,
              },
            ]}
          />
        </>
      )}
    </>
  );
}
