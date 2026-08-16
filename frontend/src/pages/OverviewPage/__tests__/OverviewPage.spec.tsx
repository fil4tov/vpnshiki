import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { getMyVpnAccess } from '#entities/vpnAccess';
import { getMyDailyCharge, useUserStore } from '#entities/user';

import { OverviewPage } from '../OverviewPage';

const user = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, getMyDailyCharge: vi.fn() };
});

vi.mock('#entities/vpnAccess', async () => {
  const actual = await vi.importActual<typeof import('#entities/vpnAccess')>('#entities/vpnAccess');
  return { ...actual, getMyVpnAccess: vi.fn() };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage />
    </QueryClientProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    useUserStore.setState({ user, status: 'authenticated' });
    vi.mocked(getMyDailyCharge).mockResolvedValue({ daily_charge: '50.00' });
    vi.mocked(getMyVpnAccess).mockResolvedValue({
      subscription_url: 'https://subscription.example.test/test',
      profiles: [],
    });
  });

  it('shows account state and exact financial values', async () => {
    renderPage();
    const accountCard = screen.getByRole('region', { name: 'Статус участия и баланс' });
    expect(screen.getByText('Личный кабинет')).toBeInTheDocument();
    expect(screen.getByText('Привет, Миша')).toBeInTheDocument();
    expect(within(accountCard).getByText(/10,00/)).toBeInTheDocument();
    expect(within(accountCard).getByText(/Лимит минуса:.*200,00/)).toBeInTheDocument();
    const dailyChargeLabel = await within(accountCard).findByText('Суточное списание');
    expect(dailyChargeLabel).toBeInTheDocument();
    expect(dailyChargeLabel.closest('div')).toHaveAttribute('data-tone', 'active');
    expect(await within(accountCard).findByText(/50,00/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Участие в программе' })).not.toBeInTheDocument();
  });

  it('covers the whole daily charge pill with a skeleton while loading', () => {
    vi.mocked(getMyDailyCharge).mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole('status', { name: 'Загрузка суточного списания' })).toBeInTheDocument();
    expect(screen.queryByText('Суточное списание')).not.toBeInTheDocument();
  });

  it('shows a blocked account without participation controls', async () => {
    useUserStore.setState({ user: { ...user, account_status: 'blocked' } });
    renderPage();
    expect(screen.queryByRole('switch', { name: 'Участие в программе' })).not.toBeInTheDocument();
    expect(screen.getByText('Аккаунт заблокирован')).toBeInTheDocument();
    expect((await screen.findByText('Суточное списание')).closest('div')).toHaveAttribute('data-tone', 'muted');
  });

  it('mutes the daily charge for a paused account', async () => {
    useUserStore.setState({ user: { ...user, account_status: 'paused' } });
    renderPage();
    expect(screen.getByText('Аккаунт приостановлен')).toBeInTheDocument();
    expect(screen.getByText('Списания отменены, VPN-профиль заблокирован.')).toBeInTheDocument();
    expect((await screen.findByText('Суточное списание')).closest('div')).toHaveAttribute('data-tone', 'muted');
  });

  it('does not duplicate password controls from the profile menu', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Изменить пароль' })).not.toBeInTheDocument();
  });
});
