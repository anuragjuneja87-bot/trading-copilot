import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { AppNavbar } from '@/components/layout/app-navbar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your trading command center with real-time market data, AI analysis, and trading tools.',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col overflow-hidden pb-14 lg:pb-0">
        <AppNavbar />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
