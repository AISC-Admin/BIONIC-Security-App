import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { calculerFacturation } from '@/lib/clients';
import { construireClasseurFacturation } from '@/lib/excel';

// GET /api/admin/facturation/export?mois=YYYY-MM : fichier Excel pour la compta.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return new Response('Acces refuse.', { status: 403 });
  const mois = new URL(request.url).searchParams.get('mois');
  if (!/^\d{4}-\d{2}$/.test(mois || '')) return new Response('Mois invalide.', { status: 400 });

  const facturation = await calculerFacturation(mois);
  const { rows: detail } = await sql`
    SELECT to_char(s.shift_date, 'YYYY-MM-DD') AS shift_date, st.nom AS site, c.raison_sociale AS client,
           po.nom AS poste, e.nom, e.prenom, s.heure_debut, s.heure_fin, s.duree_heures
    FROM shifts s
    JOIN sites st ON st.id = s.site_id
    JOIN postes po ON po.id = s.poste_id
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN clients c ON c.id = st.client_id
    WHERE s.valide = true AND to_char(s.shift_date, 'YYYY-MM') = ${mois}
    ORDER BY lower(coalesce(c.raison_sociale, 'zzz')), lower(st.nom), s.shift_date, e.nom;
  `;
  const workbook = await construireClasseurFacturation(facturation, detail);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="facturation-${mois}.xlsx"`
    }
  });
}
