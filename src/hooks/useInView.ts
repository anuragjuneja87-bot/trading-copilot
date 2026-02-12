import { useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  threshold?: number;
}

export function useInView(options: number | UseInViewOptions = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  // Handle both number and object formats
  const threshold = typeof options === 'number' ? options : (options.threshold ?? 0.1);

  useEffect(() => {
    // Ensure threshold is a valid number between 0 and 1
    const validThreshold = Math.max(0, Math.min(1, Number(threshold) || 0.1));
    
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: validThreshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isInView };
}
