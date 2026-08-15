import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { FieldSelect } from '../FieldSelect';

const options = [
  { value: 'user', label: 'Участник' },
  { value: 'admin', label: 'Администратор' },
];

describe('FieldSelect', () => {
  it('opens a custom listbox and selects an option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldSelect label="Роль" options={options} value="user" onChange={onChange} />);

    const control = screen.getByRole('combobox', { name: 'Роль' });
    expect(control).toHaveTextContent('Участник');
    await user.click(control);
    expect(screen.getByRole('listbox', { name: 'Роль' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Администратор' }));

    expect(onChange).toHaveBeenCalledWith('admin');
    expect(screen.queryByRole('listbox', { name: 'Роль' })).not.toBeInTheDocument();
    expect(control).toHaveFocus();
  });

  it('supports arrow navigation, selection and escape from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldSelect label="Роль" options={options} value="user" onChange={onChange} />);

    const control = screen.getByRole('combobox', { name: 'Роль' });
    control.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('admin');

    await user.keyboard('{Enter}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('connects hint and error messages to the control', () => {
    const { rerender } = render(
      <FieldSelect label="Роль" options={options} value="user" onChange={() => undefined} hint="Выберите права" />,
    );
    const control = screen.getByRole('combobox', { name: 'Роль' });
    expect(control).toHaveAccessibleDescription('Выберите права');

    rerender(
      <FieldSelect label="Роль" options={options} value="user" onChange={() => undefined} error="Поле обязательно" />,
    );
    expect(control).toHaveAccessibleDescription('Поле обязательно');
    expect(control).toHaveAttribute('aria-invalid', 'true');
  });
});
