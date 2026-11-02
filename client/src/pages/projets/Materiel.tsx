import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Collapse, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ArticleMateriel, UsageMateriel } from '../../types';
import { lancer } from '../../lib/actionStock';
import { USAGES_MATERIEL, useReferentiels } from '../../lib/projets';

const { Text } = Typography;

const USAGES = Object.entries(USAGES_MATERIEL).map(([value, u]) => ({ value: value as UsageMateriel, label: u.libelle }));

/**
 * Matériel logistique prêté aux projets, classé par thème : stock du parc et pic d'utilisation sur les
 * projets à venir. Les articles proposés au catalogue restent inactifs tant que le stock n'est pas renseigné.
 */
export default function Materiel() {
  const { peut } = useAuth();
  const ref = useReferentiels();
  const administrateur = peut('projets', 'administration');
  const [articles, setArticles] = useState<ArticleMateriel[]>([]);
  const [etat, setEtat] = useState<'actifs' | 'proposes' | 'tous'>('tous');
  const [usage, setUsage] = useState<UsageMateriel | 'tous'>('tous');
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState({ nom: '', unite: 'u.', total: 0, theme: 'Divers', usage: 'mixte' as UsageMateriel });

  const charger = () => api.get<{ articles: ArticleMateriel[] }>('/projets/materiel').then((d) => setArticles(d.articles));
  useEffect(() => {
    charger();
  }, []);

  const modifier = async (a: ArticleMateriel, champs: Partial<ArticleMateriel>) => {
    const suivant = { ...a, ...champs };
    // Un article proposé dont on renseigne le stock du parc devient réservable.
    if (champs.total && champs.total > 0 && !a.actif && a.total === 0) suivant.actif = true;
    const { nom, unite, total, actif, theme, usage: u } = suivant;
    if (await lancer(api.put(`/projets/materiel/${a._id}`, { nom, unite, total, actif, theme, usage: u }))) charger();
  };

  const themes = useMemo(() => {
    const ordre = ref?.themesMateriel ?? [];
    const presents = [...new Set(articles.map((a) => a.theme))];
    return [...ordre.filter((t) => presents.includes(t)), ...presents.filter((t) => !ordre.includes(t)).sort()];
  }, [articles, ref]);
  const optionsThemes = [...new Set([...(ref?.themesMateriel ?? []), ...themes])].map((t) => ({ value: t, label: t }));

  const q = recherche.trim().toLowerCase();
  const filtres = articles.filter(
    (a) =>
      (etat === 'tous' || (etat === 'actifs' ? a.actif : !a.actif)) &&
      (usage === 'tous' || a.usage === usage || a.usage === 'mixte') &&
      (!q || a.nom.toLowerCase().includes(q))
  );

  const tableau = (lignes: ArticleMateriel[]) => (
    <Table
      rowKey="_id"
      size="small"
      pagination={false}
      dataSource={lignes}
      scroll={{ x: 'max-content' }}
      columns={[
        {
          title: 'Article',
          key: 'nom',
          render: (_, a) => (
            <Space size={6}>
              {administrateur ? (
                <Input defaultValue={a.nom} onBlur={(e) => e.target.value.trim() && e.target.value !== a.nom && modifier(a, { nom: e.target.value })} aria-label="Article" style={{ width: 320 }} />
              ) : (
                <Text strong>{a.nom}</Text>
              )}
              {a.code && (
                <Text code title="Alimente le plan d'implantation">
                  {a.code}
                </Text>
              )}
            </Space>
          ),
        },
        {
          title: 'Usage',
          key: 'us',
          width: 190,
          render: (_, a) =>
            administrateur ? (
              <Select size="small" value={a.usage} options={USAGES} onChange={(v) => modifier(a, { usage: v })} style={{ width: 180 }} />
            ) : (
              USAGES_MATERIEL[a.usage].libelle
            ),
        },
        {
          title: 'Thème',
          key: 'th',
          width: 240,
          render: (_, a) =>
            administrateur ? <Select size="small" value={a.theme} options={optionsThemes} onChange={(v) => modifier(a, { theme: v })} style={{ width: 230 }} showSearch /> : a.theme,
        },
        {
          title: 'Unité',
          key: 'u',
          width: 90,
          render: (_, a) =>
            administrateur ? <Input size="small" defaultValue={a.unite} onBlur={(e) => e.target.value.trim() && e.target.value !== a.unite && modifier(a, { unite: e.target.value })} aria-label="Unité" /> : a.unite,
        },
        {
          title: 'Stock du parc',
          key: 't',
          width: 120,
          align: 'right',
          render: (_, a) =>
            administrateur ? (
              <InputNumber size="small" min={0} defaultValue={a.total} onBlur={(e) => Number(e.target.value) !== a.total && modifier(a, { total: Number(e.target.value) || 0 })} aria-label="Stock total" />
            ) : (
              a.total
            ),
        },
        { title: 'Pic à venir', key: 'p', width: 100, align: 'right', render: (_, a) => (a.pic > a.total ? <Tag color="red">{a.pic}</Tag> : a.pic) },
        {
          title: 'Réservable',
          key: 'a',
          width: 110,
          render: (_, a) => (
            <Space size={4}>
              <Switch size="small" checked={a.actif} disabled={!administrateur} onChange={(actif) => modifier(a, { actif })} aria-label={`Actif : ${a.nom}`} />
              {!a.actif && a.total === 0 && <Tag style={{ fontSize: 11 }}>proposé</Tag>}
            </Space>
          ),
        },
      ]}
    />
  );

  return (
    <Card
      title="Matériel logistique"
      extra={
        <Space wrap>
          <Input.Search allowClear placeholder="Rechercher un article" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ width: 220 }} />
          <Segmented
            value={usage}
            onChange={(v) => setUsage(v as typeof usage)}
            options={[
              { value: 'tous', label: 'Tout usage' },
              { value: 'interieur', label: 'Intérieur' },
              { value: 'exterieur', label: 'Extérieur' },
            ]}
          />
          <Segmented
            value={etat}
            onChange={(v) => setEtat(v as typeof etat)}
            options={[
              { value: 'tous', label: 'Tous' },
              { value: 'actifs', label: 'Réservables' },
              { value: 'proposes', label: 'Proposés' },
            ]}
          />
        </Space>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {articles.filter((a) => a.actif).length} articles réservables sur {articles.length}, classés en {themes.length} thèmes. Les articles
        « proposés » attendent leur stock : en saisir un le rend réservable. Une réservation bloque le matériel du jour J − 1 au
        lendemain de la fin. Le pic indique la plus forte mobilisation simultanée sur les projets à venir.
      </Text>
      <Collapse
        defaultActiveKey={themes.filter((t) => filtres.some((a) => a.theme === t && a.actif))}
        items={themes
          .map((t) => ({ t, lignes: filtres.filter((a) => a.theme === t) }))
          .filter((g) => g.lignes.length)
          .map(({ t, lignes }) => ({
            key: t,
            label: (
              <Space>
                <Text strong>{t}</Text>
                <Text type="secondary">
                  {lignes.filter((a) => a.actif).length} réservable(s) / {lignes.length}
                </Text>
              </Space>
            ),
            children: tableau(lignes),
          }))}
      />
      {administrateur && (
        <Space style={{ marginTop: 12 }} wrap>
          <Input placeholder="Nouvel article" value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} style={{ width: 240 }} />
          <Select value={nouveau.theme} options={optionsThemes} onChange={(theme) => setNouveau({ ...nouveau, theme })} style={{ width: 230 }} showSearch aria-label="Thème" />
          <Select value={nouveau.usage} options={USAGES} onChange={(u) => setNouveau({ ...nouveau, usage: u })} style={{ width: 180 }} aria-label="Usage" />
          <Input placeholder="Unité" value={nouveau.unite} onChange={(e) => setNouveau({ ...nouveau, unite: e.target.value })} style={{ width: 80 }} />
          <InputNumber min={0} value={nouveau.total} onChange={(v) => setNouveau({ ...nouveau, total: Number(v ?? 0) })} aria-label="Stock" addonAfter="en stock" />
          <Button
            disabled={!nouveau.nom.trim()}
            onClick={async () => {
              if (await lancer(api.post('/projets/materiel', { ...nouveau, actif: nouveau.total > 0 }))) {
                setNouveau({ ...nouveau, nom: '', total: 0 });
                charger();
              }
            }}
          >
            Ajouter
          </Button>
        </Space>
      )}
    </Card>
  );
}
