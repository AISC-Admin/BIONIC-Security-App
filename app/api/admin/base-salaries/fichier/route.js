import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { requireAdminSession } from '@/lib/auth';
import { PREFIXE_BLOB } from '@/lib/baseSalaries';

// Sert une photo ou un CV du store Blob prive, uniquement au responsable
// connecte. ?pathname=base-salaries/...  (&telecharger=1&nom=CV.pdf pour
// forcer le telechargement avec un nom lisible).
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return new NextResponse('Acces refuse.', { status: 403 });

  const params = request.nextUrl.searchParams;
  const pathname = params.get('pathname') || '';
  if (!pathname.startsWith(PREFIXE_BLOB) || pathname.includes('..')) {
    return new NextResponse('Chemin invalide.', { status: 400 });
  }

  const result = await get(pathname, { access: 'private' });
  if (result?.statusCode !== 200) {
    return new NextResponse('Fichier introuvable.', { status: 404 });
  }

  const headers = {
    'Content-Type': result.blob.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300'
  };
  const nom = (params.get('nom') || pathname.split('/').pop()).replace(/[^\w.\- ]/g, '_');
  headers['Content-Disposition'] = `${params.get('telecharger') ? 'attachment' : 'inline'}; filename="${nom}"`;
  return new NextResponse(result.stream, { headers });
}
