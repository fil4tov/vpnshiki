import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ResetPasswordForm } from '../ResetPasswordForm';

describe('ResetPasswordForm', () => {
  it('generates the same visible password for both fields', async () => {
    const user = userEvent.setup();
    render(
      <ResetPasswordForm
        name="Антон"
        onCancel={() => undefined}
        onSubmit={() => Promise.resolve()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Сгенерировать пароль' }));

    const password = screen.getByLabelText('Новый пароль');
    const confirmation = screen.getByLabelText('Повторите пароль');
    expect(password).not.toHaveValue('');
    expect(confirmation).toHaveValue((password as HTMLInputElement).value);
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.queryByText('Пароли не совпадают')).not.toBeInTheDocument();
  });
});
