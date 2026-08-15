import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

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
  });

  it('shows account state and exact financial values', async () => {
    renderPage();
    const accountCard = screen.getByRole('region', { name: 'Статус участия и баланс' });
    expect(screen.getByText('Личный кабинет')).toBeInTheDocument();
    expect(screen.getByText('Привет, Миша')).toBeInTheDocument();
    expect(within(accountCard).getByText(/10,00/)).toBeInTheDocument();
    expect(within(accountCard).getByText(/Лимит минуса:.*200,00/)).toBeInTheDocument();
    expect(within(accountCard).getByText('Суточное списание')).toBeInTheDocument();
    expect(await within(accountCard).findByText(/50,00/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Участие в программе' })).not.toBeInTheDocument();
  });

  it('shows a blocked account without participation controls', async () => {
    useUserStore.setState({ user: { ...user, account_status: 'blocked' } });
    renderPage();
    expect(screen.queryByRole('switch', { name: 'Участие в программе' })).not.toBeInTheDocument();
    expect(screen.getByText('Аккаунт заблокирован')).toBeInTheDocument();
  });

  it('does not duplicate password controls from the profile menu', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Изменить пароль' })).not.toBeInTheDocument();
  });
});
