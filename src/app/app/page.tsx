import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Zap, MessageSquare, BarChart3, TrendingUp } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user as any;
  const tier = user.tier || 'FREE';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-20 pb-12">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          {/* Welcome section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-primary">
              Welcome, {user.name || user.email?.split('@')[0]}!
            </h1>
            <p className="mt-2 text-text-secondary">
              Your AI-powered trading dashboard
            </p>
            <div className="mt-4">
              <Badge variant={tier === 'FREE' ? 'normal' : tier === 'PRO' ? 'elevated' : 'crisis'}>
                {tier} Plan
              </Badge>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-12">
            <Link href="/ask">
              <div className="rounded-xl border border-border bg-background-card p-6 hover:border-accent/50 transition-all cursor-pointer">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <MessageSquare className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Ask AI</h3>
                <p className="text-sm text-text-secondary">
                  Get AI-powered trading verdicts and insights
                </p>
              </div>
            </Link>

            <Link href="/flow">
              <div className="rounded-xl border border-border bg-background-card p-6 hover:border-accent/50 transition-all cursor-pointer">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-bull/10">
                  <BarChart3 className="h-6 w-6 text-bull" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Options Flow</h3>
                <p className="text-sm text-text-secondary">
                  View real-time options flow and unusual activity
                </p>
              </div>
            </Link>

            <Link href="/pricing">
              <div className="rounded-xl border border-border bg-background-card p-6 hover:border-accent/50 transition-all cursor-pointer">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                  <TrendingUp className="h-6 w-6 text-warning" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Upgrade</h3>
                <p className="text-sm text-text-secondary">
                  Unlock more features and higher limits
                </p>
              </div>
            </Link>
          </div>

          {/* Placeholder content */}
          <div className="rounded-xl border border-border bg-background-card p-8">
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-accent/10 mb-4">
                <Zap className="h-8 w-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                Dashboard Coming Soon
              </h2>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                Your personalized trading dashboard with watchlists, alerts, and analytics is being built.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <Link href="/ask">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Try AI Chat
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/flow">View Options Flow</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
