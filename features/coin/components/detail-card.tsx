import { FormattedPrice } from '@/features/coins/components/formatted-price';

export function Heading({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="card-heading">
      <div>
        <small>{kicker}</small>
        <h2>{title}</h2>
      </div>
      {action && <span>{action}</span>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  const shouldFormatPrice = /price/i.test(label);

  return (
    <div>
      <span>{label}</span>
      <b>{shouldFormatPrice ? <FormattedPrice value={value} /> : value}</b>
    </div>
  );
}

export function Info({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <b className={positive ? 'positive' : ''}>{value}</b>
    </div>
  );
}
