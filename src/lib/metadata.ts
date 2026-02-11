import { Metadata } from 'next';

export function createPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://tradingcopilot.com${path}`,
    },
    twitter: {
      title,
      description,
    },
  };
}
