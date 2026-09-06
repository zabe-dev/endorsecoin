import type { Metadata } from 'next';
import { createPrivatePageMetadata } from '@/lib/seo/metadata';
import { redirect } from 'next/navigation';

export const metadata: Metadata = createPrivatePageMetadata('Admin', '/admin');

export default async function AdminPage() {
  redirect('/admin/dashboard');
}
