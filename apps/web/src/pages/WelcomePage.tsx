import type { SessionSummary } from '@cangze/contracts';
import { App, Button, Card, Flex, Steps, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../api/client.ts';
import { useHaStatus } from '../api/queries.ts';
import { useModelDefaults } from '../api/sessions.ts';
import { Logo } from '../components/Logo.tsx';
import { errorText } from '../lib/errors.ts';
import { HaSettings } from './settings/HaSettings.tsx';
import { ModelsSettings } from './settings/ModelsSettings.tsx';

export const WELCOME_DONE_KEY = 'cangze.welcomeDone';

export function WelcomePage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const ha = useHaStatus();
  const defaults = useModelDefaults();
  const [step, setStep] = useState(ha.data?.state === 'connected' ? 1 : 0);
  const haOk = ha.data?.state === 'connected';
  const modelOk = Boolean(defaults.data?.chat);

  const finish = async () => {
    try {
      localStorage.setItem(WELCOME_DONE_KEY, '1');
    } catch {
      // ignore
    }
    try {
      const s = await api.post<SessionSummary>('/sessions', {});
      navigate(`/sessions/${s.id}`);
    } catch (e) {
      void message.error(errorText(t, e));
      navigate('/sessions');
    }
  };

  return (
    <Flex vertical style={{ height: '100%' }}>
      <div className="cz-scroll" style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <Flex align="center" gap={12} style={{ marginBottom: 24 }}>
            <Logo size={40} />
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {t('welcome.title')}
              </Typography.Title>
              <Typography.Text type="secondary">{t('welcome.subtitle')}</Typography.Text>
            </div>
          </Flex>
          <Steps
            current={step}
            onChange={setStep}
            style={{ marginBottom: 24 }}
            items={[
              { title: t('welcome.steps.ha'), status: haOk ? 'finish' : step === 0 ? 'process' : 'wait' },
              {
                title: t('welcome.steps.model'),
                status: modelOk ? 'finish' : step === 1 ? 'process' : 'wait',
              },
              { title: t('welcome.steps.done') },
            ]}
          />
          {step === 0 && <HaSettings />}
          {step === 1 && <ModelsSettings />}
          {step === 2 && (
            <Card>
              <Typography.Title level={4}>{t('welcome.readyTitle')}</Typography.Title>
              <Typography.Paragraph>{t('welcome.readyText')}</Typography.Paragraph>
              <ul>
                <li>{t('welcome.tip1')}</li>
                <li>{t('welcome.tip2')}</li>
                <li>{t('welcome.tip3')}</li>
              </ul>
            </Card>
          )}
          <Flex justify="space-between" style={{ marginTop: 16 }}>
            <Button onClick={() => void finish()}>{t('welcome.skip')}</Button>
            {step < 2 ? (
              <Button type="primary" onClick={() => setStep(step + 1)}>
                {t('welcome.next')}
              </Button>
            ) : (
              <Button type="primary" onClick={() => void finish()}>
                {t('welcome.start')}
              </Button>
            )}
          </Flex>
        </div>
      </div>
    </Flex>
  );
}
