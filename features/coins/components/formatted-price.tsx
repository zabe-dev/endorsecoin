import type { ReactNode } from 'react';

type FormattedPriceProps = {
  value: string;
  className?: string;
};

export function FormattedPrice({ value, className }: FormattedPriceProps) {
  const priceClassName = className ? `compact-price ${className}` : 'compact-price';
  const parts = getCompactZeroPriceParts(value);

  if (!parts) {
    return (
      <span className={priceClassName} title={value}>
        {value}
      </span>
    );
  }

  return (
    <span className={priceClassName} title={value}>
      {parts.prefix}
      <span>{parts.leadingZero}</span>
      <sub>{parts.zeroCount}</sub>
      <span>{parts.significant}</span>
    </span>
  );
}

function getCompactZeroPriceParts(value: string): {
  prefix: ReactNode;
  leadingZero: string;
  zeroCount: number;
  significant: string;
} | null {
  const match = value.match(/^(\$?0\.)(0{3,})([1-9][\d,]*)$/);
  if (!match) return null;

  const [, prefix, zeros, significant] = match;

  return {
    prefix,
    leadingZero: '0',
    zeroCount: zeros.length,
    significant,
  };
}
