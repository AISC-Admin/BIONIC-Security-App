import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireAdminSession } from '@/lib/auth';

// Envoi direct navigateur -> Vercel Blob (store prive) des documents
// contractuels clients (RIB, KBIS, contrat...). Ne delivre un jeton d'envoi
// qu'au responsable connecte, et uniquement pour le dossier clients/.
const TYPES_AUTORISES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export async function POST(request) {
  const body = await request.json();
  try {
    const reponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await requireAdminSession();
        if (!session) throw new Error('Acces refuse.');
        if (!pathname.startsWith('clients/')) throw new Error('Chemin non autorise.');
        return {
          allowedContentTypes: TYPES_AUTORISES,
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true
        };
      }
    });
    return NextResponse.json(reponse);
  } catch (e) {
    return NextResponse.json({ erreur: e.message || 'Envoi impossible.' }, { status: 400 });
  }
}
