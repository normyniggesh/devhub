import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from './api/client';

const initialProjects = [];
const initialTasks = [];
const initialQa = [];

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
          const { user } = await apiClient('/auth/register', { method: 'POST', body: { name, email, password } });
          set({ currentUser: user, isAuthenticated: true, authLoading: false });
          return user;
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

      projects: initialProjects,
      tasks: initialTasks,
      qaTasks: initialQa,
      githubUser: '',
      githubRepos: [],
      
      addProject: (project) => set((state) => ({ projects: [...state.projects, { id: Date.now(), ...project }] })),
      addTask: (task) => set((state) => ({ tasks: [...state.tasks, { id: Date.now(), ...task }] })),
      addQaTask: (qaTask) => set((state) => ({ qaTasks: [...state.qaTasks, { id: Date.now(), ...qaTask }] })),
      
      clearAll: () => set({ projects: [], tasks: [], qaTasks: [] }),
      
      setGithubUser: (user) => set({ githubUser: user }),
      setGithubRepos: (repos) => set({ githubRepos: repos }),
    }),
    {
      name: 'devhub-storage', // name of the item in the storage (must be unique)
      partialize: (state) => ({
        projects: state.projects,
        tasks: state.tasks,
        qaTasks: state.qaTasks,
        githubUser: state.githubUser,
        githubRepos: state.githubRepos
      }),
    }
  )
);

