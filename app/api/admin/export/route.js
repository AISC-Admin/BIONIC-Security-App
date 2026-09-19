import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { construireClasseurPointages } from '@/lib/excel';

// GET /api/admin/export?mois=YYYY-MM  (optionnel : sans "mois", exporte tout l'historique)
// Le fichier est regenere a la volee a chaque appel a partir des donnees en
// base : il reflete donc toujours les vacations les plus recentes, sans
// etape manuelle de saisie ni de synchronisation.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ erreur: 'Acces refuse.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois');

  const { rows } = mois
    ? await sql`
        SELECT s.employee_id, e.nom, e.prenom, s.shift_date, s.heure_debut, s.heure_fin,
               s.duree_heures, s.taux_horaire, s.montant, s.valide,
               st.nom AS site, po.nom AS poste
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN sites st ON st.id = s.site_id
        JOIN postes po ON po.id = s.poste_id
        WHERE to_char(s.shift_date, 'YYYY-MM') = ${mois}
        ORDER BY s.shift_date, e.nom;
      `
    : await sql`
        SELECT s.employee_id, e.nom, e.prenom, s.shift_date, s.heure_debut, s.heure_fin,
               s.duree_heures, s.taux_horaire, s.montant, s.valide,
               st.nom AS site, po.nom AS poste
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN sites st ON st.id = s.site_id
        JOIN postes po ON po.id = s.poste_id
        ORDER BY s.shift_date, e.nom;
      `;

  const workbook = await construireClasseurPointages(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const nomFichier = mois ? `pointages-${mois}.xlsx` : 'pointages-historique-complet.xlsx';

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomFichier}"`
    }
  });
}
