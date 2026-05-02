// Auth-Provider — verbindet sich mit dem Pi-Backend wenn erreichbar,
// fällt sonst auf Mock-Lock-Modus zurück. Im Pi-Modus existieren Setup-,
// Login- und Logout-Flows; Auto-Lock bleibt clientseitig.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api/client";
import { piApi, PiApiError } from "@/lib/api/piClient";
import { useBackendStatus } from "@/hooks/useBackendStatus";

export type AuthMode = "loading" | "needs-setup" | "logged-out" | "logged-in" | "mock-lock";

interface PiUser {
  id: string;
  username: string;
}

interface AuthState {
  mode: AuthMode;
  user: PiUser | null;
  unlocked: boolean;
  loading: boolean;
  // Pi-Backend
  setup: (input: { username: string; password: string; setupToken: string }) => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (alt: string, neu: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  // Mock/Lock-Fallback
  unlock: (passwort: string) => Promise<void>;
  lock: () => Promise<void>;
  // Settings
  setAutoLockMinutes: (m: number) => void;
  autoLockMinutes: number;
}

const Ctx = createContext<AuthState | null>(null);

interface MeResponse {
  user: PiUser;
  expiresAt: string;
}
interface MeNeedsSetup {
  error: "needs-setup";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { status: backendStatus } = useBackendStatus();
  const [mode, setMode] = useState<AuthMode>("loading");
  const [user, setUser] = useState<PiUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(30);
  const lastActivity = useRef<number>(Date.now());

  const refreshMe = useCallback(async () => {
    try {
      const me = await piApi.get<MeResponse>("/auth/me");
      setUser(me.user);
      setMode("logged-in");
      lastActivity.current = Date.now();
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 409) {
          setUser(null);
          setMode("needs-setup");
          return;
        }
        if (err.status === 401) {
          setUser(null);
          setMode("logged-out");
          return;
        }
        if (err.status === 0) {
          // Backend offline — Fallback auf Mock-Lock
          setUser(null);
          setMode("mock-lock");
          return;
        }
      }
      setUser(null);
      setMode("mock-lock");
    }
  }, []);

  // Beim Backend-URL-Wechsel oder Status-Wechsel neu prüfen
  useEffect(() => {
    void refreshMe();
  }, [refreshMe, backendStatus]);

  const setup = useCallback(
    async (input: { username: string; password: string; setupToken: string }) => {
      setLoading(true);
      try {
        const res = await piApi.post<MeResponse>("/auth/setup", input);
        setUser(res.user);
        setMode("logged-in");
        lastActivity.current = Date.now();
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const login = useCallback(async (input: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await piApi.post<MeResponse>("/auth/login", input);
      setUser(res.user);
      setMode("logged-in");
      lastActivity.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await piApi.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setUser(null);
    setMode("logged-out");
  }, []);

  const changePassword = useCallback(async (alt: string, neu: string) => {
    await piApi.post("/auth/passwort-aendern", { alt, neu });
  }, []);

  // Mock-Lock-Fallback (alter Code, bleibt für Demo-/Offline-Modus)
  const unlock = useCallback(async (passwort: string) => {
    setLoading(true);
    try {
      await api.post<void>("/auth/unlock", { passwort });
      setMode("logged-in");
      setUser({ id: "mock", username: "Demo" });
      lastActivity.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  const lock = useCallback(async () => {
    if (mode === "logged-in" && user?.id !== "mock") {
      await logout();
    } else {
      try {
        await api.post<void>("/auth/lock");
      } catch {
        /* ignore */
      }
      setMode("mock-lock");
      setUser(null);
    }
  }, [mode, user, logout]);

  // Aktivitäts-Tracking
  useEffect(() => {
    if (mode !== "logged-in") return;
    const handler = (): void => {
      lastActivity.current = Date.now();
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [mode]);

  // Auto-Lock
  useEffect(() => {
    if (mode !== "logged-in") return;
    const id = window.setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      if (idleMs > autoLockMinutes * 60 * 1000) {
        void lock();
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [mode, autoLockMinutes, lock]);

  const value = useMemo<AuthState>(
    () => ({
      mode,
      user,
      unlocked: mode === "logged-in",
      loading,
      setup,
      login,
      logout,
      changePassword,
      refreshMe,
      unlock,
      lock,
      autoLockMinutes,
      setAutoLockMinutes,
    }),
    [mode, user, loading, setup, login, logout, changePassword, refreshMe, unlock, lock, autoLockMinutes],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  return v;
}
