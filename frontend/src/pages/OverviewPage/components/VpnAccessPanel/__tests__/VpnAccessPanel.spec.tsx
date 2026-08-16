import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getMyVpnAccess } from '#entities/vpnAccess';
import { ApiError } from '#shared/api';

import { VpnAccessPanel } from '../VpnAccessPanel';

vi.mock('#entities/vpnAccess', () => ({
  myVpnAccessKey: ['vpn-access', 'me'],
  getMyVpnAccess: vi.fn(),
}));

const access = {
  subscription_url: 'https://subscription.example.test/secret-subscription',
  profiles: [
    {
      name: 'ru-fin-vless-443-[web]-Миша',
      protocol: 'vless',
      transport: 'xhttp',
      security: 'reality',
      url: 'vless://secret-profile@example.test#profile',
    },
    {
      name: 'ru-fr-hysteria-4443-[web]-Миша',
      protocol: 'hysteria2',
      transport: null,
      security: 'tls',
      url: 'hysteria2://secret-profile@example.test#profile',
    },
  ],
};

function renderPanel(accountStatus: 'active' | 'paused' | 'blocked' = 'active') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VpnAccessPanel accountStatus={accountStatus} />
    </QueryClientProvider>,
  );
}

describe('VpnAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyVpnAccess).mockResolvedValue(access);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows the subscription, protocol tags and masked profile data', async () => {
    renderPanel();

    const subscription = await screen.findByRole('article', { name: 'Единая подписка' });
    expect(within(subscription).getByText('Одно подключение.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Отдельные подключения')).toBeInTheDocument();
    expect(screen.getByText('VLESS')).toBeInTheDocument();
    expect(screen.getByText('XHTTP')).toBeInTheDocument();
    expect(screen.getByText('REALITY')).toBeInTheDocument();
    expect(screen.getByText('Hysteria2')).toBeInTheDocument();
    expect(screen.getByText('TLS')).toBeInTheDocument();
    expect(screen.queryByText(access.subscription_url)).not.toBeInTheDocument();
    expect(screen.queryByText(access.profiles[0].url)).not.toBeInTheDocument();
  });

  it('copies both link types and opens an accessible QR modal', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderPanel();

    const subscription = await screen.findByRole('article', { name: 'Единая подписка' });
    await user.click(within(subscription).getByRole('button', { name: 'Скопировать ссылку' }));
    expect(writeText).toHaveBeenCalledWith(access.subscription_url);
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка скопирована');

    const profile = screen.getByRole('region', { name: access.profiles[0].name });
    await user.click(within(profile).getByRole('button', { name: 'Копировать' }));
    expect(writeText).toHaveBeenCalledWith(access.profiles[0].url);

    await user.click(within(profile).getByRole('button', { name: `Показать QR ${access.profiles[0].name}` }));
    const dialog = screen.getByRole('dialog', { name: access.profiles[0].name });
    expect(within(dialog).getByTitle(`QR-код: ${access.profiles[0].name}`)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
  });

  it.each(['paused', 'blocked'] as const)('does not request secrets for a %s account', (status) => {
    renderPanel(status);
    expect(screen.getByText('VPN доступен только для активного аккаунта')).toBeInTheDocument();
    expect(screen.queryByText('Обратитесь к администратору после пополнения баланса.')).not.toBeInTheDocument();
    expect(screen.queryByText('Администратор может возобновить участие в настройках аккаунта.')).not.toBeInTheDocument();
    expect(getMyVpnAccess).not.toHaveBeenCalled();
  });

  it('explains when the provider profile is missing', async () => {
    vi.mocked(getMyVpnAccess).mockRejectedValue(new ApiError({
      code: 'vpn_profile_not_found',
      message: 'VPN-профиль не найден',
      status: 404,
    }));
    renderPanel();
    expect(await screen.findByText('VPN-профиль не найден')).toBeInTheDocument();
    expect(screen.getByText(/Обратитесь к администратору/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  });

  it('retries a temporarily unavailable provider', async () => {
    vi.mocked(getMyVpnAccess)
      .mockRejectedValueOnce(new ApiError({
        code: 'vpn_provider_unavailable',
        message: 'VPN-панель временно недоступна',
        status: 502,
      }))
      .mockResolvedValueOnce(access);
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Не удалось загрузить VPN-подключения')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('article', { name: 'Единая подписка' })).toBeInTheDocument();
    expect(getMyVpnAccess).toHaveBeenCalledTimes(2);
  });
});
