import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "../utils/apiFetch";
import { useAuth } from "../layouts/AuthLayout";

const AdminCapabilityContext = createContext({
  canAccessAdmin: false,
  isChecking: true,
});

export const AdminCapabilityProvider = ({ children }) => {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const probeStartedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      probeStartedRef.current = false;
      setCanAccessAdmin(false);
      setIsChecking(false);
      return;
    }

    if (probeStartedRef.current) return;
    probeStartedRef.current = true;
    setIsChecking(true);

    let isMounted = true;

    (async () => {
      try {
        const res = await apiFetch("/api/admin/hub/access", { method: "GET" });
        if (!isMounted) return;
        setCanAccessAdmin(res.status === 204);
      } catch {
        if (!isMounted) return;
        setCanAccessAdmin(false);
      } finally {
        if (isMounted) setIsChecking(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [authLoading, isLoggedIn]);

  return (
    <AdminCapabilityContext.Provider value={{ canAccessAdmin, isChecking }}>
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
