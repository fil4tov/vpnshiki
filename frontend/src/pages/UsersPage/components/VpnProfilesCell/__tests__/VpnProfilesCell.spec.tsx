import { fireEvent, render, screen } from '@testing-library/react';

import { VpnProfilesCell } from '../VpnProfilesCell';

describe('VpnProfilesCell', () => {
  it('opens for keyboard focus and closes with Escape', async () => {
    render(
      <VpnProfilesCell
        userName="Лена"
        profiles={[{ enabled: true, label: 'Лена-mobile', status: 'online' }]}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: '1 VPN-профиль у пользователя Лена',
    });
    trigger.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Лена-mobile');

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('toggles profile details on touch', async () => {
    render(
      <VpnProfilesCell
        userName="Лена"
        profiles={[{ enabled: false, label: 'Лена-PC', status: 'offline' }]}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: '1 VPN-профиль у пользователя Лена',
    });
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Лена-PC');

    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
