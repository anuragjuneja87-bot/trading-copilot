'use client';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('ai-response', className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-white mt-6 mb-4 pb-2 border-b border-[rgba(255,255,255,0.06)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-white mt-6 mb-3 pb-2 border-b border-[rgba(255,255,255,0.06)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-[#e0e6f0] mt-5 mb-2">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-[#e0e6f0] mt-4 mb-2">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-[#b0bec5] leading-relaxed my-2">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="text-white font-semibold">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="text-[#b0bec5] italic">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="pl-5 my-2 list-disc">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="pl-5 my-2 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[#b0bec5] leading-relaxed my-1">
              {children}
            </li>
          ),
          hr: () => (
            <hr className="border-none border-t border-[rgba(255,255,255,0.06)] my-5" />
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-[rgba(0,229,255,0.08)] text-[#00e5ff] px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className="block bg-[rgba(0,229,255,0.08)] text-[#00e5ff] p-3 rounded text-xs font-mono overflow-x-auto my-3">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-[rgba(0,229,255,0.08)] p-3 rounded text-xs font-mono overflow-x-auto my-3">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[rgba(255,255,255,0.03)]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody>
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-[rgba(255,255,255,0.06)]">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-white font-semibold text-sm border border-[rgba(255,255,255,0.06)]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#b0bec5] text-sm border border-[rgba(255,255,255,0.06)]">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-accent pl-4 my-3 italic text-[#b0bec5]">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
