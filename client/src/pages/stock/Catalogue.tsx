import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Drawer, Grid, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { ImportCatalogue } from './ImportCatalogue';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ArticleStock, CategorieArticle, ParametresStock } from '../../types';
import { formatEuro } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

interface Fiche {
  libelle: string;
  famille: string;
  emplacement: string;
  fournisseur: string;
  delaiJours: number;
  seuil: number;
  actif: boolean;
  // Création uniquement.
  categorie: CategorieArticle;
  stockInitial: number;
  prix: number | null;
}

const FICHE_VIDE: Fiche = {
  libelle: '',
  famille: '',
  emplacement: '',
  fournisseur: '',
  delaiJours: 15,
  seuil: 20,
  actif: true,
  categorie: 'Goodies',
  stockInitial: 0,
  prix: null,
};

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

export default function Catalogue() {
  const { peut, estSuperAdmin } = useAuth();
  const [importOuvert, setImportOuvert] = useState(false);
  const navigate = useNavigate();
  const mobile = !Grid.useBreakpoint().md;
  const administrateur = peut('stock', 'administration');
  const voitProtocole = peut('stock', 'validation');
  const [articles, setArticles] = useState<ArticleStock[]>([]);
  const [parametres, setParametres] = useState<ParametresStock | null>(null);
  const [filtre, setFiltre] = useState<'Tous' | CategorieArticle>('Tous');
  const [recherche, setRecherche] = useState('');
  const [edition, setEdition] = useState<{ article: ArticleStock | null } | null>(null);
  const [fiche, setFiche] = useState<Fiche>(FICHE_VIDE);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => api.get<{ articles: ArticleStock[] }>('/stock/articles').then((d) => setArticles(d.articles));

  useEffect(() => {
    charger();
    api.get<{ parametres: ParametresStock }>('/stock/parametres').then((d) => setParametres(d.parametres));
  }, []);

  const ouvrir = (article: ArticleStock | null) => {
    setFiche(
      article
        ? { ...FICHE_VIDE, ...article, prix: article.pmp }
        : { ...FICHE_VIDE, emplacement: parametres?.emplacements[0] ?? '' }
    );
    setEdition({ article });
  };

  const changerCategorie = (categorie: CategorieArticle) =>
    setFiche({
      ...fiche,
      categorie,
      emplacement: categorie === 'Protocole' ? parametres?.emplacementProtocole ?? '' : parametres?.emplacements[0] ?? '',
    });

  // Contrôle de doublon : articles dont le libellé partage un mot significatif avec la saisie.
  const mots = fiche.libelle.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((m) => m.length >= 4);
  const doublons = edition && !edition.article && mots.length ? articles.filter((a) => mots.some((m) => a.libelle.toLowerCase().includes(m))) : [];
  const emplacementProtocoleKo = fiche.categorie === 'Protocole' && parametres && fiche.emplacement !== parametres.emplacementProtocole;
  const valide = fiche.libelle.trim() && fiche.famille.trim() && fiche.emplacement && !emplacementProtocoleKo;

  const enregistrer = async () => {
    if (!edition) return;
    setEnvoi(true);
    const { libelle, famille, emplacement, fournisseur, delaiJours, seuil, actif, categorie, stockInitial, prix } = fiche;
    const ok = await lancer(
      edition.article
        ? api.put(`/stock/articles/${edition.article._id}`, { libelle, famille, emplacement, fournisseur, delaiJours, seuil, actif })
        : api.post('/stock/articles', { libelle, famille, emplacement, fournisseur, delaiJours, seuil, categorie, stockInitial, prix })
    );
    setEnvoi(false);
    if (ok) {
      setEdition(null);
      charger();
    }
  };

  const q = recherche.trim().toLowerCase();
  const affiches = articles.filter(
    (a) => (filtre === 'Tous' || a.categorie === filtre) && (!q || `${a.reference} ${a.libelle} ${a.famille}`.toLowerCase().includes(q))
  );

  const colonnes: TableColumnsType<ArticleStock> = [
    { title: 'Réf.', dataIndex: 'reference', width: 80, render: (v: string) => <Text code>{v}</Text> },
    {
      title: 'Article',
      key: 'libelle',
      render: (_, a) => (
        <div>
          <Text strong type={a.actif ? undefined : 'secondary'}>
            {a.libelle}
          </Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {a.famille} · {a.categorie === 'Protocole' ? 'Cadeau protocolaire' : 'Goodies'}
          </div>
        </div>
      ),
    },
    { title: 'Physique', dataIndex: 'stockPhysique', width: 90, align: 'right' },
    { title: 'Réservé', dataIndex: 'stockReserve', width: 90, align: 'right' },
    {
      title: 'Disponible',
      key: 'disponible',
      width: 100,
      align: 'right',
      render: (_, a) => <Text strong>{a.stockPhysique - a.stockReserve}</Text>,
    },
    { title: 'Seuil', dataIndex: 'seuil', width: 70, align: 'right' },
    { title: 'PMP', key: 'pmp', width: 90, align: 'right', render: (_, a) => (a.aValoriser ? '—' : formatEuro(a.pmp)) },
    { title: 'Emplacement', dataIndex: 'emplacement', width: 140 },
    {
      title: 'État',
      key: 'etat',
      width: 120,
      render: (_, a) =>
        !a.actif ? (
          <Tag>Retiré</Tag>
        ) : a.aValoriser ? (
          <Tag color="blue">À valoriser</Tag>
        ) : a.stockPhysique - a.stockReserve <= a.seuil ? (
          <Tag color="orange">Sous le seuil</Tag>
        ) : (
          <Tag color="green">OK</Tag>
        ),
    },
    ...(administrateur
      ? [
          {
            title: '',
            key: 'actions',
            width: 170,
            render: (_: unknown, a: ArticleStock) => (
              <Space>
                <Button size="small" onClick={() => ouvrir(a)}>
                  Modifier
                </Button>
                <Button size="small" onClick={() => navigate(`/stock/entrees?onglet=ajustement&article=${a._id}`)}>
                  Ajuster
                </Button>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Catalogue & stock"
      extra={
        administrateur && (
          <Space wrap>
            <Button icon={<DownloadOutlined />} href="/api/stock/catalogue/export">
              Exporter CSV
            </Button>
            {estSuperAdmin && (
              <Button icon={<UploadOutlined />} onClick={() => setImportOuvert(true)}>
                Importer un CSV
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => ouvrir(null)}>
              Nouvel article
            </Button>
          </Space>
        )
      }
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {voitProtocole && (
          <Segmented
            value={filtre}
            onChange={(v) => setFiltre(v as typeof filtre)}
            options={[
              { value: 'Tous', label: 'Tous' },
              { value: 'Goodies', label: 'Goodies' },
              { value: 'Protocole', label: 'Protocole' },
            ]}
          />
        )}
        <Input.Search
          placeholder="Référence, article, famille"
          allowClear
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <Table rowKey="_id" size="small" columns={colonnes} dataSource={affiches} pagination={false} scroll={{ x: 'max-content' }} />

      {estSuperAdmin && <ImportCatalogue ouvert={importOuvert} onFerme={() => setImportOuvert(false)} onImporte={charger} />}

      <Drawer
        title={edition?.article ? `${edition.article.reference} · ${edition.article.libelle}` : 'Nouvel article'}
        open={edition !== null}
        onClose={() => setEdition(null)}
        width={mobile ? '100%' : 480}
        extra={
          <Space>
            <Button onClick={() => setEdition(null)}>Annuler</Button>
            <Button type="primary" loading={envoi} disabled={!valide} onClick={enregistrer}>
              Enregistrer
            </Button>
          </Space>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!edition?.article && (
            <Segmented
              block
              value={fiche.categorie}
              onChange={(v) => changerCategorie(v as CategorieArticle)}
              options={[
                { value: 'Goodies', label: 'Goodies' },
                { value: 'Protocole', label: 'Cadeau protocolaire' },
              ]}
            />
          )}
          <Champ libelle="Libellé">
            <Input value={fiche.libelle} onChange={(e) => setFiche({ ...fiche, libelle: e.target.value })} />
          </Champ>
          {doublons.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="Articles proches déjà au catalogue"
              description={doublons.map((d) => `${d.reference} · ${d.libelle}`).join(' ; ')}
            />
          )}
          <Champ libelle="Famille">
            <Input value={fiche.famille} onChange={(e) => setFiche({ ...fiche, famille: e.target.value })} placeholder="Textile, Papeterie, Objets…" />
          </Champ>
          <Champ libelle="Emplacement">
            <Select
              value={fiche.emplacement || undefined}
              onChange={(emplacement) => setFiche({ ...fiche, emplacement })}
              options={(parametres?.emplacements ?? []).map((e) => ({ value: e, label: e }))}
              style={{ width: '100%' }}
            />
          </Champ>
          {emplacementProtocoleKo && (
            <Alert type="error" showIcon message={`Un cadeau protocolaire se range en « ${parametres?.emplacementProtocole} ».`} />
          )}
          <Champ libelle="Fournisseur habituel">
            <Input value={fiche.fournisseur} onChange={(e) => setFiche({ ...fiche, fournisseur: e.target.value })} />
          </Champ>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Champ libelle="Seuil d'alerte">
              <InputNumber min={0} value={fiche.seuil} onChange={(v) => setFiche({ ...fiche, seuil: Number(v ?? 0) })} />
            </Champ>
            <Champ libelle="Délai de réappro. (jours)">
              <InputNumber min={0} value={fiche.delaiJours} onChange={(v) => setFiche({ ...fiche, delaiJours: Number(v ?? 0) })} />
            </Champ>
          </div>
          {edition?.article ? (
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Switch checked={fiche.actif} onChange={(actif) => setFiche({ ...fiche, actif })} />
              <span>Article actif (un article retiré n'est plus demandable)</span>
            </label>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Champ libelle="Stock initial">
                  <InputNumber min={0} value={fiche.stockInitial} onChange={(v) => setFiche({ ...fiche, stockInitial: Number(v ?? 0) })} />
                </Champ>
                <Champ libelle="Prix unitaire (€)">
                  <InputNumber
                    min={0}
                    step={0.01}
                    value={fiche.prix}
                    onChange={(v) => setFiche({ ...fiche, prix: v === null ? null : Number(v) })}
                    placeholder="Inconnu"
                  />
                </Champ>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sans prix, l'article est « à valoriser » : son prix moyen sera fixé à la première réception.
                {fiche.prix !== null && ` Valeur initiale : ${formatEuro(fiche.stockInitial * fiche.prix)}.`}
              </Text>
            </>
          )}
        </div>
      </Drawer>
    </Card>
  );
}
