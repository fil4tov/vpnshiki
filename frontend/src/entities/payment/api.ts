import { apiRequest } from '#shared/api';

import type { AdminYooMoneyPayment, CreateYooMoneyPaymentPayload, YooMoneyPayment } from './types';

export const yooMoneyPaymentKey = (paymentId: string) => ['payments', 'yoomoney', paymentId] as const;
export const adminYooMoneyPaymentsKey = ['payments', 'yoomoney', 'admin'] as const;

export const createYooMoneyPayment = (payload: CreateYooMoneyPaymentPayload) => (
  apiRequest<YooMoneyPayment>('users/me/top-up-payments', { method: 'post', json: payload })
);

export const getYooMoneyPayment = (paymentId: string) => (
  apiRequest<YooMoneyPayment>(`users/me/top-up-payments/${paymentId}`)
);

export const reconcileYooMoneyPayment = (paymentId: string) => (
  apiRequest<YooMoneyPayment>(`users/me/top-up-payments/${paymentId}/reconcile`, {
    method: 'post',
  })
);

export const getAdminYooMoneyPayments = () => (
  apiRequest<AdminYooMoneyPayment[]>('admin/top-up-payments')
);
