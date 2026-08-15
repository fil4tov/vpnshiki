import { create } from 'zustand';

import { ApiError } from '#shared/api';

import * as userApi from './api';
import type { LoginPayload, User } from './types';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface UserState {
  user: User | null;
  status: AuthStatus;
  initialize: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  status: 'checking',
  initialize: async () => {
    try {
      const user = await userApi.getCurrentUser();
      set({ user, status: 'authenticated' });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        // Network failures still land on login, where the next request has actionable feedback.
      }
      set({ user: null, status: 'unauthenticated' });
    }
  },
  login: async (payload) => {
    const user = await userApi.login(payload);
    set({ user, status: 'authenticated' });
  },
  logout: async () => {
    try {
      await userApi.logout();
    } finally {
      set({ user: null, status: 'unauthenticated' });
    }
  },
  setUser: (user) => set({ user, status: 'authenticated' }),
}));

