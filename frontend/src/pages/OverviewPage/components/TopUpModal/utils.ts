import type { YooMoneyCheckout } from '#entities/payment';

export function submitCheckoutForm(checkout: YooMoneyCheckout) {
  const form = document.createElement('form');
  form.method = checkout.method;
  form.action = checkout.action;
  form.hidden = true;
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  try {
    form.submit();
  } finally {
    form.remove();
  }
}
