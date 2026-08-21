import type { VpnClient } from './types';

export const recommendedVpnClientsKey = ['recommended-vpn-clients'] as const;

export async function getRecommendedVpnClients(): Promise<VpnClient[]> {
  const response = await fetch('/vpn-clients.json', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Не удалось загрузить список VPN-клиентов');
  }

  const data: unknown = await response.json();
  if (
    !Array.isArray(data)
    || data.some((client) => (
      typeof client !== 'object'
      || client === null
      || !('name' in client)
      || typeof client.name !== 'string'
      || !('url' in client)
      || typeof client.url !== 'string'
    ))
  ) {
    throw new Error('Некорректный формат списка VPN-клиентов');
  }

  return data as VpnClient[];
}
