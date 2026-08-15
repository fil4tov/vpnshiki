import { act, renderHook } from '@testing-library/react';

import { useTheme } from '../useTheme';

describe('useTheme', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts with the dark theme and persists a change', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem('vpnshiki-theme')).toBe('light');
  });
});

