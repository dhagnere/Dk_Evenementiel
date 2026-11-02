import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, Button, Card, DatePicker, Descriptions, Input, InputNumber, Segmented, Select, Table, Tabs, Tag, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../../api';
import type { ArticleStock, MouvementStock, ParametresStock } from '../../types';
import { couleurStatut, formatEuro } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

const MOTIFS = ['Casse', 'Perte', "Écart d'inventaire", 'Erreur de saisie', 'Échantillon / don', 'Autre'];
const ORIGINES = [
  { value: 'bon de commande', label: 'Bon de commande', ref: "N° d'engagement (logiciel financier)", aide: "Le n° d'engagement relie la réception à la dépense." },
  { value: 'marché', label: 'Marché public', ref: 'N° ou intitulé du marché', aide: 'Reprendre le prix du bordereau dans chaque ligne.' },
  { value: 'achat ponctuel', label: 'Achat ponctuel', ref: 'Référence de la facture', aide: 'Conserver la facture au dossier.' },
];

interface LigneReception {
  articleId: string;
  attendu: number;
  recu: number;
  nonConforme: number;
  prix: number;
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

function controleLigne(l: Pick<LigneReception, 'attendu' | 'recu' | 'nonConforme'>) {
  const ecart = l.recu + l.nonConforme - l.attendu;
  if (l.nonConforme > 0) return { texte: `${l.nonConforme} non conforme(s)`, couleur: 'red' };
  if (ecart < 0) return { texte: `Manque ${-ecart}`, couleur: 'orange' };
  if (ecart > 0) return { texte: `Excédent ${ecart}`, couleur: 'orange' };
  return { texte: 'Conforme', couleur: 'green' };
}

function Reception({ articles, onFait }: { articles: ArticleStock[]; onFait: () => void }) {
  const [origine, setOrigine] = useState('bon de commande');
  const [fournisseur, setFournisseur] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [ligne, setLigne] = useState<LigneReception>({ articleId: '', attendu: 1, recu: 1, nonConforme: 0, prix: 0 });
  const [lignes, setLignes] = useState<LigneReception[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const infos = ORIGINES.find((o) => o.value === origine)!;
  const parId = new Map(articles.map((a) => [a._id, a]));

  // Effet de la réception sur le stock et le PMP, avant validation.
  const impact = useMemo(() => {
    const parArticle = new Map<string, { avant: number; apres: number; pmpAvant: number | null; pmp: number; base: number }>();
    for (const l of lignes) {
      const a = parId.get(l.articleId)!;
      const c = parArticle.get(a._id) ?? { avant: a.stockPhysique, apres: a.stockPhysique, pmpAvant: a.aValoriser ? null : a.pmp, pmp: a.pmp, base: a.aValoriser ? 0 : a.stockPhysique };
      const total = c.base + l.recu;
      c.pmp = total > 0 ? (c.base * c.pmp + l.recu * l.prix) / total : c.pmp;
      c.base = total;
      c.apres += l.recu;
      parArticle.set(a._id, c);
    }
    return [...parArticle.entries()].map(([id, c]) => ({ article: parId.get(id)!, ...c }));
  }, [lignes, articles]);

  const ligneValide = ligne.articleId && ligne.attendu > 0 && ligne.recu + ligne.nonConforme > 0 && ligne.prix >= 0;
  const anomalies = lignes.filter((l) => controleLigne(l).texte !== 'Conforme').length;

  const choisirArticle = (articleId: string) => {
    const a = parId.get(articleId);
    setLigne({ ...ligne, articleId, prix: a ? Math.round((a.prixAchat ?? (a.aValoriser ? 0 : a.pmp)) * 100) / 100 : 0 });
  };

  const valider = async () => {
    setEnvoi(true);
    const ok = await lancer(api.post('/stock/receptions', { origine, fournisseur, reference, date: date?.format('YYYY-MM-DD'), lignes }));
    setEnvoi(false);
    if (ok) {
      setLignes([]);
      setReference('');
      onFait();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
      <Segmented value={origine} onChange={(v) => setOrigine(String(v))} options={ORIGINES.map((o) => ({ value: o.value, label: o.label }))} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Champ libelle="Fournisseur">
          <Input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
        </Champ>
        <Champ libelle={infos.ref}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Champ>
        <Champ libelle="Date de réception">
          <DatePicker format="DD/MM/YYYY" value={date} onChange={setDate} style={{ width: '100%' }} />
        </Champ>
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {infos.aide}
      </Text>

      <Card size="small" title="Ajouter une ligne">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Champ libelle="Article">
            <Select
              value={ligne.articleId || undefined}
              onChange={choisirArticle}
              options={articles.map((a) => ({ value: a._id, label: `${a.reference} · ${a.libelle}` }))}
              showSearch
              optionFilterProp="label"
              style={{ width: 260 }}
            />
          </Champ>
          <Champ libelle="Commandé">
            <InputNumber min={1} value={ligne.attendu} onChange={(v) => setLigne({ ...ligne, attendu: Number(v ?? 0), recu: Number(v ?? 0) })} />
          </Champ>
          <Champ libelle="Reçu conforme">
            <InputNumber min={0} value={ligne.recu} onChange={(v) => setLigne({ ...ligne, recu: Number(v ?? 0) })} />
          </Champ>
          <Champ libelle="Non conforme">
            <InputNumber min={0} value={ligne.nonConforme} onChange={(v) => setLigne({ ...ligne, nonConforme: Number(v ?? 0) })} />
          </Champ>
          <Champ libelle="Prix d'achat unitaire TTC (€)">
            <InputNumber min={0} step={0.01} value={ligne.prix} onChange={(v) => setLigne({ ...ligne, prix: Number(v ?? 0) })} />
          </Champ>
          {ligneValide && <Tag color={controleLigne(ligne).couleur}>{controleLigne(ligne).texte}</Tag>}
          <Button
            disabled={!ligneValide}
            onClick={() => {
              setLignes([...lignes, ligne]);
              setLigne({ ...ligne, nonConforme: 0 });
            }}
          >
            Ajouter
          </Button>
        </div>
      </Card>

      {lignes.length > 0 && (
        <Table
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={false}
          dataSource={lignes}
          columns={[
            { title: 'Article', key: 'a', render: (_, l) => `${parId.get(l.articleId)?.reference} · ${parId.get(l.articleId)?.libelle}` },
            { title: 'Commandé', dataIndex: 'attendu', align: 'right' },
            { title: 'Conforme', dataIndex: 'recu', align: 'right' },
            { title: 'Non conforme', dataIndex: 'nonConforme', align: 'right' },
            { title: "Prix d'achat TTC", key: 'p', align: 'right', render: (_, l) => formatEuro(l.prix) },
            { title: 'Contrôle', key: 'c', render: (_, l) => <Tag color={controleLigne(l).couleur}>{controleLigne(l).texte}</Tag> },
            {
              title: '',
              key: 'x',
              render: (_, _l, i) => (
                <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Retirer la ligne" onClick={() => setLignes(lignes.filter((_, j) => j !== i))} />
              ),
            },
          ]}
        />
      )}
      {impact.length > 0 && (
        <Descriptions size="small" column={1} bordered title="Effet sur le stock">
          {impact.map((c) => (
            <Descriptions.Item key={c.article._id} label={`${c.article.reference} · ${c.article.libelle}`}>
              Stock {c.avant} → {c.apres} · PMP {c.pmpAvant === null ? '—' : formatEuro(c.pmpAvant)} → {formatEuro(c.pmp)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {anomalies > 0 && <Alert type="warning" showIcon message={`${anomalies} ligne(s) avec écart : une anomalie sera créée pour le suivi fournisseur.`} />}
      <div>
        <Button type="primary" loading={envoi} disabled={!lignes.length || !fournisseur.trim() || !reference.trim() || !date} onClick={valider}>
          Valider la réception
        </Button>
      </div>
    </div>
  );
}

function Ajustement({
  articles,
  parametres,
  articleInitial,
  onFait,
}: {
  articles: ArticleStock[];
  parametres: ParametresStock | null;
  articleInitial: string | null;
  onFait: () => void;
}) {
  const [articleId, setArticleId] = useState<string | null>(articleInitial);
  const [sens, setSens] = useState<'moins' | 'plus'>('moins');
  const [quantite, setQuantite] = useState(1);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const a = articles.find((x) => x._id === articleId);

  useEffect(() => setArticleId(articleInitial), [articleInitial]);

  const variation = sens === 'moins' ? -quantite : quantite;
  const disponible = a ? a.stockPhysique - a.stockReserve : 0;
  const valeur = a ? Math.abs(variation) * a.pmp : 0;
  const aValider = !!a && (valeur > (parametres?.seuilValidationAjustement ?? 50) || a.categorie === 'Protocole');
  const commentaireRequis = aValider || motif === 'Autre';
  let blocage: string | null = null;
  if (!a) blocage = "Choisissez l'article.";
  else if (quantite <= 0) blocage = 'Quantité requise.';
  else if (sens === 'moins' && quantite > disponible) blocage = 'Impossible : le stock réservé serait entamé.';
  else if (commentaireRequis && !commentaire.trim()) blocage = 'Commentaire obligatoire.';

  const appliquer = async () => {
    setEnvoi(true);
    const ok = await lancer(api.post('/stock/ajustements', { articleId, variation, motif, commentaire }));
    setEnvoi(false);
    if (ok) {
      setQuantite(1);
      setCommentaire('');
      onFait();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <Champ libelle="Article">
        <Select
          value={articleId ?? undefined}
          onChange={setArticleId}
          options={articles.map((x) => ({ value: x._id, label: `${x.reference} · ${x.libelle}` }))}
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
        />
      </Champ>
      <Segmented
        value={sens}
        onChange={(v) => setSens(v as 'moins' | 'plus')}
        options={[
          { value: 'moins', label: 'Retirer (−)' },
          { value: 'plus', label: 'Ajouter (+)' },
        ]}
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Champ libelle="Quantité">
          <InputNumber min={1} value={quantite} onChange={(v) => setQuantite(Number(v ?? 0))} />
        </Champ>
        <Champ libelle="Motif">
          <Select value={motif} onChange={setMotif} options={MOTIFS.map((m) => ({ value: m, label: m }))} style={{ width: 220 }} />
        </Champ>
      </div>
      <Champ libelle={commentaireRequis ? 'Commentaire (obligatoire)' : 'Commentaire (facultatif)'}>
        <Input.TextArea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </Champ>
      {a && (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Stock physique">
            {a.stockPhysique} → {a.stockPhysique + variation}
          </Descriptions.Item>
          <Descriptions.Item label="Réservé (intouchable)">{a.stockReserve}</Descriptions.Item>
          <Descriptions.Item label="Disponible après">{disponible + variation}</Descriptions.Item>
          <Descriptions.Item label="Valeur de l'ajustement">
            {variation < 0 ? '− ' : '+ '}
            {formatEuro(valeur)}
          </Descriptions.Item>
          <Descriptions.Item label="Circuit">{aValider ? 'Validation par un valideur du module' : 'Application immédiate'}</Descriptions.Item>
        </Descriptions>
      )}
      <Text type={blocage ? 'warning' : 'success'}>{blocage ?? (aValider ? 'Sera soumis à validation.' : 'Application immédiate.')}</Text>
      <div>
        <Button type="primary" disabled={blocage !== null} loading={envoi} onClick={appliquer}>
          {aValider ? "Soumettre l'ajustement" : "Appliquer l'ajustement"}
        </Button>
      </div>
    </div>
  );
}

function Journal({ version }: { version: number }) {
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  useEffect(() => {
    api.get<{ mouvements: MouvementStock[] }>('/stock/mouvements').then((d) => setMouvements(d.mouvements));
  }, [version]);
  const colonnes: TableColumnsType<MouvementStock> = [
    { title: 'N°', dataIndex: 'numero', width: 90 },
    { title: 'Date', key: 'date', width: 110, render: (_, m) => new Date(m.createdAt).toLocaleDateString('fr-FR') },
    { title: 'Type', dataIndex: 'type', width: 130 },
    { title: 'Article', key: 'article', width: 220, render: (_, m) => `${m.reference} · ${m.libelle}` },
    {
      title: 'Qté',
      key: 'quantite',
      width: 80,
      align: 'right',
      render: (_, m) => <Text type={m.quantite > 0 ? 'success' : m.quantite < 0 ? 'danger' : undefined}>{m.quantite > 0 ? `+${m.quantite}` : m.quantite}</Text>,
    },
    { title: 'Détail', dataIndex: 'detail' },
    { title: 'Par', dataIndex: 'auteurNom', width: 140 },
    { title: 'Statut', key: 'statut', width: 110, render: (_, m) => <Tag color={couleurStatut(m.statut)}>{m.statut}</Tag> },
  ];
  return <Table rowKey="_id" size="small" columns={colonnes} dataSource={mouvements} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />;
}

/** Entrées de stock : réceptions de livraison, ajustements d'inventaire et journal des mouvements. */
export default function Entrees() {
  const [params, setParams] = useSearchParams();
  const [articles, setArticles] = useState<ArticleStock[]>([]);
  const [parametres, setParametres] = useState<ParametresStock | null>(null);
  const [version, setVersion] = useState(0);

  const charger = () => api.get<{ articles: ArticleStock[] }>('/stock/articles').then((d) => setArticles(d.articles));
  useEffect(() => {
    charger();
    api.get<{ parametres: ParametresStock }>('/stock/parametres').then((d) => setParametres(d.parametres));
  }, []);

  const apresAction = () => {
    charger();
    setVersion((v) => v + 1);
  };

  return (
    <Card title="Entrées & ajustements de stock">
      <Tabs
        activeKey={params.get('onglet') ?? 'reception'}
        onChange={(onglet) => setParams({ onglet })}
        items={[
          { key: 'reception', label: 'Réception de livraison', children: <Reception articles={articles} onFait={apresAction} /> },
          {
            key: 'ajustement',
            label: 'Ajustement',
            children: <Ajustement articles={articles} parametres={parametres} articleInitial={params.get('article')} onFait={apresAction} />,
          },
          { key: 'journal', label: 'Journal des mouvements', children: <Journal version={version} /> },
        ]}
      />
    </Card>
  );
}
