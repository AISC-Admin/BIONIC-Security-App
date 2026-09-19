import { NextResponse } from 'next/server';
import { supprimerCookieSession } from '@/lib/auth';

export async function POST() {
  await supprimerCookieSession();
  return NextResponse.json({ ok: true });
}
