'use client';

import { AppGuard } from '@/components/app-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppGuard>{children}</AppGuard>;
}
