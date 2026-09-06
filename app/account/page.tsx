import { createPrivatePageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = createPrivatePageMetadata('Account', '/account');

export default async function AccountPage() {
  redirect('/dashboard');
}
