import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { DeleteUserConfirmation } from '../DeleteUserConfirmation';

describe('DeleteUserConfirmation', () => {
  it('requires an explicit destructive action before deleting', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<DeleteUserConfirmation name="Лена" onCancel={() => undefined} onConfirm={onConfirm} />);

    expect(screen.getByText('Удалить аккаунт Лена?')).toBeInTheDocument();
    expect(screen.getByText('Это действие нельзя отменить.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Удалить пользователя' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
