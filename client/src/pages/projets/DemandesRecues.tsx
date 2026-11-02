import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Checkbox, Descriptions, Empty, Input, Segmented, Space, Tag, Typography } from 'antd';
import { api } from '../../api';
import type { DemandeEvenement } from '../../types';
import { STATUTS_DEMANDE, ecart, formatLong, useReferentiels } from '../../lib/projets';
import { lancer } from '../../lib/actionStock';

const { Text, Paragraph } = Typography;

/** Instruction des demandes d'événement : passer en instruction, accepter (crée le projet) ou refuser. */
export default function DemandesRecues() {
  const navigate = useNavigate();
  const ref = useReferentiels();
  const [demandes, setDemandes] = useState<DemandeEvenement[]>([]);
  const [filtre, setFiltre] = useState<'a-instruire' | 'toutes'>('a-instruire');
  const [reponses, setReponses] = useState<Record<string, string>>({});
  // Inscription au calendrier à l'acceptation : cochée par défaut.
  const [auCalendrier, setAuCalendrier] = useState<Record<string, boolean>>({});

  const charger = () => api.get<{ demandes: DemandeEvenement[] }>('/projets/demandes/toutes').then((d) => setDemandes(d.demandes));
  useEffect(() => {
    charger();
  }, []);

  const affichees = filtre === 'toutes' ? demandes : demandes.filter((d) => d.statut === 'nouvelle' || d.statut === 'instruction');

  const accepter = async (d: DemandeEvenement) => {
    const res = await api.post<{ ok: boolean; message: string; projetId?: string }>(`/projets/demandes/${d._id}/accepter`, {
      reponse: reponses[d._id] ?? '',
      inscrireCalendrier: auCalendrier[d._id] ?? true,
    });
    if ((await lancer(Promise.resolve(res))) && res.projetId) navigate(`/projets/${res.projetId}`);
  };

  return (
    <Card
      title="Demandes d'événement reçues"
      extra={
        <Segmented
          value={filtre}
          onChange={(v) => setFiltre(v as typeof filtre)}
          options={[
            { value: 'a-instruire', label: 'À instruire' },
            { value: 'toutes', label: 'Toutes' },
          ]}
        />
      }
    >
      {affichees.length === 0 && <Empty description="Aucune demande dans cette sélection" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {affichees.map((d) => {
          const horsDelai = ref && ecart(d.dateSouhaitee, d.createdAt.slice(0, 10)) < ref.delaiInscriptionJours;
          const enCours = d.statut === 'nouvelle' || d.statut === 'instruction';
          return (
            <Card
              key={d._id}
              size="small"
              title={d.intitule}
              extra={
                <Space>
                  <Tag color={STATUTS_DEMANDE[d.statut].couleur}>{STATUTS_DEMANDE[d.statut].libelle}</Tag>
                  {horsDelai && <Tag color="red">Hors délai</Tag>}
                </Space>
              }
            >
              <Text type="secondary">
                {d.demandeurNom} · {d.structure} · reçue le {formatLong(d.createdAt)}
              </Text>
              <Descriptions size="small" column={{ xs: 1, md: 2 }} style={{ marginTop: 8 }}>
                <Descriptions.Item label="Date souhaitée">{formatLong(d.dateSouhaitee)}</Descriptions.Item>
                <Descriptions.Item label="Lieu">{d.lieu || '—'}</Descriptions.Item>
                <Descriptions.Item label="Caractéristiques">
                  {d.criteres.length ? d.criteres.map((c) => ref?.referentiel.criteres.find((x) => x.code === c)?.libelle ?? c).join(', ') : d.type ? ref?.types[d.type] : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Public attendu">{d.jauge ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Besoins">{d.besoins.join(', ') || '—'}</Descriptions.Item>
                <Descriptions.Item label="Contact">{d.contact}</Descriptions.Item>
              </Descriptions>
              {d.description && <Paragraph style={{ marginBottom: 8 }}>{d.description}</Paragraph>}
              {d.reponse && (
                <Paragraph style={{ marginBottom: 8 }}>
                  <b>Réponse du service :</b> {d.reponse}
                </Paragraph>
              )}
              <Space wrap>
                {d.statut === 'acceptee' && d.projetId && <Button onClick={() => navigate(`/projets/${d.projetId}`)}>Ouvrir le projet</Button>}
                {enCours && (
                  <>
                    <Button type="primary" onClick={() => accepter(d)}>
                      Créer le projet
                    </Button>
                    <Checkbox checked={auCalendrier[d._id] ?? true} onChange={(e) => setAuCalendrier({ ...auCalendrier, [d._id]: e.target.checked })}>
                      Inscrire au calendrier (à valider)
                    </Checkbox>
                    {d.statut === 'nouvelle' && (
                      <Button onClick={async () => (await lancer(api.post(`/projets/demandes/${d._id}/instruction`))) && charger()}>Passer en instruction</Button>
                    )}
                    <Input
                      placeholder="Réponse au demandeur (obligatoire pour un refus)"
                      value={reponses[d._id] ?? ''}
                      onChange={(e) => setReponses({ ...reponses, [d._id]: e.target.value })}
                      style={{ width: 340 }}
                      aria-label="Réponse au demandeur"
                    />
                    <Button
                      danger
                      onClick={async () => (await lancer(api.post(`/projets/demandes/${d._id}/refuser`, { reponse: reponses[d._id] ?? '' }))) && charger()}
                    >
                      Refuser
                    </Button>
                  </>
                )}
              </Space>
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
