import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PasswordField } from '../TextField';

describe('PasswordField', () => {
  it('toggles password visibility and keeps the input focused after a pointer click', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Пароль" defaultValue="secret-value" />);
    const input = screen.getByLabelText('Пароль');

    expect(input).toHaveAttribute('type', 'password');
    input.focus();
    await user.click(screen.getByRole('button', { name: 'Показать пароль' }));

    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
