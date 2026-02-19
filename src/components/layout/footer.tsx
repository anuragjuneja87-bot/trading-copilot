import Link from 'next/link';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';

const footerLinks = {
  product: [
    { name: 'Yodha Room', href: '/ask' },
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
              <YodhaLogo size={32} />
              <YodhaWordmark className="text-lg" />
            </Link>
            <p className="mt-4 text-sm text-text-tertiary">
              Your AI trading warrior. See what Wall Street sees.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-text-secondary">Product</h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-text-secondary">Legal</h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-xs text-text-tertiary">
            © {new Date().getFullYear()} TradeYodha. All rights reserved. Not financial advice. 
            Options trading involves substantial risk and is not suitable for every investor.
          </p>
        </div>
      </div>
    </footer>
  );
}
