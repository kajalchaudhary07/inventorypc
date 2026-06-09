import { create } from "zustand";

interface AuthState {
  user: { uid: string; email: string } | null;
  ready: boolean;
  setUser: (u: AuthState["user"]) => void;
  setReady: (r: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
}));
