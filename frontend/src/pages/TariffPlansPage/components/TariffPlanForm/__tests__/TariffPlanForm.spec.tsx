import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { TariffPlan } from '#entities/tariffPlan';
import { ApiError } from '#shared/api';

import { TariffPlanForm } from '../TariffPlanForm';

const futurePlan: TariffPlan = {
  id: 'future',
  name: 'TP_01.09.2099',
  monthly_amount: '1200.00',
  start_date: '2099-09-01',
  end_date: null,
  status: 'scheduled',
  is_editable: true,
  created_at: '2026-08-15T00:00:00Z',
  updated_at: '2026-08-15T00:00:00Z',
};

describe('TariffPlanForm', () => {
  it('generates a disabled name and previews the next boundary', async () => {
    const user = userEvent.setup();
    render(
      <TariffPlanForm
        plans={[futurePlan]}
        onCancel={() => undefined}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.type(screen.getByLabelText('Дата начала'), '2099-08-15');
    expect(screen.getByLabelText('Название')).toHaveValue('TP_15.08.2099');
    expect(screen.getByLabelText('Название')).toBeDisabled();
    expect(screen.getByLabelText(/Дата окончания/)).toHaveValue('31.08.2099');
    expect(screen.getByLabelText(/Дата окончания/)).toBeDisabled();
  });

  it('maps server field errors to the editable control', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError({
      code: 'tariff_plan_date_conflict',
      message: 'Дата занята',
      status: 409,
      fieldErrors: { start_date: 'Дата занята' },
    }));
    render(<TariffPlanForm plans={[]} onCancel={() => undefined} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Сумма за месяц, ₽'), '1000');
    await user.type(screen.getByLabelText('Дата начала'), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Создать план' }));

    expect(await screen.findByText('Дата занята')).toBeInTheDocument();
  });
});
