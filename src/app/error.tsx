'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8" style={{ background: '#060810' }}>
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Something went wrong!</h2>
        <p className="text-[#8b99b0] mb-6">{error.message || 'An unexpected error occurred'}</p>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: '#00e5ff', color: '#0a0f1a' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
