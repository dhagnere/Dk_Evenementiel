import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Empty, Grid, Input, Modal, Popconfirm, Space, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { STATUTS_DEMANDE_EN_ATTENTE, type DemandeStock, type MouvementStock } from '../../types';
import { couleurStatut, formatEuro, formatJour, formatPrixUnitaire } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';
import { DetailDemande } from './Demandes';
import { imprimerBonLivraison } from '../../lib/bonLivraison';

const { Text } = Typography;

const libelleValidation = (statut: string) =>
  statut === 'En attente Protocole' ? 'Avis favorable' : statut === 'En attente Cabinet' ? 'Valider (Cabinet)' : 'Valider';

/** Décisions du service : demandes en attente, remises à faire, ajustements et anomalies. */
export default function Validations() {
  const { session } = useAuth();
  const mobile = !Grid.useBreakpoint().md;
  const [demandes, setDemandes] = useState<DemandeStock[]>([]);
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [refus, setRefus] = useState<{ demande: DemandeStock; motif: string } | null>(null);
  const [ouverte, setOuverte] = useState<DemandeStock | null>(null);

  const charger = () => {
    api.get<{ demandes: DemandeStock[] }>('/stock/demandes').then((d) => setDemandes(d.demandes));
    api.get<{ mouvements: MouvementStock[] }>('/stock/mouvements?statut=en-attente').then((d) => setMouvements(d.mouvements));
  };

  useEffect(() => {
    charger();
  }, []);

  const agir = async (appel: Promise<{ ok: boolean; message?: string }>) => {
    if (await lancer(appel)) charger();
  };

  const proprePersonne = (auteurId: string | null) => auteurId === session?.userId && !session?.superAdmin;

  const enAttente = demandes.filter((d) => STATUTS_DEMANDE_EN_ATTENTE.includes(d.statut));
  const aRemettre = demandes.filter((d) => d.statut === 'Validée' || d.statut === 'Validée auto');

  const colonnesBase: TableColumnsType<DemandeStock> = [
    {
      title: 'N°',
      key: 'numero',
      width: 120,
      render: (_, d) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setOuverte(d)}>
          {d.numero}
        </Button>
      ),
    },
    { title: 'Direction', dataIndex: 'directionNom', width: 170 },
    { title: 'Article', key: 'article', render: (_, d) => `${d.reference} · ${d.libelle}` },
    { title: 'Qté', dataIndex: 'quantite', width: 60, align: 'right' },
    { title: 'Valeur', key: 'valeur', width: 100, align: 'right', render: (_, d) => formatEuro(d.valeur) },
    { title: 'Bénéficiaire', key: 'beneficiaire', width: 160, render: (_, d) => d.beneficiaire || '—' },
    { title: 'Besoin', key: 'besoin', width: 100, render: (_, d) => formatJour(d.dateBesoin) },
  ];

  const colonnesAttente: TableColumnsType<DemandeStock> = [
    ...colonnesBase,
    { title: 'Statut', key: 'statut', width: 190, render: (_, d) => <Tag color={couleurStatut(d.statut)}>{d.statut}</Tag> },
    {
      title: 'Décision',
      key: 'decision',
      width: 230,
      render: (_, d) =>
        proprePersonne(d.demandeurId) ? (
          <Text type="secondary">Votre demande : décision par un autre valideur</Text>
        ) : (
          <Space>
            <Button type="primary" size="small" onClick={() => agir(api.post(`/stock/demandes/${d._id}/decision`, { decision: 'valider' }))}>
              {libelleValidation(d.statut)}
            </Button>
            <Button danger size="small" onClick={() => setRefus({ demande: d, motif: '' })}>
              Refuser
            </Button>
          </Space>
        ),
    },
  ];

  const colonnesRemise: TableColumnsType<DemandeStock> = [
    ...colonnesBase,
    {
      title: '',
      key: 'remise',
      width: 140,
      render: (_, d) => (
        <Popconfirm
          title={`Remettre ${d.numero} ?`}
          description="La sortie est valorisée au PMP TTC du jour, repris sur le bon de livraison. Des goodies vont au stock déporté de la direction s'il existe."
          okText="Remettre"
          cancelText="Annuler"
          onConfirm={async () => {
            const appel = api.post<{ ok: boolean; message?: string; demande?: DemandeStock }>(`/stock/demandes/${d._id}/remise`);
            if (await lancer(appel)) {
              const { demande } = await appel;
              charger();
              if (demande) {
                Modal.confirm({
                  title: `${d.numero} remise`,
                  content: `Total livré : ${formatEuro(demande.valeurLivree ?? 0)} TTC (PMP ${formatPrixUnitaire(demande.prixUnitaireLivre ?? 0)}).`,
                  okText: 'Imprimer le bon de livraison',
                  cancelText: 'Fermer',
                  onOk: () => imprimerBonLivraison({ ...d, ...demande }),
                });
              }
            }
          }}
        >
          <Button size="small">Marquer remise</Button>
        </Popconfirm>
      ),
    },
  ];

  const colonnesMouvements: TableColumnsType<MouvementStock> = [
    { title: 'N°', dataIndex: 'numero', width: 90 },
    { title: 'Type', key: 'type', width: 110, render: (_, m) => <Tag color={couleurStatut(m.statut)}>{m.type}</Tag> },
    { title: 'Article', key: 'article', width: 220, render: (_, m) => `${m.reference} · ${m.libelle}` },
    { title: 'Qté', dataIndex: 'quantite', width: 70, align: 'right' },
    { title: 'Détail', dataIndex: 'detail' },
    { title: 'Par', dataIndex: 'auteurNom', width: 140 },
    {
      title: 'Décision',
      key: 'decision',
      width: 200,
      render: (_, m) =>
        m.type === 'Anomalie' ? (
          <Button size="small" onClick={() => agir(api.post(`/stock/mouvements/${m._id}/decision`, { decision: 'valider' }))}>
            Marquer traitée
          </Button>
        ) : proprePersonne(m.auteurId) ? (
          <Text type="secondary">Votre ajustement</Text>
        ) : (
          <Space>
            <Button type="primary" size="small" onClick={() => agir(api.post(`/stock/mouvements/${m._id}/decision`, { decision: 'valider' }))}>
              Valider
            </Button>
            <Button danger size="small" onClick={() => agir(api.post(`/stock/mouvements/${m._id}/decision`, { decision: 'rejeter' }))}>
              Rejeter
            </Button>
          </Space>
        ),
    },
  ];

  const tableau = <T extends { _id: string }>(colonnes: TableColumnsType<T>, lignes: T[], vide: string) =>
    lignes.length === 0 ? (
      <Empty description={vide} image={Empty.PRESENTED_IMAGE_SIMPLE} />
    ) : (
      <Table rowKey="_id" size="small" columns={colonnes} dataSource={lignes} pagination={false} scroll={{ x: 'max-content' }} />
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title={`Demandes à décider (${enAttente.length})`}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Cadeaux protocolaires : avis du Protocole, puis validation du Cabinet, qui inscrit la remise au registre. Goodies au-delà
          du seuil de validation automatique : chef de service.
        </Text>
        {tableau(colonnesAttente, enAttente, 'Aucune demande en attente')}
      </Card>
      <Card title={`Demandes validées à remettre (${aRemettre.length})`}>{tableau(colonnesRemise, aRemettre, 'Aucune remise à faire')}</Card>
      <Card title={`Ajustements et anomalies (${mouvements.length})`}>
        {tableau(colonnesMouvements, mouvements, 'Aucun ajustement ni anomalie en attente')}
      </Card>

      <Modal
        title={refus ? `Refuser ${refus.demande.numero}` : ''}
        open={refus !== null}
        onCancel={() => setRefus(null)}
        okText="Refuser"
        okButtonProps={{ danger: true, disabled: !refus?.motif.trim() }}
        cancelText="Annuler"
        onOk={async () => {
          if (!refus) return;
          await agir(api.post(`/stock/demandes/${refus.demande._id}/decision`, { decision: 'refuser', motif: refus.motif }));
          setRefus(null);
        }}
      >
        <Text>Le motif est transmis au demandeur. La réservation est libérée.</Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 8 }}
          value={refus?.motif}
          onChange={(e) => refus && setRefus({ ...refus, motif: e.target.value })}
          aria-label="Motif du refus"
        />
      </Modal>

      <Drawer title={ouverte ? `Demande ${ouverte.numero}` : ''} open={ouverte !== null} onClose={() => setOuverte(null)} width={mobile ? '100%' : 520}>
        {ouverte && <DetailDemande demande={ouverte} />}
      </Drawer>
    </div>
  );
}
