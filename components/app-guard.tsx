'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOrgData } from '@/hooks/use-org-data';
import { AppShell } from '@/components/app-shell';
import { Loader2, Shield } from 'lucide-react';

export function AppGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { organization, loading: orgLoading } = useOrgData();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user && !orgLoading && !organization) {
      router.push('/onboarding');
    }
  }, [authLoading, user, orgLoading, organization, router]);

  if (authLoading || orgLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || !organization) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
