import { ArrowDownload16Regular, ArrowUpload16Regular } from '@fluentui/react-icons';
import type { BackupInfo, BackupSchedule, RetentionSettings } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api/client.ts';
import { errorText } from '../../lib/errors.ts';
import { Section } from './Section.tsx';

const fmtSize = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

async function waitForRestart(): Promise<void> {
  // wait for the hub to go away and come back
  const ping = () =>
    fetch('/health/live', { cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false);
  const start = Date.now();
  let sawDown = false;
  while (Date.now() - start < 120_000) {
    const up = await ping();
    if (!up) sawDown = true;
    if (up && (sawDown || Date.now() - start > 8000)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  location.reload();
}

export function DataSettings() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<{ items: BackupInfo[]; nextScheduled: string | null }>('/backups'),
  });
  const schedule = useQuery({
    queryKey: ['settings', 'backup'],
    queryFn: () => api.get<BackupSchedule>('/settings/backup'),
  });
  const retention = useQuery({
    queryKey: ['settings', 'retention'],
    queryFn: () => api.get<RetentionSettings>('/settings/retention'),
  });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['backups'] });

  const create = async (v: { encrypt: boolean; passphrase?: string; includeCredentials: boolean }) => {
    setBusy(true);
    try {
      await api.post(
        '/backups',
        v.encrypt ? { passphrase: v.passphrase, includeCredentials: v.includeCredentials } : {},
      );
      setCreating(false);
      await refresh();
      void message.success(t('settings.data.created'));
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const restoreConfirmed = async (run: () => Promise<unknown>) => {
    try {
      await run();
      setRestarting(true);
      await waitForRestart();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'passphrase_required')
        void message.warning(t('settings.data.needPassphrase'));
      else void message.error(errorText(t, e));
    }
  };

  const askPassphraseAndRestore = (
    doRestore: (passphrase?: string) => Promise<unknown>,
    encrypted: boolean,
  ) => {
    let pass = '';
    modal.confirm({
      title: t('settings.data.restoreTitle'),
      content: (
        <Flex vertical gap={8}>
          <Typography.Paragraph>{t('settings.data.restoreWarning')}</Typography.Paragraph>
          {encrypted && (
            <Input.Password
              placeholder={t('settings.data.passphrase')}
              onChange={(e) => (pass = e.target.value)}
            />
          )}
        </Flex>
      ),
      okText: t('settings.data.restore'),
      okButtonProps: { danger: true },
      onOk: () => restoreConfirmed(() => doRestore(pass || undefined)),
    });
  };

  const uploadRestore = (file: File) => {
    void file
      .slice(0, 4)
      .text()
      .then((magic) => {
        askPassphraseAndRestore(async (passphrase) => {
          const res = await fetch('/api/v1/backups/restore', {
            method: 'POST',
            headers: {
              'content-type': 'application/octet-stream',
              ...(passphrase ? { 'x-backup-passphrase': encodeURIComponent(passphrase) } : {}),
            },
            body: file,
          });
          if (!res.ok) {
            const err = ((await res.json()) as { error: { code: string; message: string } }).error;
            throw new ApiError(res.status, err.code, err.message);
          }
        }, magic === 'CZB1');
      });
    return false;
  };

  const saveSchedule = async (patch: Partial<BackupSchedule> & { passphrase?: string }) => {
    try {
      const next = await api.put<BackupSchedule>('/settings/backup', { ...schedule.data, ...patch });
      qc.setQueryData(['settings', 'backup'], next);
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const saveRetention = async (patch: Partial<RetentionSettings>) => {
    try {
      const next = await api.put<RetentionSettings>('/settings/retention', { ...retention.data, ...patch });
      qc.setQueryData(['settings', 'retention'], next);
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <>
      <Section
        title={t('settings.data.backups')}
        description={t('settings.data.backupsHint')}
        extra={
          <Space>
            <Upload accept=".czbak" showUploadList={false} beforeUpload={uploadRestore}>
              <Button icon={<ArrowUpload16Regular />}>{t('settings.data.upload')}</Button>
            </Upload>
            <Button type="primary" onClick={() => setCreating(true)}>
              {t('settings.data.create')}
            </Button>
          </Space>
        }
      >
        {backups.data?.nextScheduled && (
          <Typography.Paragraph type="secondary">
            {t('settings.data.next', { when: dayjs(backups.data.nextScheduled).format('YYYY-MM-DD HH:mm') })}
          </Typography.Paragraph>
        )}
        <List
          dataSource={backups.data?.items ?? []}
          locale={{ emptyText: t('settings.data.none') }}
          renderItem={(b) => (
            <List.Item
              actions={[
                <Button
                  key="d"
                  size="small"
                  icon={<ArrowDownload16Regular />}
                  href={`/api/v1/backups/${b.id}/download`}
                >
                  {t('settings.data.download')}
                </Button>,
                <Button
                  key="r"
                  size="small"
                  onClick={() =>
                    askPassphraseAndRestore(
                      (passphrase) => api.post(`/backups/${b.id}/restore`, { passphrase }),
                      b.encrypted,
                    )
                  }
                >
                  {t('settings.data.restore')}
                </Button>,
                <Popconfirm
                  key="x"
                  title={t('settings.data.deleteConfirm')}
                  onConfirm={() => void api.del(`/backups/${b.id}`).then(refresh)}
                >
                  <Button size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    {dayjs(b.createdAt).format('YYYY-MM-DD HH:mm')}
                    <Tag>{t(`settings.data.kinds.${b.kind}`)}</Tag>
                    {b.encrypted && <Tag color="blue">{t('settings.data.encrypted')}</Tag>}
                  </Space>
                }
                description={`${fmtSize(b.size)} · v${b.appVersion}`}
              />
            </List.Item>
          )}
        />
      </Section>

      {schedule.data && (
        <Section title={t('settings.data.schedule')}>
          <Form layout="vertical">
            <Form.Item label={t('settings.data.scheduleEnabled')}>
              <Switch checked={schedule.data.enabled} onChange={(v) => void saveSchedule({ enabled: v })} />
            </Form.Item>
            <Space wrap size={24}>
              <Form.Item label={t('settings.data.cron')} extra={t('agents.trig.cronHint')}>
                <Input
                  className="cz-mono"
                  defaultValue={schedule.data.cron}
                  onBlur={(e) =>
                    e.target.value !== schedule.data!.cron && void saveSchedule({ cron: e.target.value })
                  }
                  style={{ width: 200 }}
                />
              </Form.Item>
              <Form.Item label={t('settings.data.keep')}>
                <InputNumber
                  min={1}
                  max={365}
                  value={schedule.data.keep}
                  onChange={(v) => v && void saveSchedule({ keep: v })}
                />
              </Form.Item>
            </Space>
            <Form.Item
              label={t('settings.data.encryptScheduled')}
              extra={
                schedule.data.hasPassphrase
                  ? t('settings.data.passphraseStored')
                  : t('settings.data.passphraseNeeded')
              }
            >
              <Space wrap>
                <Switch
                  checked={schedule.data.encrypt}
                  onChange={(v) => {
                    if (v && !schedule.data!.hasPassphrase) {
                      let pass = '';
                      modal.confirm({
                        title: t('settings.data.passphrase'),
                        content: <Input.Password onChange={(e) => (pass = e.target.value)} />,
                        onOk: () => saveSchedule({ encrypt: true, passphrase: pass }),
                      });
                    } else
                      void saveSchedule({
                        encrypt: v,
                        includeCredentials: v ? schedule.data!.includeCredentials : false,
                      });
                  }}
                />
                {schedule.data.encrypt && (
                  <Checkbox
                    checked={schedule.data.includeCredentials}
                    onChange={(e) => void saveSchedule({ includeCredentials: e.target.checked })}
                  >
                    {t('settings.data.includeCredentials')}
                  </Checkbox>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Section>
      )}

      {retention.data && (
        <Section title={t('settings.data.retention')} description={t('settings.data.retentionHint')}>
          <Space wrap size={24}>
            <Form.Item label={t('settings.data.auditDays')}>
              <InputNumber
                min={7}
                max={3650}
                value={retention.data.auditDays}
                onChange={(v) => v && void saveRetention({ auditDays: v })}
                addonAfter={t('logs.dayUnit')}
              />
            </Form.Item>
            <Form.Item label={t('settings.data.runsDays')}>
              <InputNumber
                min={7}
                max={3650}
                value={retention.data.runsDays}
                onChange={(v) => v && void saveRetention({ runsDays: v })}
                addonAfter={t('logs.dayUnit')}
              />
            </Form.Item>
            <Form.Item label={t('settings.data.usageDays')}>
              <InputNumber
                min={30}
                max={3650}
                value={retention.data.usageDays}
                onChange={(v) => v && void saveRetention({ usageDays: v })}
                addonAfter={t('logs.dayUnit')}
              />
            </Form.Item>
          </Space>
        </Section>
      )}

      <Modal
        open={creating}
        title={t('settings.data.create')}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          initialValues={{ encrypt: false, includeCredentials: false }}
          onFinish={(v) => void create(v)}
        >
          <Form.Item name="encrypt" valuePropName="checked">
            <Checkbox>{t('settings.data.encrypt')}</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.encrypt !== b.encrypt}>
            {({ getFieldValue }) =>
              getFieldValue('encrypt') && (
                <>
                  <Form.Item
                    name="passphrase"
                    label={t('settings.data.passphrase')}
                    rules={[{ required: true, min: 8 }]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item
                    name="includeCredentials"
                    valuePropName="checked"
                    extra={t('settings.data.includeCredentialsHint')}
                  >
                    <Checkbox>{t('settings.data.includeCredentials')}</Checkbox>
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
          <Alert type="info" showIcon message={t('settings.data.plainHint')} style={{ marginBottom: 16 }} />
          <Button type="primary" htmlType="submit" loading={busy}>
            {t('settings.data.create')}
          </Button>
        </Form>
      </Modal>
      <Modal open={restarting} closable={false} footer={null} centered>
        <Flex vertical align="center" gap={12} style={{ padding: 24 }}>
          <Spin size="large" />
          <Typography.Text>{t('settings.data.restarting')}</Typography.Text>
        </Flex>
      </Modal>
    </>
  );
}
