'use client';

import { useEffect, useState } from 'react';

type WeeklyReset = { week: number; days: number; hours: number };

export function WeeklyResetChip() {
  const [reset, setReset] = useState<WeeklyReset>(() => getWeeklyReset(new Date()));

  useEffect(() => {
    const update = () => setReset(getWeeklyReset(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="week-chip"
      aria-label={`Week ${reset.week}, ${reset.days} days and ${reset.hours} hours until rankings reset`}
    >
      <span>WEEK {reset.week}</span>
      <b>
        {String(reset.days).padStart(2, '0')}d <i>:</i> {String(reset.hours).padStart(2, '0')}h
      </b>
      <small>until reset</small>
    </div>
  );
}

function getWeeklyReset(now: Date): WeeklyReset {
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextReset = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
  );
  const remainingHours = Math.max(0, Math.floor((nextReset - now.getTime()) / 3_600_000));

  return {
    week: getIsoWeek(now),
    days: Math.floor(remainingHours / 24),
    hours: remainingHours % 24,
  };
}

function getIsoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
