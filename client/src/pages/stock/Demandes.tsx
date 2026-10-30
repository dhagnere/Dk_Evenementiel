import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Grid, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, Timeline, Typography, type TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useDirections } from '../../components/EditeurDroits';
import { STATUTS_DEMANDE_EN_ATTENTE, type ArticleStock, type DemandeStock, type ParametresStock } from '../../types';
import { couleurStatut, formatEuro, formatJour, joursAvant } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';
import { SelecteurEvenement } from '../../components/SelecteurEvenement';
import type { FicheEvenementUnique, IndicateursProjet } from '../../types';

const { Text } = Typography;

interface Formulaire {
  directionId: string | null;
  evenement: string;
  articleId: string | null;
  quantite: number;
  dateBesoin: Dayjs | null;
  motifTardif: string;
  beneficiaire: string;
  occasion: string;
  elu: string;
  projetId: string | null;
  evenementId: string | null;
  evenementLibelle?: string;
}

const VIDE: Formulaire = {
  directionId: null,
  evenement: '',
  articleId: null,
  quantite: 1,
  dateBesoin: null,
  motifTardif: '',
  beneficiaire: '',
  occasion: '',
  elu: '',
  projetId: null,
  evenementId: null,
};

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

/** Fiche détaillée d'une demande, avec son historique. Partagée avec l'écran des validations. */
export function DetailDemande({ demande }: { demande: DemandeStock }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Statut">
          <Tag color={couleurStatut(demande.statut)}>{demande.statut}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Direction">{demande.directionNom}</Descriptions.Item>
        <Descriptions.Item label="Événement">{demande.evenement}</Descriptions.Item>
        <Descriptions.Item label="Article">
          {demande.reference} · {demande.libelle}
        </Descriptions.Item>
        <Descriptions.Item label="Quantité">{demande.quantite}</Descriptions.Item>
        <Descriptions.Item label="Valeur estimée">{formatEuro(demande.valeur)}</Descriptions.Item>
        <Descriptions.Item label="Besoin le">{formatJour(demande.dateBesoin)}</Descriptions.Item>
        {demande.beneficiaire && <Descriptions.Item label="Bénéficiaire">{demande.beneficiaire}</Descriptions.Item>}
        {demande.occasion && <Descriptions.Item label="Occasion">{demande.occasion}</Descriptions.Item>}
        {demande.elu && <Descriptions.Item label="Élu remettant">{demande.elu}</Descriptions.Item>}
        <Descriptions.Item label="Demandeur">{demande.demandeurNom}</Descriptions.Item>
        {demande.motifRefus && <Descriptions.Item label="Motif du refus">{demande.motifRefus}</Descriptions.Item>}
      </Descriptions>
      <Timeline
        items={demande.historique.map((e) => ({
          children: (
            <div>
              <Text strong>{e.action}</Text>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                {new Date(e.date).toLocaleString('fr-FR')} — {e.par}
              </div>
              {e.motif && <div style={{ fontSize: 13 }}>{e.motif}</div>}
            </div>
          ),
        }))}
      />
    </div>
  );
}

