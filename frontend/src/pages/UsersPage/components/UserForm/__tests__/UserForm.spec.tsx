import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { UserForm } from '../UserForm';

describe('UserForm', () => {
  it('submits one account status instead of separate activity flags', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<UserForm onCancel={() => undefined} onSubmit={onSubmit} />);

    const accountStatus = screen.getByRole('combobox', { name: 'Статус аккаунта' });
    const role = screen.getByRole('combobox', { name: 'Роль' });
    expect(accountStatus.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByLabelText('Имя'), 'Антон');
    await user.type(screen.getByLabelText('Начальный пароль'), 'strong-password');
    await user.click(screen.getByRole('combobox', { name: 'Статус аккаунта' }));
    await user.click(screen.getByRole('option', { name: 'Приостановлен' }));
    expect(screen.getByText('Участие и ежедневные списания приостановлены')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.account_status).toBe('paused');
    expect(payload).not.toHaveProperty('is_active');
    expect(payload).not.toHaveProperty('is_blocked');
  });
});
