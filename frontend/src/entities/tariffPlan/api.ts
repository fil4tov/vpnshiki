import { apiRequest } from '#shared/api';

import type {
  TariffPlan,
  TariffPlanBillingRun,
  TariffPlanPayload,
  TariffPlanUpdatePayload,
} from './types';

export const tariffPlansKey = ['tariff-plans'] as const;
export const tariffPlanBillingHistoryKey = (planId: string) => (
  ['tariff-plans', planId, 'billing-history'] as const
);

export const getTariffPlans = () => apiRequest<TariffPlan[]>('admin/tariff-plans');

export const getTariffPlanBillingHistory = (planId: string) => apiRequest<TariffPlanBillingRun[]>(
  `admin/tariff-plans/${planId}/billing-history`,
);

export const createTariffPlan = (payload: TariffPlanPayload) => apiRequest<TariffPlan>(
  'admin/tariff-plans',
  { method: 'post', json: payload },
);

export const updateTariffPlan = (id: string, payload: TariffPlanUpdatePayload) => (
  apiRequest<TariffPlan>(`admin/tariff-plans/${id}`, { method: 'patch', json: payload })
);

export const deleteTariffPlan = (id: string) => apiRequest<void>(
  `admin/tariff-plans/${id}`,
  { method: 'delete' },
);
