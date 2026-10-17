import type { SystemInfo } from '@cangze/contracts';
import { ConfigProvider, Result, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null | 'error'>(null);

  useEffect(() => {
    fetch('/api/v1/system/info')
      .then((r) => (r.ok ? (r.json() as Promise<SystemInfo>) : Promise.reject(new Error(String(r.status)))))
      .then(setInfo)
      .catch(() => setInfo('error'));
  }, []);

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0F6CBD' } }}>
      {info === null ? (
        <Spin fullscreen tip={t('status.loading')} />
      ) : info === 'error' ? (
        <Result status="warning" title={t('status.offline')} />
      ) : (
        <Result
          status="success"
          title={`${t('app.name')} · ${t('status.online')}`}
          subTitle={t('status.version', { version: info.version })}
        />
      )}
    </ConfigProvider>
  );
}
