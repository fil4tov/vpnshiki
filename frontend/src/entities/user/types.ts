export type UserRole = 'admin' | 'user';
export type AccountStatus = 'active' | 'paused' | 'blocked';

export interface User {
  id: string;
  name: string;
  balance: string;
  negative_balance_limit: string;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminUser extends User {
  total_charged: string;
}

export interface UserCharge {
  id: string;
  amount: string;
  tariff_plan_id: string;
  tariff_plan_name: string;
  created_at: string;
}

export interface DailyCharge {
  daily_charge: string | null;
}

export interface LoginPayload {
  name: string;
  password: string;
}

export interface AdminUserPayload {
  name: string;
  password: string;
  balance: string;
  negative_balance_limit: string;
  role: UserRole;
  account_status: AccountStatus;
}

export type AdminUserUpdatePayload = Omit<AdminUserPayload, 'password'>;
