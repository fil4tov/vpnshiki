import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { DeleteTariffPlanConfirmation } from '../DeleteTariffPlanConfirmation';

describe('DeleteTariffPlanConfirmation', () => {
  it('explains boundary rebuilding and requires confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DeleteTariffPlanConfirmation
        name="TP_01.09.2026"
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Соседние периоды будут соединены автоматически/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить план' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
