export type UserRole = 'admin' | 'user';
export type AccountStatus = 'active' | 'paused' | 'blocked';
export type AccountBlockSource = 'billing' | 'admin';
export type VpnProfileStatus = 'online' | 'offline';
export type StatusChangeSource = 'bootstrap' | 'admin' | 'billing' | 'top_up' | 'user';

export interface User {
  id: string;
  name: string;
  balance: string;
  negative_balance_limit: string;
  role: UserRole;
  account_status: AccountStatus;
  block_source: AccountBlockSource | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser extends User {
  tgUserId: string | null;
  total_charged: string;
  total_top_ups: string;
  vpnProfiles: Array<{
    enabled: boolean;
    label: string;
    status: VpnProfileStatus;
  }> | null;
}

export interface UserCharge {
  id: string;
  amount: string;
  tariff_plan_id: string;
  tariff_plan_name: string;
  created_at: string;
}

export interface UserTopUp {
  id: string;
  amount: string;
  created_at: string;
}

export interface UserStatusHistory {
  id: string;
  previous_status: AccountStatus | null;
  new_status: AccountStatus;
  changed_by_user_id: string | null;
  changed_by_name: string | null;
  source: StatusChangeSource;
  effective_at: string;
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
  tgUserId: string | null;
}

export type AdminUserUpdatePayload = Omit<AdminUserPayload, 'password'>;
