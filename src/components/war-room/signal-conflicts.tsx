'use client';

import { COLORS } from '@/lib/echarts-theme';
import { AlertTriangle, CheckCircle, XCircle, HelpCircle } from 'lucide-react';

interface SignalConflictsProps {
  conflicts: string[];
  supports: string[];
  reliability: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
}

export function SignalConflicts({ conflicts, supports, reliability }: SignalConflictsProps) {
  const criticalConflicts = conflicts.filter(c => c.includes('⚠️'));
  const minorConflicts = conflicts.filter(c => !c.includes('⚠️'));
  
  if (conflicts.length === 0 && supports.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {/* Critical Conflicts */}
      {criticalConflicts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {criticalConflicts.map((conflict, i) => (
            <div 
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              style={{ background: 'rgba(255,82,82,0.15)', color: '#ff5252' }}
            >
              <AlertTriangle className="w-3 h-3" />
              {conflict.replace('⚠️ ', '')}
            </div>
          ))}
        </div>
      )}
      
      {/* Supporting Signals */}
      {supports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {supports.slice(0, 3).map((support, i) => (
            <div 
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              style={{ background: 'rgba(0,230,118,0.1)', color: '#00e676' }}
            >
              <CheckCircle className="w-3 h-3" />
              {support}
            </div>
          ))}
        </div>
      )}
      
      {/* Minor Conflicts */}
      {minorConflicts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {minorConflicts.slice(0, 2).map((conflict, i) => (
            <div 
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              style={{ background: 'rgba(255,193,7,0.1)', color: '#ffc107' }}
            >
              <HelpCircle className="w-3 h-3" />
              {conflict}
            </div>
          ))}
        </div>
      )}
      
      {/* Reliability Badge */}
      <div 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
        style={{ 
          background: reliability === 'HIGH' ? 'rgba(0,230,118,0.1)' :
                     reliability === 'MEDIUM' ? 'rgba(255,193,7,0.1)' :
                     reliability === 'LOW' ? 'rgba(255,152,0,0.1)' :
                     'rgba(255,82,82,0.1)',
          color: reliability === 'HIGH' ? '#00e676' :
                 reliability === 'MEDIUM' ? '#ffc107' :
                 reliability === 'LOW' ? '#ff9800' :
                 '#ff5252',
        }}
      >
        {reliability === 'HIGH' && <CheckCircle className="w-3 h-3" />}
        {reliability === 'MEDIUM' && <HelpCircle className="w-3 h-3" />}
        {reliability === 'LOW' && <AlertTriangle className="w-3 h-3" />}
        {reliability === 'INSUFFICIENT' && <XCircle className="w-3 h-3" />}
        {reliability} RELIABILITY
      </div>
    </div>
  );
}
