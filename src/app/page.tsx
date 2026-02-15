import { Navbar, Footer } from '@/components/layout';
import { HomepageContent } from '@/components/homepage/homepage-content';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060810' }}>
      <Navbar />
      <HomepageContent />
      <Footer />
    </div>
  );
}
