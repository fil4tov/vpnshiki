import { vi } from 'vitest';

import { submitCheckoutForm } from '../utils';

describe('submitCheckoutForm', () => {
  it('submits all provider fields with POST and removes the temporary form', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);

    submitCheckoutForm({
      action: 'https://yoomoney.ru/quickpay/confirm',
      method: 'POST',
      fields: { receiver: '41001123456789', label: 'pay_123', sum: '101.00' },
    });

    expect(submit).toHaveBeenCalledOnce();
    const form = submit.mock.instances[0] as HTMLFormElement;
    expect(form.method).toBe('post');
    expect(form.action).toBe('https://yoomoney.ru/quickpay/confirm');
    expect(new FormData(form).get('label')).toBe('pay_123');
    expect(document.body.contains(form)).toBe(false);
    submit.mockRestore();
  });
});
