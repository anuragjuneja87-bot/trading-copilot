'use client';

import { motion } from 'framer-motion';
import { useInView } from '@/hooks/useInView';

export function DataProviderStrip() {
  const { ref, isInView } = useInView({ threshold: 0.1 });

  return (
    <div
      ref={ref}
      className="w-full py-8 border-y border-[rgba(255,255,255,0.05)]"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <p className="text-sm text-[#6b7a99] uppercase tracking-wider">
            Powered by institutional-grade data
          </p>
        </motion.div>

        <div className="flex items-center justify-center gap-8 lg:gap-12 flex-wrap">
          {['ThetaData', 'Polygon.io', 'TradingView'].map((provider, index) => (
            <motion.div
              key={provider}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="text-[#6b7a99] text-sm font-medium transition-opacity hover:opacity-100"
              style={{ opacity: 0.4 }}
            >
              {provider}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
