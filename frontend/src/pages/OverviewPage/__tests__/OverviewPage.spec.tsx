import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useUserStore } from '#entities/user';

import { OverviewPage } from '../OverviewPage';

const user = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, is_active: true, is_blocked: false,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

describe('OverviewPage', () => {
  beforeEach(() => {
    useUserStore.setState({ user, status: 'authenticated' });
  });

  it('shows account state and exact financial values', () => {
    render(<OverviewPage />);
    expect(screen.getByText('Привет, Миша')).toBeInTheDocument();
    expect(screen.getByText(/10,00/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Участие в программе' })).toBeEnabled();
  });

  it('disables participation control for a blocked account', async () => {
    useUserStore.setState({ user: { ...user, is_blocked: true } });
    render(<OverviewPage />);
    expect(screen.getByRole('switch', { name: 'Участие в программе' })).toBeDisabled();
    expect(screen.getByText('Аккаунт заблокирован')).toBeInTheDocument();
  });

  it('opens password change form', async () => {
    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Изменить пароль' })).toBeInTheDocument());
  });
});

