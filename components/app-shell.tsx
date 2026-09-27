'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Home, TrendingUp, Bell, Calculator, Settings, Upload, FileText, LogOut, Menu, X, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { useState } from 'react';

const navItems = [
  { href: '/app', label: 'Início', icon: Home },
  { href: '/app/fluxo', label: 'Fluxo de Caixa', icon: TrendingUp },
  { href: '/app/calendario', label: 'Calendário', icon: Calendar },
  { href: '/app/decisoes', label: 'Central de Decisões', icon: Bell },
  { href: '/app/simulador', label: 'Posso pagar?', icon: Calculator },
  { href: '/app/importar', label: 'Importar Extrato', icon: Upload },
  { href: '/app/relatorio', label: 'Relatório Semanal', icon: FileText },
  { href: '/app/config', label: 'Configurações', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const Sidebar = ({ className }: { className?: string }) => (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <p className="font-bold text-base leading-tight">CaixaGuard</p>
          <p className="text-xs text-muted-foreground">Inteligência de Caixa</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavContent />
      </div>
      <div className="border-t px-4 py-3">
        <div className="mb-2 px-2">
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full justify-start text-muted-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r bg-card">
        <Sidebar className="w-full" />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold">CaixaGuard</span>
            </div>
            <div className="w-10" />
          </header>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar />
          </SheetContent>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
              {children}
            </div>
          </main>
        </div>
      </Sheet>

      {/* Desktop content */}
      <main className="hidden md:block flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
