import { apiRequest } from '#shared/api';

import type { CreateYooMoneyPaymentPayload, YooMoneyPayment } from './types';

export const yooMoneyPaymentKey = (paymentId: string) => ['payments', 'yoomoney', paymentId] as const;

export const createYooMoneyPayment = (payload: CreateYooMoneyPaymentPayload) => (
  apiRequest<YooMoneyPayment>('users/me/top-up-payments', { method: 'post', json: payload })
);

export const getYooMoneyPayment = (paymentId: string) => (
  apiRequest<YooMoneyPayment>(`users/me/top-up-payments/${paymentId}`)
);
