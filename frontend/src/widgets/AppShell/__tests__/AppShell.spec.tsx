import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import { useUserStore } from '#entities/user';

import { getMyCharges, getMyTopUps } from '../../../entities/user/api';

import { AppShell } from '../AppShell';

const baseUser = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const, block_source: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

vi.mock('../../../entities/user/api', async () => {
  const actual = await vi.importActual<typeof import('../../../entities/user/api')>('../../../entities/user/api');
  return { ...actual, getMyCharges: vi.fn(), getMyTopUps: vi.fn() };
});

function renderShell(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell theme="dark" toggleTheme={() => undefined} />}>
            <Route path="/" element={<div>Личный обзор</div>} />
            <Route path="/admin/users" element={<div>Список пользователей</div>} />
            <Route path="/admin/tariff-plans" element={<div>Тарифные планы</div>} />
            <Route path="/admin/top-ups" element={<div>Пополнения</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyCharges).mockResolvedValue([]);
    vi.mocked(getMyTopUps).mockResolvedValue([]);
    useUserStore.setState({ user: baseUser, status: 'authenticated' });
  });

  it('shows a header without a sidebar and opens the user menu', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByRole('link', { name: 'VPNщики — личный обзор' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Навигация администратора' })).not.toBeInTheDocument();
    expect(screen.queryByText('делим честно')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }));
    expect(screen.getByRole('menu', { name: 'Меню пользователя' })).toBeInTheDocument();
    expect(screen.getByText('Миша')).toBeInTheDocument();
    expect(screen.queryByText('Участник')).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'История списаний',
      'История пополнений',
      'Сменить пароль',
      'Выйти',
    ]);

    await user.click(screen.getByRole('menuitem', { name: 'История списаний' }));
    expect(await screen.findByRole('dialog', { name: 'История списаний' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Меню пользователя' })).not.toBeInTheDocument();
    expect(getMyCharges).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }));
    await user.click(screen.getByRole('menuitem', { name: 'История пополнений' }));
    expect(await screen.findByRole('dialog', { name: 'История пополнений' })).toBeInTheDocument();
    expect(getMyTopUps).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }));
    await user.click(screen.getByRole('menuitem', { name: 'Сменить пароль' }));
    expect(screen.getByRole('dialog', { name: 'Изменить пароль' })).toBeInTheDocument();

    const newPassword = screen.getByLabelText('Новый пароль');
    const confirmation = screen.getByLabelText('Повторите новый пароль');
    await user.click(screen.getByRole('button', { name: 'Сгенерировать пароль' }));
    expect(newPassword).not.toHaveValue('');
    expect(confirmation).toHaveValue((newPassword as HTMLInputElement).value);
    expect(newPassword).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.queryByText('Пароли не совпадают')).not.toBeInTheDocument();

    await user.clear(newPassword);
    await user.type(newPassword, 'new-password');
    expect(newPassword).toHaveValue('new-password');
    expect(newPassword).toHaveFocus();
    expect(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')).toHaveValue('Миша');

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Изменить пароль' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }));
    await user.click(screen.getByRole('menuitem', { name: 'Сменить пароль' }));
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('');
    expect(screen.getByLabelText('Повторите новый пароль')).toHaveValue('');
  });

  it('shows the admin entry and users sidebar only inside the admin panel', () => {
    useUserStore.setState({ user: { ...baseUser, role: 'admin' }, status: 'authenticated' });
    renderShell('/admin/users');

    expect(screen.getByRole('link', { name: 'Админ-панель' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('navigation', { name: 'Навигация администратора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пополнения' })).toBeInTheDocument();
  });

  it('keeps the admin shell and header entry active on tariff plans', () => {
    useUserStore.setState({ user: { ...baseUser, role: 'admin' }, status: 'authenticated' });
    renderShell('/admin/tariff-plans');

    expect(screen.getByRole('navigation', { name: 'Навигация администратора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Админ-панель' }).className).toContain('activeAdminLink');
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toHaveAttribute('href', '/admin/tariff-plans');
  });

  it('keeps the admin shell active on top ups', () => {
    useUserStore.setState({ user: { ...baseUser, role: 'admin' }, status: 'authenticated' });
    renderShell('/admin/top-ups');

    expect(screen.getByRole('navigation', { name: 'Навигация администратора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пополнения' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Пополнения' })).toHaveAttribute('href', '/admin/top-ups');
  });
});
