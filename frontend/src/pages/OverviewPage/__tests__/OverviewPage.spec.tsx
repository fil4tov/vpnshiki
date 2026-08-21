import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getMyVpnAccess } from '#entities/vpnAccess';
import { activateMyAccount, getMyDailyCharge, useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';

import { OverviewPage } from '../OverviewPage';

const user = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const, block_source: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

vi.mock('#entities/user', async () => {
  const actual = await vi.importActual<typeof import('#entities/user')>('#entities/user');
  return { ...actual, activateMyAccount: vi.fn(), getMyDailyCharge: vi.fn() };
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
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'Hiddify', url: 'https://hiddify.com/' }]),
    }));
    useUserStore.setState({ user, status: 'authenticated' });
    vi.mocked(getMyDailyCharge).mockResolvedValue({ daily_charge: '50.00' });
    vi.mocked(getMyVpnAccess).mockResolvedValue({
      profiles: [{
        email: 'web-Миша-mobile',
        label: 'Миша-mobile',
        subscription_url: 'https://subscription.example.test/test',
        connections: [],
      }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows recommended VPN clients below the access panel', async () => {
    renderPage();

    const vpnSection = screen.getByRole('region', { name: 'Ваш VPN' });
    const clientsSection = await screen.findByRole('region', { name: 'Приложения для подключения' });

    expect(vpnSection.compareDocumentPosition(clientsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(clientsSection).findByRole('link', { name: /Hiddify/ })).toHaveAttribute('target', '_blank');
  });

  it.each(['paused', 'blocked'] as const)(
    'hides recommended VPN clients when the account is %s',
    (accountStatus) => {
      useUserStore.setState({
        user: {
          ...user,
          account_status: accountStatus,
          block_source: accountStatus === 'blocked' ? 'billing' : null,
        },
      });

      renderPage();

      expect(screen.queryByRole('region', { name: 'Приложения для подключения' })).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('shows account state and exact financial values', async () => {
    renderPage();
    const accountCard = screen.getByRole('region', { name: 'Статус участия и баланс' });
    expect(screen.getByText('Личный кабинет')).toBeInTheDocument();
    expect(screen.getByText('Привет, Миша')).toBeInTheDocument();
    expect(within(accountCard).getByText('Аккаунт активен')).toBeInTheDocument();
    expect(within(accountCard).getByText(/10,00/)).toBeInTheDocument();
    expect(within(accountCard).getByText(/Лимит минуса:.*200,00/)).toBeInTheDocument();
    const dailyChargeLabel = await within(accountCard).findByText('Суточное списание');
    expect(dailyChargeLabel).toBeInTheDocument();
    expect(dailyChargeLabel.closest('div')).toHaveAttribute('data-tone', 'active');
    expect(await within(accountCard).findByText(/50,00/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Активировать аккаунт' })).not.toBeInTheDocument();
  });

  it('opens balance top-up from the page heading', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Пополнить' }));

    expect(screen.getByRole('dialog', { name: 'Пополнить баланс' })).toBeInTheDocument();
    expect(screen.getByLabelText('Сумма платежа, ₽')).toBeInTheDocument();
  });

  it('covers the whole daily charge pill with a skeleton while loading', () => {
    vi.mocked(getMyDailyCharge).mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole('status', { name: 'Загрузка суточного списания' })).toBeInTheDocument();
    expect(screen.queryByText('Суточное списание')).not.toBeInTheDocument();
  });

  it('directs an administrator-blocked account to the administrator', () => {
    useUserStore.setState({
      user: { ...user, account_status: 'blocked', block_source: 'admin' },
    });
    renderPage();
    expect(screen.queryByRole('switch', { name: 'Активировать аккаунт' })).not.toBeInTheDocument();
    expect(screen.getByText('Аккаунт заблокирован')).toBeInTheDocument();
    expect(screen.getByText('Обратитесь к администратору.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пополнить' })).not.toBeInTheDocument();
    expect(screen.queryByText('Суточное списание')).not.toBeInTheDocument();
    expect(getMyDailyCharge).not.toHaveBeenCalled();
  });

  it('prompts a billing-blocked account to top up its balance', () => {
    useUserStore.setState({
      user: { ...user, account_status: 'blocked', block_source: 'billing' },
    });
    renderPage();

    expect(screen.getByText('Пополните баланс для разблокировки.')).toBeInTheDocument();
    expect(screen.queryByText('Обратитесь к администратору.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пополнить' })).toBeInTheDocument();
  });

  it('lets a paused account activate itself and refreshes its daily charge', async () => {
    const browserUser = userEvent.setup();
    useUserStore.setState({ user: { ...user, account_status: 'paused' } });
    vi.mocked(activateMyAccount).mockResolvedValue({ ...user, account_status: 'active' });
    renderPage();
    expect(screen.getByText('Аккаунт приостановлен')).toBeInTheDocument();
    expect(screen.getByText('Списания отменены, VPN-профиль заблокирован.')).toBeInTheDocument();
    expect(screen.queryByText('Суточное списание')).not.toBeInTheDocument();
    expect(getMyDailyCharge).not.toHaveBeenCalled();

    await browserUser.click(screen.getByRole('switch', { name: 'Активировать аккаунт' }));

    expect(activateMyAccount).toHaveBeenCalledOnce();
    expect(await screen.findByText('Аккаунт активен')).toBeInTheDocument();
    expect(await screen.findByText('Суточное списание')).toBeInTheDocument();
    expect(useUserStore.getState().user?.account_status).toBe('active');
  });

  it('disables activation below the allowed balance and explains why', () => {
    useUserStore.setState({
      user: { ...user, account_status: 'paused', balance: '-200.01' },
    });
    renderPage();

    expect(screen.getByRole('switch', { name: 'Активировать аккаунт' })).toBeDisabled();
    expect(screen.getByText('Пополните баланс для активации')).toBeInTheDocument();
    expect(screen.queryByText('Суточное списание')).not.toBeInTheDocument();
  });

  it('shows an activation error and restores the switch', async () => {
    const browserUser = userEvent.setup();
    useUserStore.setState({ user: { ...user, account_status: 'paused' } });
    vi.mocked(activateMyAccount).mockRejectedValue(new ApiError({
      status: 503,
      code: 'activation_failed',
      message: 'Активация временно недоступна',
    }));
    renderPage();

    await browserUser.click(screen.getByRole('switch', { name: 'Активировать аккаунт' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Активация временно недоступна');
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Активировать аккаунт' })).not.toBeDisabled();
    });
  });

  it('does not duplicate password controls from the profile menu', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Изменить пароль' })).not.toBeInTheDocument();
  });
});
