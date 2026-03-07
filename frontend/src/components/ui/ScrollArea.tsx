/**
 * ScrollArea Component
 * Simple scrollable container
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export function ScrollArea({ children, className }: ScrollAreaProps) {
  return (
    <div className={cn('overflow-auto scrollbar-thin', className)}>
      {children}
    </div>
  );
}
