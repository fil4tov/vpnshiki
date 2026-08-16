export type TariffPlanStatus = 'active' | 'scheduled' | 'completed';

export interface TariffPlan {
  id: string;
  name: string;
  monthly_amount: string;
  start_date: string;
  end_date: string | null;
  status: TariffPlanStatus;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
}

export interface TariffPlanPayload {
  monthly_amount: string;
  start_date: string;
}

export interface TariffPlanBillingRun {
  id: string;
  billing_date: string;
  daily_charge: string;
  active_users_count: number;
}

export type TariffPlanUpdatePayload = Partial<TariffPlanPayload>;
