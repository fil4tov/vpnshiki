import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getMyVpnAccess, myVpnAccessKey } from '#entities/vpnAccess';
import { ApiError } from '#shared/api';

import { VpnAccessPanel } from '../VpnAccessPanel';

vi.mock('#entities/vpnAccess', () => ({
  myVpnAccessKey: ['vpn-access', 'me'],
  getMyVpnAccess: vi.fn(),
}));

const access = {
  profiles: [
    {
      email: 'web-Миша-mobile',
      label: 'Миша-mobile',
      subscription_url: 'https://subscription.example.test/mobile-secret',
      connections: [
        {
          name: 'ru-fin-vless-443-web-Миша-mobile',
          protocol: 'vless',
          transport: 'xhttp',
          security: 'reality',
          url: 'vless://mobile-secret@example.test#profile',
        },
      ],
    },
    {
      email: 'web-Миша-pc',
      label: 'Миша-pc',
      subscription_url: 'https://subscription.example.test/pc-secret',
      connections: [
        {
          name: 'ru-fr-hysteria-4443-web-Миша-pc',
          protocol: 'hysteria2',
          transport: null,
          security: 'tls',
          url: 'hysteria2://pc-secret@example.test#profile',
        },
      ],
    },
  ],
};

function renderPanel(accountStatus: 'active' | 'paused' | 'blocked' = 'active') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <VpnAccessPanel accountStatus={accountStatus} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
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

  it('opens and closes the connection panel accessibly', async () => {
    const user = userEvent.setup();
    renderPanel();

    const toggle = await screen.findByRole('button', { name: /отдельные подключения/i });
    const list = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(list).toHaveAttribute('inert');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(list).not.toHaveAttribute('inert');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(list).toHaveAttribute('inert');
  });

  it('shows accessible profile tabs and only the selected profile data', async () => {
    const user = userEvent.setup();
    renderPanel();

    const tabs = await screen.findByRole('tablist', { name: 'VPN-профили' });
    expect(within(tabs).getByRole('tab', { name: 'Миша-mobile' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'Миша-pc' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('2 профиля')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Миша-mobile');
    await user.click(screen.getByRole('button', { name: 'Показать отдельные подключения' }));
    expect(screen.getByText('VLESS')).toBeInTheDocument();
    expect(screen.getByText('XHTTP')).toBeInTheDocument();
    expect(screen.getByText('REALITY')).toBeInTheDocument();
    expect(screen.queryByText('Hysteria2')).not.toBeInTheDocument();
    expect(screen.queryByText(access.profiles[0].subscription_url)).not.toBeInTheDocument();
    expect(screen.queryByText(access.profiles[0].connections[0].url)).not.toBeInTheDocument();
  });

  it('sorts separate connections by protocol without mutating API data', async () => {
    const user = userEvent.setup();
    const connections = [
      {
        name: 'vless-last',
        protocol: 'vless',
        transport: 'xhttp',
        security: 'reality',
        url: 'vless://last@example.test',
      },
      {
        name: 'hysteria-first',
        protocol: 'hysteria2',
        transport: null,
        security: 'tls',
        url: 'hysteria2://first@example.test',
      },
    ];
    vi.mocked(getMyVpnAccess).mockResolvedValue({
      profiles: [{ ...access.profiles[0], connections }],
    });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Показать отдельные подключения' }));

    const panel = screen.getByRole('article', { name: 'Отдельные подключения' });
    expect(within(panel).getAllByRole('region').map((region) => region.getAttribute('aria-label')))
      .toEqual(['vless-last', 'hysteria-first']);
    expect(connections.map((connection) => connection.name)).toEqual(['vless-last', 'hysteria-first']);
  });

  it('switches subscription, connection actions and QR codes between profiles', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderPanel();

    const subscription = await screen.findByRole('article', { name: 'Единая подписка' });
    await user.click(within(subscription).getByRole('button', { name: 'Скопировать ссылку' }));
    expect(writeText).toHaveBeenLastCalledWith(access.profiles[0].subscription_url);
    await user.click(screen.getByRole('button', { name: 'Показать отдельные подключения' }));

    await user.click(screen.getByRole('tab', { name: 'Миша-pc' }));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Миша-pc');
    expect(screen.queryByText('VLESS')).not.toBeInTheDocument();
    expect(screen.getByText('Hysteria2')).toBeInTheDocument();
    expect(screen.getByText('TLS')).toBeInTheDocument();

    await user.click(within(subscription).getByRole('button', { name: 'Скопировать ссылку' }));
    expect(writeText).toHaveBeenLastCalledWith(access.profiles[1].subscription_url);

    const connection = screen.getByRole('region', { name: access.profiles[1].connections[0].name });
    await user.click(within(connection).getByRole('button', { name: 'Копировать' }));
    expect(writeText).toHaveBeenLastCalledWith(access.profiles[1].connections[0].url);

    await user.click(within(subscription).getByRole('button', { name: 'Показать QR общей подписки' }));
    expect(screen.getByRole('dialog', { name: 'Общая подписка — Миша-pc' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(connection).getByRole('button', {
      name: `Показать QR ${access.profiles[1].connections[0].name}`,
    }));
    const dialog = screen.getByRole('dialog', { name: access.profiles[1].connections[0].name });
    expect(within(dialog).getByTitle(`QR-код: ${access.profiles[1].connections[0].name}`)).toBeInTheDocument();
  });

  it('supports arrow, Home and End keyboard navigation', async () => {
    const user = userEvent.setup();
    renderPanel();

    const mobileTab = await screen.findByRole('tab', { name: 'Миша-mobile' });
    mobileTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Миша-pc' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Миша-pc' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(mobileTab).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Миша-pc' })).toHaveFocus();
  });

  it('does not render tabs for a single profile', async () => {
    vi.mocked(getMyVpnAccess).mockResolvedValue({ profiles: [access.profiles[0]] });
    renderPanel();

    expect(await screen.findByText('1 профиль')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('preserves the selected email while refreshed data still contains it', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPanel();
    await user.click(await screen.findByRole('tab', { name: 'Миша-pc' }));

    act(() => {
      queryClient.setQueryData(myVpnAccessKey, {
        profiles: [
          { ...access.profiles[0], label: 'Миша-mobile updated' },
          { ...access.profiles[1], label: 'Миша-pc updated' },
        ],
      });
    });

    expect(await screen.findByRole('tab', { name: 'Миша-pc updated' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each(['paused', 'blocked'] as const)('does not request secrets for a %s account', (status) => {
    renderPanel(status);
    expect(screen.getByText('VPN недоступен')).toBeInTheDocument();
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
