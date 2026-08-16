import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from '../CopyButton';

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a temporary copied state after a successful copy', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValue(true);
    render(<CopyButton label="Скопировать ссылку" onCopy={onCopy} />);

    const button = screen.getByRole('button', { name: 'Скопировать ссылку' });
    expect(button).toHaveAttribute('data-copy-state', 'idle');

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('data-copy-state', 'copied');

    act(() => vi.advanceTimersByTime(2000));
    expect(button).toHaveAttribute('data-copy-state', 'idle');
  });

  it('keeps the idle icon when copying fails', async () => {
    const onCopy = vi.fn().mockResolvedValue(false);
    render(<CopyButton label="Копировать" onCopy={onCopy} />);

    const button = screen.getByRole('button', { name: 'Копировать' });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(button).toHaveAttribute('data-copy-state', 'idle');
  });
});
