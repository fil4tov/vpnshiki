import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { RecommendedVpnClients } from '../RecommendedVpnClients';

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecommendedVpnClients />
    </QueryClientProvider>,
  );
}

describe('RecommendedVpnClients', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the editable public list and opens client links in a new tab', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'Hiddify', url: 'https://hiddify.com/' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSection();

    const link = await screen.findByRole('link', { name: /Hiddify/ });
    expect(link).toHaveAttribute('href', 'https://hiddify.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(fetchMock).toHaveBeenCalledWith('/vpn-clients.json', { cache: 'no-store' });

  });
});
