'use client';

export function SectionTitle({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  action?: string;
}) {
  return (
    <div className="section-title">
      <div>
        <small>{kicker}</small>
        <h1>{title}</h1>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {action && <span>{action}</span>}
    </div>
  );
}

export function InfoRow({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}
