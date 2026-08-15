import { render, screen } from '@testing-library/react';

import type { TariffPlan } from '#entities/tariffPlan';

import { CurrentTariffCard } from '../CurrentTariffCard';

const activePlan: TariffPlan = {
  id: 'current',
  name: 'TP_01.08.2026',
  monthly_amount: '12400.00',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  status: 'active',
  is_editable: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('CurrentTariffCard', () => {
  it('shows the active plan and its daily per-user calculation', () => {
    render(<CurrentTariffCard plan={activePlan} activeUsers={8} />);

    const card = screen.getByRole('region', { name: 'Текущий тарифный план' });
    expect(card).toHaveTextContent('TP_01.08.2026');
    expect(card).toHaveTextContent('12 400,00');
    expect(card).toHaveTextContent('01.08.2026');
    expect(card).toHaveTextContent('31.08.2026');
    expect(card).toHaveTextContent('Активных пользователей8');
    expect(card).toHaveTextContent('50,00');
    expect(card).toHaveTextContent('В сутки');
    expect(card).not.toHaveTextContent('По текущему числу участников');
  });

  it('explains why no daily amount is available without participants', () => {
    render(<CurrentTariffCard plan={activePlan} activeUsers={0} />);

    expect(screen.getByText('Нет активных пользователей')).toBeInTheDocument();
  });

  it('shows a clear empty state when no plan is active', () => {
    render(<CurrentTariffCard />);

    expect(screen.getByText('Сейчас нет действующего тарифного плана')).toBeInTheDocument();
  });
});
