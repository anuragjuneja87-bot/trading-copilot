import { Metadata } from 'next';
import { Navbar, Footer } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for TradeYodha',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
          <h1 className="text-4xl font-bold text-text-primary mb-8">Privacy Policy</h1>
          <div className="prose prose-invert max-w-none space-y-6 text-text-secondary">
            <p className="text-sm text-text-muted">Last updated: {new Date().toLocaleDateString()}</p>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">1. Information We Collect</h2>
              <p>
                We collect information that you provide directly to us, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email address and name when you create an account</li>
                <li>Payment information processed securely through Stripe</li>
                <li>Usage data and analytics to improve our service</li>
                <li>Watchlist preferences and trading data you input</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and manage subscriptions</li>
                <li>Send you technical notices and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze usage patterns</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">3. Third-Party Services</h2>
              <p>We use the following third-party services:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Stripe:</strong> Payment processing. Your payment information is handled securely by Stripe and never stored on our servers.
                </li>
                <li>
                  <strong>Google OAuth:</strong> Authentication. When you sign in with Google, we receive your email and name.
                </li>
                <li>
                  <strong>Supabase:</strong> Database hosting. Your account data is stored securely in our Supabase database.
                </li>
                <li>
                  <strong>Polygon.io:</strong> Market data provider. We use Polygon for real-time market data.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">4. Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your personal information.
                However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">5. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your account and data</li>
                <li>Opt out of marketing communications</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">6. Cookies</h2>
              <p>
                We use cookies and similar tracking technologies to track activity on our service and hold certain information.
                You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">7. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at:{' '}
                <a href="mailto:support@tradeyodha.com" className="text-accent hover:underline">
                  support@tradeyodha.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
