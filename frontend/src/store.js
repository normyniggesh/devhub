import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from './api/client';

export const useStore = create(
  persist(
    (set) => ({
      currentUser: null,
      authLoading: true,
      isAuthenticated: false,

      login: async (email, password) => {
        try {
          const { user } = await apiClient('/auth/login', { method: 'POST', body: { email, password } });
          set({ currentUser: user, isAuthenticated: true, authLoading: false });
          return user;
        } catch (error) {
          throw error;
        }
      },
      
      register: async (name, email, password) => {
        try {
          const res = await apiClient('/auth/register', { method: 'POST', body: { name, email, password } });
          return res;
        } catch (error) {
          throw error;
        }
      },

      verifyEmail: async (email, code) => {
        try {
          const res = await apiClient('/auth/verify-email', { method: 'POST', body: { email, code } });
          if (res.user) {
            set({ currentUser: res.user, isAuthenticated: true, authLoading: false });
          }
          return res;
        } catch (error) {
          throw error;
        }
      },

      resendCode: async (email) => {
        try {
          const res = await apiClient('/auth/resend-code', { method: 'POST', body: { email } });
          return res;
        } catch (error) {
          throw error;
        }
      },
      
      logout: async () => {
        try {
          await apiClient('/auth/logout', { method: 'POST' });
        } finally {
          set({ currentUser: null, isAuthenticated: false, authLoading: false });
        }
      },
      
      checkAuth: async () => {
        try {
          const { user } = await apiClient('/auth/me');
          set({ currentUser: user, isAuthenticated: true, authLoading: false });
        } catch (error) {
          set({ currentUser: null, isAuthenticated: false, authLoading: false });
        }
      },

      githubUser: '',
      githubRepos: [],
      
      setGithubUser: (user) => set({ githubUser: user }),
      setGithubRepos: (repos) => set({ githubRepos: repos }),
    }),
    {
      name: 'devhub-storage',
      partialize: (state) => ({
        githubUser: state.githubUser,
        githubRepos: state.githubRepos
      }),
    }
  )
);

