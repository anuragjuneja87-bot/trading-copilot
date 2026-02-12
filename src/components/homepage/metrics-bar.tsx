'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from '@/hooks/useInView';

interface Metric {
  value: string;
  label: string;
  suffix?: string;
}

const metrics: Metric[] = [
  { value: '2000000', label: 'options trades analyzed daily', suffix: '+' },
  { value: '500', label: 'active traders', suffix: '+' },
  { value: '24/7', label: 'crisis monitoring' },
  { value: 'Real-time', label: 'AI verdicts' },
];

function CountUpNumber({ value, suffix, inView }: { value: string; suffix?: string; inView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    // Handle non-numeric values
    if (value === '24/7' || value === 'Real-time') {
      setCount(1);
      return;
    }

    const target = parseInt(value.replace(/,/g, ''), 10);
    if (isNaN(target)) return;

    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [inView, value]);

  if (value === '24/7') {
    return <span className="text-3xl font-bold text-white">24/7</span>;
  }

  if (value === 'Real-time') {
    return <span className="text-3xl font-bold text-white">Real-time</span>;
  }

  const formattedCount = count.toLocaleString();

  return (
    <span className="text-3xl font-bold text-white">
      {formattedCount}
      {suffix}
    </span>
  );
}

export function MetricsBar() {
  const { ref, isInView } = useInView({ threshold: 0.2 });

  return (
    <div
      ref={ref}
      className="w-full py-12 border-y border-[rgba(255,255,255,0.05)] bg-background-surface"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <div className="mb-2">
                <CountUpNumber value={metric.value} suffix={metric.suffix} inView={isInView} />
              </div>
              <div className="text-sm text-[#6b7a99]">{metric.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
