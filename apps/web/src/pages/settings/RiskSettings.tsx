import type { RiskPolicy } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { App, Form, InputNumber, Select, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useFullPut } from '../../api/full-put.ts';
import { errorText } from '../../lib/errors.ts';
import { Section } from './Section.tsx';

export function RiskSettings() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const policy = useQuery({
    queryKey: ['settings', 'risk'],
    queryFn: () => api.get<RiskPolicy>('/settings/risk'),
  });

  const save = useFullPut<RiskPolicy>({
    queryKey: ['settings', 'risk'],
    url: '/settings/risk',
    data: policy.data,
    onError: (e) => void message.error(errorText(t, e)),
  });

  const confirmInSessions = (enabled: boolean) => {
    if (enabled) {
      void save({ confirmInSessions: true });
      return;
    }
    modal.confirm({
      title: t('settings.risk.disableConfirmTitle'),
      content: t('settings.risk.disableConfirmText'),
      okText: t('settings.risk.disableConfirmOk'),
      okButtonProps: { danger: true },
      onOk: () => save({ confirmInSessions: false }),
    });
  };

  const p = policy.data;
  return (
    <Section title={t('settings.risk.title')} description={t('settings.risk.hint')}>
      {p && (
        <Form layout="vertical">
          <Form.Item label={t('settings.risk.confirm')} extra={t('settings.risk.confirmHint')}>
            <Switch checked={p.confirmInSessions} onChange={confirmInSessions} />
          </Form.Item>
          <Form.Item label={t('settings.risk.domains')}>
            <Select
              mode="tags"
              value={p.highRiskDomains}
              onChange={(v: string[]) => void save({ highRiskDomains: v })}
            />
          </Form.Item>
          <Form.Item label={t('settings.risk.services')}>
            <Select
              mode="tags"
              value={p.highRiskServices}
              onChange={(v: string[]) => void save({ highRiskServices: v })}
            />
          </Form.Item>
          <Form.Item label={t('settings.risk.covers')}>
            <Select
              mode="tags"
              value={p.highRiskCoverClasses}
              onChange={(v: string[]) => void save({ highRiskCoverClasses: v })}
            />
          </Form.Item>
          <Form.Item label={t('settings.risk.config')}>
            <Switch
              checked={p.configurationIsHighRisk}
              onChange={(v) => void save({ configurationIsHighRisk: v })}
            />
          </Form.Item>
          <Form.Item label={t('settings.risk.timeout')}>
            <InputNumber
              min={30}
              max={86400}
              value={p.approvalTimeoutSeconds}
              addonAfter={t('settings.risk.seconds')}
              onChange={(v) => v && void save({ approvalTimeoutSeconds: v })}
            />
          </Form.Item>
        </Form>
      )}
    </Section>
  );
}
