import { apiRequest } from '#shared/api';

import type {
  AdminUserPayload,
  AdminUserUpdatePayload,
  DailyCharge,
  LoginPayload,
  User,
} from './types';

export const adminUsersKey = ['users'] as const;
export const myDailyChargeKey = ['users', 'me', 'daily-charge'] as const;

export const getCurrentUser = () => apiRequest<User>('auth/me');
export const login = (payload: LoginPayload) => apiRequest<User>('auth/login', { method: 'post', json: payload });
export const logout = () => apiRequest<void>('auth/logout', { method: 'post' });
export const getMyDailyCharge = () => apiRequest<DailyCharge>('users/me/daily-charge');
export const changeMyPassword = (currentPassword: string, newPassword: string) => apiRequest<User>(
  'users/me/password',
  { method: 'post', json: { current_password: currentPassword, new_password: newPassword } },
);
export const getUsers = () => apiRequest<User[]>('admin/users');
export const createUser = (payload: AdminUserPayload) => apiRequest<User>('admin/users', {
  method: 'post', json: payload,
});
export const updateUser = (id: string, payload: AdminUserUpdatePayload) => apiRequest<User>(
  `admin/users/${id}`,
  { method: 'patch', json: payload },
);
export const deleteUser = (id: string) => apiRequest<void>(`admin/users/${id}`, { method: 'delete' });
export const resetUserPassword = (id: string, newPassword: string) => apiRequest<void>(
  `admin/users/${id}/password`,
  { method: 'post', json: { new_password: newPassword } },
);
