import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../utils/apiFetch";
import { useAuth } from "../layouts/AuthLayout";

const AdminCapabilityContext = createContext(null);

export const AdminCapabilityProvider = ({ children }) => {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const canAccessAdminRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const probeAdminCapability = useCallback(
    async ({ force = false } = {}) => {
      if (authLoading) return false;
      if (!isLoggedIn) {
        lastCheckedAtRef.current = 0;
        setCanAccessAdmin(false);
        setIsChecking(false);
        return false;
      }

      const now = Date.now();
      const recentlyChecked = now - lastCheckedAtRef.current < 5_000;
      if (inFlightRef.current || (recentlyChecked && !force)) {
        return canAccessAdminRef.current;
      }

      inFlightRef.current = true;
      setIsChecking(true);

      let allowed = false;
      try {
        const res = await apiFetch("/api/admin/hub/access", { method: "GET" });
        allowed = res.status === 204;
        setCanAccessAdmin(allowed);
      } catch {
        setCanAccessAdmin(false);
      } finally {
        lastCheckedAtRef.current = Date.now();
        inFlightRef.current = false;
        setIsChecking(false);
      }

      return allowed;
    },
    [authLoading, isLoggedIn]
  );

  useEffect(() => {
    canAccessAdminRef.current = canAccessAdmin;
  }, [canAccessAdmin]);

  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      lastCheckedAtRef.current = 0;
      setCanAccessAdmin(false);
      setIsChecking(false);
      return;
    }

    probeAdminCapability({ force: true });
  }, [authLoading, isLoggedIn, probeAdminCapability]);

  return (
    <AdminCapabilityContext.Provider
      value={{ canAccessAdmin, isChecking, refreshAdminCapability: probeAdminCapability }}
    >
      {children}
    </AdminCapabilityContext.Provider>
  );
};

export const useAdminCapability = () => {
  const ctx = useContext(AdminCapabilityContext);
  if (!ctx) {
    throw new Error("useAdminCapability must be used within an AdminCapabilityProvider");
  }
  return ctx.canAccessAdmin;
};

export const useAdminCapabilityStatus = () => {
  const ctx = useContext(AdminCapabilityContext);
  if (!ctx) {
    throw new Error(
      "useAdminCapabilityStatus must be used within an AdminCapabilityProvider"
    );
  }
  return ctx;
};
