import { redirect } from 'next/navigation';

export default function DailyRecapRedirect() {
  redirect('/digest');
}
