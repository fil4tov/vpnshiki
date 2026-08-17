import { useEffect } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

import { useUserStore } from '#entities/user';
import { LoadingState } from '#shared/ui';
import { AppShell } from '#widgets/AppShell';

import { LoginPage } from './LoginPage';
import { OverviewPage } from './OverviewPage';
import { PaymentResultPage } from './PaymentResultPage';
import { TariffPlansPage } from './TariffPlansPage';
import { UsersPage } from './UsersPage';

interface PagesProps { theme: 'light' | 'dark'; toggleTheme: () => void }

export function Pages({ theme, toggleTheme }: PagesProps) {
  const status = useUserStore((state) => state.status);
  const user = useUserStore((state) => state.user);
  const initialize = useUserStore((state) => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);

  const routes = useRoutes([
    { path: '/login', element: status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage /> },
    {
      element: status === 'authenticated' ? <AppShell theme={theme} toggleTheme={toggleTheme} /> : <Navigate to="/login" replace />,
      children: [
        { path: '/', element: <OverviewPage /> },
        { path: '/payments/:paymentId', element: <PaymentResultPage /> },
        { path: '/admin', element: user?.role === 'admin' ? <Navigate to="/admin/users" replace /> : <Navigate to="/" replace /> },
        { path: '/admin/users', element: user?.role === 'admin' ? <UsersPage /> : <Navigate to="/" replace /> },
        { path: '/admin/tariff-plans', element: user?.role === 'admin' ? <TariffPlansPage /> : <Navigate to="/" replace /> },
      ],
    },
    { path: '*', element: <Navigate to={status === 'authenticated' ? '/' : '/login'} replace /> },
  ]);

  if (status === 'checking') return <LoadingState label="Проверяем доступ" />;
  return routes;
}
