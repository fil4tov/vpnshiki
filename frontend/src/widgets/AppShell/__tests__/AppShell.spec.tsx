import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useUserStore } from '#entities/user';

import { AppShell } from '../AppShell';

const baseUser = {
  id: 'one', name: 'Миша', balance: '10.00', negative_balance_limit: '200.00',
  role: 'user' as const, account_status: 'active' as const,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell theme="dark" toggleTheme={() => undefined} />}>
          <Route path="/" element={<div>Личный обзор</div>} />
          <Route path="/admin/users" element={<div>Список пользователей</div>} />
          <Route path="/admin/tariff-plans" element={<div>Тарифные планы</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
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

    expect(screen.getByRole('link', { name: 'Админ-панель' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('navigation', { name: 'Навигация администратора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toBeInTheDocument();
  });

  it('keeps the admin shell and header entry active on tariff plans', () => {
    useUserStore.setState({ user: { ...baseUser, role: 'admin' }, status: 'authenticated' });
    renderShell('/admin/tariff-plans');

    expect(screen.getByRole('navigation', { name: 'Навигация администратора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Админ-панель' }).className).toContain('activeAdminLink');
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Тарифные планы' })).toHaveAttribute('href', '/admin/tariff-plans');
  });
});
