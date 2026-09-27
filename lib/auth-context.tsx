'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Organization, Membership, Role } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgId: string | null;
  setOrgId: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  orgId: null,
  setOrgId: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        setUser(sess?.user ?? null);
        if (!sess) setOrgIdState(null);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const setOrgId = useCallback((id: string | null) => {
    setOrgIdState(id);
    if (id) localStorage.setItem('caixaguard_org_id', id);
    else localStorage.removeItem('caixaguard_org_id');
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('caixaguard_org_id');
    if (stored) setOrgIdState(stored);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setOrgIdState(null);
    localStorage.removeItem('caixaguard_org_id');
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, orgId, setOrgId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
