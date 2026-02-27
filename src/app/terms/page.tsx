import { Metadata } from 'next';
import { Navbar, Footer } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for TradeYodha',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
          <h1 className="text-4xl font-bold text-text-primary mb-8">Terms of Service</h1>
          <div className="prose prose-invert max-w-none space-y-6 text-text-secondary">
            <p className="text-sm text-text-muted">Last updated: {new Date().toLocaleDateString()}</p>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing or using TradeYodha, you agree to be bound by these Terms of Service.
                If you disagree with any part of these terms, you may not access the service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">2. Service Description</h2>
              <p>
                TradeYodha provides AI-powered trading intelligence, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Real-time options flow data</li>
                <li>AI-generated trading analysis and recommendations</li>
                <li>Market news and sentiment analysis</li>
                <li>Dark pool prints and institutional activity</li>
                <li>Watchlist management and alerts</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">3. User Responsibilities</h2>
              <p>You agree to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate and complete information when creating an account</li>
                <li>Maintain the security of your account credentials</li>
                <li>Use the service only for lawful purposes</li>
                <li>Not attempt to reverse engineer or access unauthorized parts of the service</li>
                <li>Not share your account with others</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">4. Payment Terms</h2>
              <p>
                <strong>Subscriptions:</strong> TradeYodha offers free, pro, and elite subscription tiers.
                Paid subscriptions are billed monthly or annually as selected.
              </p>
              <p>
                <strong>Refunds:</strong> We offer a 7-day money-back guarantee for new subscriptions.
                Refund requests must be made within 7 days of initial purchase.
              </p>
              <p>
                <strong>Cancellation:</strong> You may cancel your subscription at any time.
                Cancellation takes effect at the end of your current billing period.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">5. Disclaimer</h2>
              <p className="font-semibold text-warning">
                <strong>NOT INVESTMENT ADVICE:</strong> TradeYodha is not a registered investment advisor.
                The information, analysis, and recommendations provided by our service are for informational
                purposes only and do not constitute investment advice, financial advice, trading advice, or
                any other sort of advice.
              </p>
              <p>
                You should not treat any content on TradeYodha as a substitute for professional financial
                advice. Always seek the advice of qualified financial advisors with any questions you may have
                regarding your investments.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">6. Limitation of Liability</h2>
              <p>
                Trading involves substantial risk of loss. Past performance does not guarantee future results.
                You acknowledge that:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You may lose money trading based on information from TradeYodha</li>
                <li>TradeYodha is not responsible for any trading losses you incur</li>
                <li>Market data and AI analysis may contain errors or delays</li>
                <li>You are solely responsible for your trading decisions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">7. Service Availability</h2>
              <p>
                We strive to maintain high availability but do not guarantee uninterrupted access.
                The service may be unavailable due to maintenance, updates, or technical issues.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">8. Termination</h2>
              <p>
                We reserve the right to suspend or terminate your account if you violate these terms.
                You may delete your account at any time through the settings page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">9. Changes to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. We will notify users of material changes.
                Continued use of the service after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">10. Contact Us</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us at:{' '}
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