export default function DemandesStock() {
  const { session, peut } = useAuth();
  const mobile = !Grid.useBreakpoint().md;
  const service = peut('stock', 'validation');
  const directions = useDirections();
  const [demandes, setDemandes] = useState<DemandeStock[]>([]);
  const [articles, setArticles] = useState<ArticleStock[]>([]);
  const [parametres, setParametres] = useState<ParametresStock | null>(null);
  const [ouverte, setOuverte] = useState<DemandeStock | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [f, setF] = useState<Formulaire>(VIDE);
  const [memoire, setMemoire] = useState<{ dateRemise: string; beneficiaire: string; occasion: string; articleId: string; libelle: string }[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [params, setParams] = useSearchParams();
  const [projets, setProjets] = useState<IndicateursProjet[]>([]);
  const voitProjets = peut('projets', 'lecture');

  const charger = () => api.get<{ demandes: DemandeStock[] }>('/stock/demandes').then((d) => setDemandes(d.demandes));

  useEffect(() => {
    charger();
    api.get<{ articles: ArticleStock[] }>('/stock/articles').then((d) => setArticles(d.articles.filter((a) => a.actif)));
    api.get<{ parametres: ParametresStock }>('/stock/parametres').then((d) => setParametres(d.parametres));
  }, []);

  useEffect(() => {
    if (voitProjets) api.get<{ projets: IndicateursProjet[] }>('/projets?filtre=actifs').then((d) => setProjets(d.projets));
  }, [voitProjets]);

  // Ouverture depuis un projet ou une fiche événement : formulaire prérempli et rattaché.
  useEffect(() => {
    const projetId = params.get('projet');
    const evenementId = params.get('evenement');
    if (!projetId && !evenementId) return;
    setParams({}, { replace: true });
    if (projetId) {
      api.get<{ projet: { titre: string } }>(`/projets/${projetId}`).then((d) => {
        setF({ ...VIDE, projetId, evenement: d.projet.titre });
        setFormulaireOuvert(true);
      });
    } else if (evenementId) {
      api.get<FicheEvenementUnique>(`/liaisons/evenement/${evenementId}`).then((d) => {
        setF({ ...VIDE, evenementId, evenement: d.evenement.nom, evenementLibelle: d.evenement.nom });
        setFormulaireOuvert(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const article = articles.find((a) => a._id === f.articleId);
  const protocole = article?.categorie === 'Protocole';

  // Cadeaux déjà remis au bénéficiaire saisi, pour éviter d'offrir deux fois le même objet.
  useEffect(() => {
    if (!protocole || f.beneficiaire.trim().length < 3) return setMemoire([]);
    const minuterie = setTimeout(() => {
      api.get<{ cadeaux: typeof memoire }>(`/stock/registre/beneficiaire?nom=${encodeURIComponent(f.beneficiaire.trim())}`).then((d) => setMemoire(d.cadeaux));
    }, 300);
    return () => clearTimeout(minuterie);
  }, [protocole, f.beneficiaire]);

  const controles = useMemo(() => {
    if (!article || !parametres) return null;
    const disponible = article.stockPhysique - article.stockReserve;
    const valeur = f.quantite * article.pmp;
    const jours = f.dateBesoin ? joursAvant(f.dateBesoin.format('YYYY-MM-DD')) : null;
    const tardive = jours !== null && jours < parametres.delaiDemandeTardiveJours;
    const circuit = protocole
      ? 'Protocole puis Cabinet'
      : valeur <= parametres.seuilValidationAutomatique
        ? 'Validation automatique'
        : 'Chef de service';
    return { disponible, valeur, jours, tardive, circuit, suffisant: f.quantite > 0 && f.quantite <= disponible };
  }, [article, parametres, f.quantite, f.dateBesoin, protocole]);

  let blocage: string | null = null;
  if (service && !f.directionId) blocage = 'Choisissez la direction demandeuse.';
  else if (!f.evenement.trim()) blocage = "Indiquez l'événement.";
  else if (!article || !controles) blocage = "Choisissez l'article.";
  else if (!controles.suffisant) blocage = 'Ajustez la quantité au disponible.';
  else if (controles.jours === null || controles.jours < 0) blocage = 'Indiquez une date de besoin à venir.';
  else if (controles.tardive && !f.motifTardif.trim()) blocage = 'Motif de demande tardive requis.';
  else if (protocole && (!f.beneficiaire.trim() || !f.occasion.trim() || !f.elu.trim())) blocage = 'Complétez les informations protocolaires.';

  const soumettre = async () => {
    setEnvoi(true);
    const ok = await lancer(
      api.post('/stock/demandes', {
        directionId: service ? f.directionId : null,
        evenement: f.evenement,
        articleId: f.articleId,
        quantite: f.quantite,
        dateBesoin: f.dateBesoin?.format('YYYY-MM-DD'),
        motifTardif: f.motifTardif,
        beneficiaire: f.beneficiaire,
        occasion: f.occasion,
        elu: f.elu,
        projetId: f.projetId,
        evenementId: f.projetId ? null : f.evenementId,
      })
    );
    setEnvoi(false);
    if (ok) {
      setFormulaireOuvert(false);
      setF(VIDE);
      charger();
    }
  };

  const annuler = async (d: DemandeStock) => {
    if (await lancer(api.post(`/stock/demandes/${d._id}/annuler`))) {
      setOuverte(null);
      charger();
    }
  };

  const annulable = (d: DemandeStock) =>
    [...STATUTS_DEMANDE_EN_ATTENTE, 'Validée', 'Validée auto'].includes(d.statut) && (service || d.demandeurId === session?.userId);

  const colonnes: TableColumnsType<DemandeStock> = [
    { title: 'N°', dataIndex: 'numero', width: 120, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Direction', dataIndex: 'directionNom', width: 180 },
    {
      title: 'Événement',
      key: 'evenement',
      render: (_, d) => (
        <span>
          {d.evenement}
          {d.projetTitre && (
            <Tag color="blue" style={{ marginLeft: 6 }}>
              Projet
            </Tag>
          )}
        </span>
      ),
    },
    { title: 'Article', key: 'article', render: (_, d) => `${d.reference} · ${d.libelle}` },
    { title: 'Qté', dataIndex: 'quantite', width: 70, align: 'right' },
    { title: 'Besoin', key: 'besoin', width: 110, render: (_, d) => formatJour(d.dateBesoin) },
    { title: 'Statut', key: 'statut', width: 200, render: (_, d) => <Tag color={couleurStatut(d.statut)}>{d.statut}</Tag> },
  ];

  return (
    <Card
      title={service ? 'Demandes de sortie' : 'Demandes de ma direction'}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormulaireOuvert(true)}>
          Nouvelle demande
        </Button>
      }
    >
      {!service && !session?.directionId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Votre compte n'est rattaché à aucune direction : vous ne pouvez pas encore déposer de demande. Contactez un super-administrateur."
        />
      )}
      <Table
        rowKey="_id"
        size="small"
        columns={colonnes}
        dataSource={demandes}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        onRow={(d) => ({ onClick: () => setOuverte(d), style: { cursor: 'pointer' } })}
      />

      <Drawer
        title={ouverte ? `Demande ${ouverte.numero}` : ''}
        open={ouverte !== null}
        onClose={() => setOuverte(null)}
        width={mobile ? '100%' : 520}
        extra={
          ouverte &&
          annulable(ouverte) && (
            <Popconfirm title="Annuler cette demande ?" description="La réservation sera libérée." okText="Annuler la demande" cancelText="Non" onConfirm={() => annuler(ouverte)}>
              <Button danger>Annuler la demande</Button>
            </Popconfirm>
          )
        }
      >
        {ouverte && <DetailDemande demande={ouverte} />}
      </Drawer>

      <Drawer
        title="Nouvelle demande de sortie"
        open={formulaireOuvert}
        onClose={() => setFormulaireOuvert(false)}
        width={mobile ? '100%' : 560}
        extra={
          <Space>
            <Button onClick={() => setFormulaireOuvert(false)}>Fermer</Button>
            <Button type="primary" disabled={blocage !== null} loading={envoi} onClick={soumettre}>
              Soumettre
            </Button>
          </Space>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {service ? (
            <Champ libelle="Direction demandeuse">
              <Select
                value={f.directionId ?? undefined}
                onChange={(directionId) => setF({ ...f, directionId })}
                options={directions.filter((d) => d.actif).map((d) => ({ value: d._id, label: d.nom }))}
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
              />
            </Champ>
          ) : (
            <Text type="secondary">Direction : {session?.direction ?? '—'}</Text>
          )}
          {voitProjets && (
            <Champ libelle="Projet (facultatif)">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Rattacher à un projet en préparation"
                value={f.projetId ?? undefined}
                onChange={(projetId?: string) => {
                  const p = projets.find((x) => x._id === projetId);
                  setF({ ...f, projetId: projetId ?? null, evenementId: null, evenement: p ? p.titre : f.evenement });
                }}
                options={projets.map((p) => ({ value: p._id, label: `${p.titre} — ${formatJour(p.dateJour)}` }))}
                style={{ width: '100%' }}
              />
            </Champ>
          )}
          {!f.projetId && (
            <Champ libelle="Événement du calendrier (facultatif)">
              <SelecteurEvenement
                valeur={f.evenementId}
                libelleInitial={f.evenementLibelle}
                onChange={(evenementId, ev) => setF({ ...f, evenementId, evenementLibelle: ev?.nom, evenement: ev ? ev.nom : f.evenement })}
              />
            </Champ>
          )}
          <Champ libelle="Événement">
            <Input value={f.evenement} onChange={(e) => setF({ ...f, evenement: e.target.value })} placeholder="Nom de la manifestation" />
          </Champ>
          <Champ libelle="Article">
            <Select
              value={f.articleId ?? undefined}
              onChange={(articleId) => setF({ ...f, articleId })}
              options={articles.map((a) => ({
                value: a._id,
                label: `${a.reference} · ${a.libelle} (${a.categorie === 'Protocole' ? 'protocole' : 'goodies'})`,
              }))}
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
            />
          </Champ>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Champ libelle="Quantité">
              <InputNumber min={1} value={f.quantite} onChange={(v) => setF({ ...f, quantite: Number(v ?? 0) })} />
            </Champ>
            <Champ libelle="Date de besoin">
              <DatePicker
                format="DD/MM/YYYY"
                value={f.dateBesoin}
                onChange={(dateBesoin) => setF({ ...f, dateBesoin })}
                disabledDate={(d) => d.isBefore(dayjs(), 'day')}
              />
            </Champ>
          </div>
          {controles?.tardive && (
            <Champ libelle={`Demande tardive (moins de ${parametres?.delaiDemandeTardiveJours} jours) : motif`}>
              <Input.TextArea rows={2} value={f.motifTardif} onChange={(e) => setF({ ...f, motifTardif: e.target.value })} />
            </Champ>
          )}
          {protocole && (
            <Card size="small" title="Informations protocolaires">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Champ libelle="Bénéficiaire">
                  <Input value={f.beneficiaire} onChange={(e) => setF({ ...f, beneficiaire: e.target.value })} />
                </Champ>
                {memoire.length > 0 && (
                  <Alert
                    type={memoire.some((m) => m.articleId === f.articleId) ? 'error' : 'info'}
                    showIcon
                    message={
                      memoire.some((m) => m.articleId === f.articleId)
                        ? 'Ce bénéficiaire a déjà reçu cet objet'
                        : 'Cadeaux déjà remis à ce bénéficiaire'
                    }
                    description={memoire.map((m) => `${formatJour(m.dateRemise)} : ${m.libelle} (${m.occasion})`).join(' ; ')}
                  />
                )}
                <Champ libelle="Occasion">
                  <Input value={f.occasion} onChange={(e) => setF({ ...f, occasion: e.target.value })} placeholder="Visite officielle, accueil de délégation…" />
                </Champ>
                <Champ libelle="Élu remettant">
                  <Input value={f.elu} onChange={(e) => setF({ ...f, elu: e.target.value })} />
                </Champ>
              </div>
            </Card>
          )}
          {controles && (
            <Descriptions size="small" column={1} bordered title="Contrôles">
              <Descriptions.Item label="Disponible">
                {controles.disponible} (physique {article!.stockPhysique}, réservé {article!.stockReserve})
              </Descriptions.Item>
              <Descriptions.Item label="Quantité">
                <Text type={controles.suffisant ? 'success' : 'danger'}>
                  {controles.suffisant ? `${f.quantite} — disponible` : `${f.quantite} — stock insuffisant`}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Valeur estimée">{formatEuro(controles.valeur)}</Descriptions.Item>
              <Descriptions.Item label="Circuit">{controles.circuit}</Descriptions.Item>
              <Descriptions.Item label="Délai">
                {controles.jours === null ? '—' : controles.jours < 0 ? 'Date passée' : `${controles.jours} jours${controles.tardive ? ' — demande tardive' : ''}`}
              </Descriptions.Item>
            </Descriptions>
          )}
          <Text type={blocage ? 'warning' : 'success'}>{blocage ?? 'Tous les contrôles sont satisfaits.'}</Text>
        </div>
      </Drawer>
    </Card>
  );
}
