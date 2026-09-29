import type { ReactNode, MouseEvent } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  hover?: boolean;
}

export function Card({
  children,
  className = '',
  onClick,
  hover = false,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_6px_16px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-all duration-200 ${
        hover || onClick ? 'cursor-pointer hover:border-brand/30 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
