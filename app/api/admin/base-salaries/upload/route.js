import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireAdminSession } from '@/lib/auth';
import { PREFIXE_BLOB, TYPES_PHOTO, TYPES_CV, TYPES_PASSEPORT, TAILLE_MAX_FICHIER } from '@/lib/baseSalaries';

// Envoi direct navigateur -> Vercel Blob ("client upload") : le fichier ne
// transite pas par la fonction serverless, ce qui evite la limite de 4,5 Mo
// par requete de Vercel. Cette route se contente de delivrer un jeton
// d'envoi, uniquement au responsable connecte.
export async function POST(request) {
  const body = await request.json();
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await requireAdminSession();
        if (!session) throw new Error('Acces refuse.');
        let types;
        if (pathname.startsWith(`${PREFIXE_BLOB}photos/`)) types = TYPES_PHOTO;
        else if (pathname.startsWith(`${PREFIXE_BLOB}cv/`)) types = TYPES_CV;
        else if (pathname.startsWith(`${PREFIXE_BLOB}passeports/`)) types = TYPES_PASSEPORT;
        else throw new Error('Chemin de fichier non autorise.');
        return {
          allowedContentTypes: types,
          maximumSizeInBytes: TAILLE_MAX_FICHIER,
          addRandomSuffix: true
        };
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ erreur: error.message }, { status: 400 });
  }
}
