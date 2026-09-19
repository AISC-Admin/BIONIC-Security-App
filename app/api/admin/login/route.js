import { NextResponse } from 'next/server';
import { poserCookieSession } from '@/lib/auth';

export async function POST(request) {
  const { password } = await request.json();
  const motDePasse = process.env.ADMIN_PASSWORD;

  if (!motDePasse) {
    return NextResponse.json(
      { erreur: "ADMIN_PASSWORD n'est pas configure sur le serveur." },
      { status: 500 }
    );
  }
  if (!password || password !== motDePasse) {
    return NextResponse.json({ erreur: 'Mot de passe incorrect.' }, { status: 401 });
  }

  await poserCookieSession({ role: 'admin' });
  return NextResponse.json({ ok: true });
}
