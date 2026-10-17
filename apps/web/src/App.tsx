import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from './api/client.ts';
import { AuthGate } from './auth/AuthGate.tsx';
import { AppShell } from './layout/AppShell.tsx';
import { Placeholder } from './pages/Placeholder.tsx';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

// Pages are split into their own chunks so the first paint only loads the shell.
const DevicesPage = lazy(() =>
  import('./pages/devices/DevicesPage.tsx').then((m) => ({ default: m.DevicesPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthGate>
          <BrowserRouter>
            <Suspense fallback={<Spin fullscreen />}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/sessions" replace />} />
                  <Route path="/sessions/*" element={<Placeholder titleKey="nav.sessions" />} />
                  <Route path="/agents/*" element={<Placeholder titleKey="nav.agents" />} />
                  <Route path="/automations/*" element={<Placeholder titleKey="nav.automations" />} />
                  <Route path="/devices" element={<DevicesPage />} />
                  <Route path="/logs/*" element={<Placeholder titleKey="nav.logs" />} />
                  <Route path="/settings/:tab?" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/sessions" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
