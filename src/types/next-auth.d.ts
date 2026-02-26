import 'next-auth';
import { SubscriptionTier } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tier?: SubscriptionTier;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    tier?: SubscriptionTier;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    tier?: SubscriptionTier;
  }
}
