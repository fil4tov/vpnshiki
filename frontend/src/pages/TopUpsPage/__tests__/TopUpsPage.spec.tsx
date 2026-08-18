import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import { getAdminYooMoneyPayments } from '#entities/payment';
import type { AdminYooMoneyPayment } from '#entities/payment';

import { TopUpsPage } from '../TopUpsPage';

vi.mock('#entities/payment', async () => {
  const actual = await vi.importActual<typeof import('#entities/payment')>('#entities/payment');
  return { ...actual, getAdminYooMoneyPayments: vi.fn() };
});

const payments: AdminYooMoneyPayment[] = [
  {
    id: 'payment-pending', user_id: 'user-one', user_name: 'Алина', label: 'pay_pending',
    requested_amount: '100.00', withdrawn_amount: null, received_amount: null,
    payment_type: null, operation_id: null, status: 'pending',
    last_reconciliation_check_at: '2026-08-18T10:01:00Z',
    created_at: '2026-08-18T10:00:00Z', paid_at: null,
  },
  {
    id: 'payment-success', user_id: 'user-two', user_name: 'Максим', label: 'pay_success',
    requested_amount: '200.00', withdrawn_amount: '206.00', received_amount: '194.00',
    payment_type: 'AC', operation_id: 'operation-one', status: 'succeeded',
    last_reconciliation_check_at: null,
    created_at: '2026-08-18T09:00:00Z', paid_at: '2026-08-18T09:01:00Z',
  },
];

function renderPage(path = '/admin/top-ups') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/admin/top-ups" element={<TopUpsPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TopUpsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminYooMoneyPayments).mockResolvedValue(payments);
  });

  it('loads real payments and filters the table', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Алина')).toBeInTheDocument();
    expect(screen.getByText('Максим')).toBeInTheDocument();
    expect(getAdminYooMoneyPayments).toHaveBeenCalledOnce();

    const summary = screen.getByRole('region', { name: 'Сводка пополнений' });
    const search = screen.getByRole('textbox', { name: 'Поиск платежей' });
    const table = screen.getByRole('table');
    expect(summary.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const statusFilter = screen.getByRole('combobox', { name: 'Статус' });
    const paymentTypeFilter = screen.getByRole('combobox', { name: 'Способ' });
    expect(screen.queryByText(/из 2 платежей/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить фильтр «Статус»' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить фильтр «Способ»' })).not.toBeInTheDocument();
    await user.click(statusFilter);
    await user.click(screen.getByRole('option', { name: 'Зачислен' }));
    expect(screen.queryByText('Алина')).not.toBeInTheDocument();
    expect(screen.getByText('Максим')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Очистить фильтр «Статус»' }));
    expect(statusFilter).toHaveTextContent('Все');
    expect(screen.getByText('Алина')).toBeInTheDocument();

    await user.click(paymentTypeFilter);
    await user.click(screen.getByRole('option', { name: 'Карта' }));
    expect(screen.queryByText('Алина')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Очистить фильтр «Способ»' }));
    expect(paymentTypeFilter).toHaveTextContent('Все');
    expect(screen.getByText('Алина')).toBeInTheDocument();

    await user.type(search, 'operation-one');
    expect(screen.getByText('Максим')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Очистить всё' }));
    expect(search).toHaveValue('');
    expect(screen.getByText('Алина')).toBeInTheDocument();
  });

  it('shows technical details inline in the operations table', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Журнал операций' })).toBeInTheDocument();
    expect(screen.queryByText('Новые платежи сверху')).not.toBeInTheDocument();
    expect(screen.queryByText('Технические поля раскрываются внутри строки')).not.toBeInTheDocument();
    expect(getAdminYooMoneyPayments).toHaveBeenCalledOnce();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(2);

    await user.click(screen.getAllByRole('button', { name: /Показать детали платежа/ })[0]!);
    expect(screen.getByText('Label YooMoney')).toBeInTheDocument();
    expect(screen.getByText('Способ оплаты')).toBeInTheDocument();
    expect(screen.queryByText('Фактический способ')).not.toBeInTheDocument();
    expect(screen.getByText('Последняя проверка')).toBeInTheDocument();
  });

  it('sorts by every data column and keeps newest payments first by default', async () => {
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByRole('table');
    const headers = ['Создан', 'Пользователь', 'Статус', 'Запрошено', 'Зачислено', 'Способ'];
    expect(screen.getByRole('columnheader', { name: 'Создан' })).toHaveAttribute('aria-sort', 'descending');
    expect(within(within(table).getAllByRole('row')[1]!).getByText('Алина')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Создан' }));
    expect(screen.getByRole('columnheader', { name: 'Создан' })).toHaveAttribute('aria-sort', 'ascending');
    expect(within(within(table).getAllByRole('row')[1]!).getByText('Максим')).toBeInTheDocument();

    for (const label of headers.slice(1)) {
      const button = screen.getByRole('button', { name: label });
      const header = screen.getByRole('columnheader', { name: label });
      await user.click(button);
      expect(header).toHaveAttribute('aria-sort', 'descending');
      await user.click(button);
      expect(header).toHaveAttribute('aria-sort', 'ascending');
    }
  });

  it('shows a retry action when the payment list fails', async () => {
    vi.mocked(getAdminYooMoneyPayments).mockRejectedValue(new Error('backend unavailable'));
    renderPage();

    expect(await screen.findByText('Не удалось загрузить пополнения')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
