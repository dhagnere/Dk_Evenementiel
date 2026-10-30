import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Progress, Tag, Typography } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { formatEuro, formatJour } from '../../lib/formatStock';

const { Text, Title } = Typography;

interface DonneesTableau {
  sousLeSeuil: { _id: string; reference: string; libelle: string; disponible: number; seuil: number }[];
  demandesEnAttente: { _id: string; numero: string; statut: string; directionNom: string }[];
  valeurStock?: number;
  mouvementsEnAttente?: { _id: string; numero: string; type: string; detail: string; reference: string }[];
  depotsARelancer?: { _id: string; direction: string; depuis: string }[];
  consommationMois?: { direction: string; valeur: number }[];
}

function Indicateur({ libelle, valeur, aide, alerte, onClick }: { libelle: string; valeur: string; aide: string; alerte?: boolean; onClick?: () => void }) {
  return (
    <Card hoverable={!!onClick} onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <Text type="secondary">{libelle}</Text>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '6px 0', color: alerte ? '#b4530f' : '#14263d' }}>{valeur}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {aide}
      </Text>
    </Card>
  );
}

/** Tableau de bord du module : ce qui demande une action, par exception. */
export default function TableauDeBordStock() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState<DonneesTableau | null>(null);
  const service = peut('stock', 'validation');

  useEffect(() => {
    api.get<DonneesTableau>('/stock/tableau-de-bord').then(setDonnees);
  }, []);

  if (!donnees) return null;

  const attention = [
    ...donnees.sousLeSeuil.map((a) => ({
      cle: `s${a._id}`,
      niveau: <Tag color="orange">Stock</Tag>,
      texte: `${a.reference} · ${a.libelle} : ${a.disponible} disponible(s), seuil ${a.seuil}. Commande à lancer.`,
      action: 'Catalogue',
      chemin: '/stock/catalogue',
    })),
    ...donnees.demandesEnAttente.map((d) => ({
      cle: `d${d._id}`,
      niveau: <Tag color="blue">Validation</Tag>,
      texte: `${d.numero} — ${d.statut.toLowerCase()} (${d.directionNom})`,
      action: service ? 'Décider' : 'Voir',
      chemin: service ? '/stock/validations' : '/stock/demandes',
    })),
    ...(donnees.mouvementsEnAttente ?? []).map((m) => ({
      cle: `m${m._id}`,
      niveau: <Tag color="blue">{m.type}</Tag>,
      texte: `${m.numero} — ${m.reference} : ${m.detail}`,
      action: 'Traiter',
      chemin: '/stock/validations',
    })),
    ...(donnees.depotsARelancer ?? []).map((p) => ({
      cle: `p${p._id}`,
      niveau: <Tag color="red">Déporté</Tag>,
      texte: `${p.direction} : aucune déclaration depuis le ${formatJour(p.depuis)}.`,
      action: 'Relancer',
      chemin: '/stock/deportes',
    })),
  ];
  const maxConso = Math.max(1, ...(donnees.consommationMois ?? []).map((c) => c.valeur));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Title level={3} style={{ margin: 0 }}>
        Stock & Protocole
      </Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Indicateur
          libelle="Articles sous le seuil"
          valeur={String(donnees.sousLeSeuil.length)}
          aide="Disponible ≤ seuil d'alerte"
          alerte={donnees.sousLeSeuil.length > 0}
          onClick={() => navigate('/stock/catalogue')}
        />
        <Indicateur
          libelle="Demandes en attente"
          valeur={String(donnees.demandesEnAttente.length)}
          aide={service ? 'Protocole, Cabinet, chef de service' : 'Pour votre direction'}
        />
        {donnees.valeurStock !== undefined && (
          <Indicateur libelle="Valeur du stock" valeur={formatEuro(donnees.valeurStock)} aide="Local central, au prix moyen pondéré" />
        )}
        {donnees.depotsARelancer && (
          <Indicateur
            libelle="Stocks déportés à relancer"
            valeur={String(donnees.depotsARelancer.length)}
            aide="Sans déclaration récente"
            alerte={donnees.depotsARelancer.length > 0}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Ce qui demande votre attention">
          {attention.length === 0 ? (
            <Empty description="Rien à signaler" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attention.map((a) => (
                <div key={a.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8 }}>
                  {a.niveau}
                  <Text style={{ flex: 1 }}>{a.texte}</Text>
                  <Button size="small" onClick={() => navigate(a.chemin)}>
                    {a.action}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
        {donnees.consommationMois && (
          <Card title="Consommation du mois par direction">
            {donnees.consommationMois.length === 0 ? (
              <Empty description="Aucune remise ce mois-ci" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              donnees.consommationMois.map((c) => (
                <div key={c.direction} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{c.direction}</Text>
                    <Text strong>{formatEuro(c.valeur)}</Text>
                  </div>
                  <Progress percent={Math.round((c.valeur / maxConso) * 100)} showInfo={false} size="small" />
                </div>
              ))
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Valorisation au prix moyen pondéré des remises du mois.
            </Text>
          </Card>
        )}
      </div>
    </div>
  );
}
