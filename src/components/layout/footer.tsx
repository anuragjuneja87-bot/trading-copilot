import Link from 'next/link';
import { Zap, Twitter, Mail } from 'lucide-react';

const footerLinks = {
  product: [
    { name: 'War Room', href: '/ask' },
    { name: 'Options Flow', href: '/flow' },
    { name: 'Dark Pool', href: '/darkpool' },
    { name: 'Gamma Levels', href: '/levels' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-background-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Zap className="h-5 w-5 text-background" />
              </div>
              <span className="text-lg font-bold text-text-primary">
                Trading<span className="text-accent">Copilot</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-text-secondary">
              The AI trading copilot that tells you what to do, not just what happened.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Product</h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Legal</h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Connect</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="https://twitter.com/tradingcopilot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Twitter className="h-4 w-4" />
                  Twitter/X
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@tradingcopilot.com"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-border pt-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-sm text-text-muted">
              © {new Date().getFullYear()} TradingCopilot. All rights reserved.
            </p>
            <p className="text-xs text-text-muted max-w-2xl text-center md:text-right">
              <strong>Disclaimer:</strong> TradingCopilot is not a registered investment advisor. 
              Information provided does not constitute investment advice. 
              Trading involves risk of loss. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
