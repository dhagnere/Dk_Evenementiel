import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, InputNumber, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { oublierReferentiels } from '../../lib/projets';
import { lancer } from '../../lib/actionStock';
import type { ReferentielRetroplanning, TacheType } from '../../types';

const { Text, Paragraph } = Typography;

type R = ReferentielRetroplanning;

/**
 * Référentiel du rétroplanning : un squelette de jalons, réglé par le niveau (jauge et majorations),
 * les jalons actifs et leur valideur à chaque niveau, et les modules qui ajoutent leurs tâches types.
 * Il s'applique aux nouveaux projets, et à un projet existant dès que sa jauge ou ses caractéristiques changent.
 */
export default function Referentiel() {
  const [r, setR] = useState<R | null>(null);
  const [defaut, setDefaut] = useState<R | null>(null);
  const [modifie, setModifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [filtreModule, setFiltreModule] = useState<string | null>(null);

  const charger = () =>
    api.get<{ referentiel: R; defaut: R }>('/projets/referentiel').then((d) => {
      setR(d.referentiel);
      setDefaut(d.defaut);
      setModifie(false);
    });
  useEffect(() => {
    charger();
  }, []);

  if (!r) return null;

  const changer = (suivant: R) => {
    setR(suivant);
    setModifie(true);
  };
  const optionsRoles = r.roles.map((x) => ({ value: x.code, label: x.libelle }));
  const optionsModules = r.modules.map((m) => ({ value: m.code, label: m.libelle }));
  const optionsJalons = r.jalons.map((j) => ({ value: j.code, label: `${j.code} ${j.libelle}` }));

  const enregistrer = async () => {
    setEnvoi(true);
    if (await lancer(api.put('/projets/referentiel', r))) {
      oublierReferentiels();
      setModifie(false);
    }
    setEnvoi(false);
  };

  const exporter = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'referentiel-retroplanning.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // --- Niveaux et jalons ---
  const majJalon = (i: number, champs: Partial<R['jalons'][number]>) => changer({ ...r, jalons: r.jalons.map((j, k) => (k === i ? { ...j, ...champs } : j)) });
  const basculerJalon = (niveau: number, code: string, actif: boolean) =>
    changer({
      ...r,
      niveaux: r.niveaux.map((n) =>
        n.niveau !== niveau
          ? n
          : {
              ...n,
              jalons: actif
                ? [...n.jalons, { code, valideur: 'pilote' }].sort(
                    (a, b) => r.jalons.findIndex((j) => j.code === a.code) - r.jalons.findIndex((j) => j.code === b.code)
                  )
                : n.jalons.filter((j) => j.code !== code),
            }
      ),
    });
  const changerValideur = (niveau: number, code: string, valideur: string) =>
    changer({ ...r, niveaux: r.niveaux.map((n) => (n.niveau !== niveau ? n : { ...n, jalons: n.jalons.map((j) => (j.code === code ? { ...j, valideur } : j)) })) });

  const ongletNiveaux = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small" title="Niveau de base selon la jauge">
        <Space wrap>
          {(['N2 à partir de', 'N3 à partir de', 'N4 à partir de'] as const).map((libelle, i) => (
            <Space key={libelle}>
              <Text>{libelle}</Text>
              <InputNumber
                min={0}
                value={r.seuilsJauge[i]}
                onChange={(v) => {
                  const seuils = [...r.seuilsJauge] as R['seuilsJauge'];
                  seuils[i] = Number(v ?? 0);
                  changer({ ...r, seuilsJauge: seuils });
                }}
                addonAfter="pers."
                style={{ width: 150 }}
              />
            </Space>
          ))}
        </Space>
        <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Chaque majoration cochée (onglet Critères) relève le niveau d'un cran, avec N4 comme plafond. Seuils à caler avec le référent
          sécurité et la préfecture : ce sont eux qui fixent les seuils réglementaires.
        </Paragraph>
      </Card>
      <Card size="small" title="Niveaux">
        <Table
          rowKey="niveau"
          size="small"
          pagination={false}
          dataSource={r.niveaux}
          columns={[
            { title: 'Niveau', key: 'n', width: 70, render: (_, n) => <Tag>N{n.niveau}</Tag> },
            {
              title: 'Libellé',
              key: 'l',
              render: (_, n) => (
                <Input value={n.libelle} onChange={(e) => changer({ ...r, niveaux: r.niveaux.map((x) => (x.niveau === n.niveau ? { ...x, libelle: e.target.value } : x)) })} />
              ),
            },
            {
              title: 'Exemples',
              key: 'e',
              render: (_, n) => (
                <Input value={n.exemples} onChange={(e) => changer({ ...r, niveaux: r.niveaux.map((x) => (x.niveau === n.niveau ? { ...x, exemples: e.target.value } : x)) })} />
              ),
            },
            { title: 'Rendez-vous', key: 'j', width: 110, align: 'right', render: (_, n) => n.jalons.length },
          ]}
        />
      </Card>
      <Card size="small" title="Jalons : question de passage, actifs par niveau et valideur">
        <Table
          rowKey="code"
          size="small"
          pagination={false}
          dataSource={r.jalons.map((j, i) => ({ ...j, i }))}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Jalon', key: 'c', width: 80, render: (_, j) => <Text code>{j.code}</Text> },
            { title: 'Libellé', key: 'l', width: 130, render: (_, j) => <Input value={j.libelle} onChange={(e) => majJalon(j.i, { libelle: e.target.value })} /> },
            {
              title: 'Question de passage et livrable',
              key: 'q',
              width: 320,
              render: (_, j) => (
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Input value={j.question} onChange={(e) => majJalon(j.i, { question: e.target.value })} />
                  <Input value={j.livrable} prefix={<Text type="secondary">Livrable</Text>} onChange={(e) => majJalon(j.i, { livrable: e.target.value })} />
                </Space>
              ),
            },
            ...r.niveaux.map((n) => ({
              title: `N${n.niveau}`,
              key: `n${n.niveau}`,
              width: 170,
              render: (_: unknown, j: R['jalons'][number]) => {
                const actif = n.jalons.find((x) => x.code === j.code);
                const dernier = j.code === r.jalons[r.jalons.length - 1].code;
                return (
                  <Space direction="vertical" size={2}>
                    <Checkbox checked={!!actif} disabled={dernier} onChange={(e) => basculerJalon(n.niveau, j.code, e.target.checked)}>
                      actif
                    </Checkbox>
                    {actif && <Select size="small" value={actif.valideur} options={optionsRoles} onChange={(v) => changerValideur(n.niveau, j.code, v)} style={{ width: 160 }} />}
                  </Space>
                );
              },
            })),
          ]}
        />
        <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Les tâches d'un jalon inactif sont rattachées au jalon actif suivant. Le dernier jalon reste actif à tous les niveaux.
        </Paragraph>
      </Card>
    </div>
  );

  // --- Critères ---
  const majCritere = (i: number, champs: Partial<R['criteres'][number]>) => changer({ ...r, criteres: r.criteres.map((c, k) => (k === i ? { ...c, ...champs } : c)) });
  const ongletCriteres = (
    <Card size="small">
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Questions posées à la saisie d'une demande ou d'un projet. Chaque critère coché active des modules et, s'il s'agit d'une
        majoration, relève le niveau d'un cran.
      </Paragraph>
      <Table
        rowKey={(c) => c.code}
        size="small"
        pagination={false}
        dataSource={r.criteres.map((c, i) => ({ ...c, i }))}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Code', key: 'c', width: 170, render: (_, c) => <Input value={c.code} onChange={(e) => majCritere(c.i, { code: e.target.value.trim() })} /> },
          { title: 'Libellé', key: 'l', width: 320, render: (_, c) => <Input value={c.libelle} onChange={(e) => majCritere(c.i, { libelle: e.target.value })} /> },
          { title: 'Modules activés', key: 'm', width: 260, render: (_, c) => <Select mode="multiple" value={c.modules} options={optionsModules} onChange={(modules) => majCritere(c.i, { modules })} style={{ width: '100%' }} /> },
          { title: '+1 niveau', key: 'j', width: 90, render: (_, c) => <Checkbox checked={c.majoration} onChange={(e) => majCritere(c.i, { majoration: e.target.checked })} /> },
          { title: 'N4 direct', key: 'x', width: 90, render: (_, c) => <Checkbox checked={c.niveauMax} onChange={(e) => majCritere(c.i, { niveauMax: e.target.checked })} /> },
          {
            title: '',
            key: 's',
            width: 50,
            render: (_, c) => <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => changer({ ...r, criteres: r.criteres.filter((_, k) => k !== c.i) })} />,
          },
        ]}
      />
      <Button
        icon={<PlusOutlined />}
        style={{ marginTop: 12 }}
        onClick={() => changer({ ...r, criteres: [...r.criteres, { code: `critere_${r.criteres.length + 1}`, libelle: 'Nouveau critère', modules: [], majoration: false, niveauMax: false }] })}
      >
        Ajouter un critère
      </Button>
    </Card>
  );

  // --- Modules ---
  const majModule = (i: number, champs: Partial<R['modules'][number]>) => changer({ ...r, modules: r.modules.map((m, k) => (k === i ? { ...m, ...champs } : m)) });
  const ongletModules = (
    <Card size="small">
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Date de non-retour : dernière date à laquelle on peut lancer le module sans le sacrifier. Laissée vide, elle vaut le plus long
        délai incompressible des tâches bloquantes du module.
      </Paragraph>
      <Table
        rowKey={(m) => m.code}
        size="small"
        pagination={false}
        dataSource={r.modules.map((m, i) => ({ ...m, i }))}
        columns={[
          {
            title: 'Code',
            key: 'c',
            width: 170,
            render: (_, m) => (m.code === 'socle' ? <Text code>socle</Text> : <Input value={m.code} onChange={(e) => majModule(m.i, { code: e.target.value.trim() })} />),
          },
          { title: 'Libellé', key: 'l', render: (_, m) => <Input value={m.libelle} onChange={(e) => majModule(m.i, { libelle: e.target.value })} /> },
          { title: 'Activé quand', key: 'a', render: (_, m) => <Input value={m.activation} onChange={(e) => majModule(m.i, { activation: e.target.value })} /> },
          {
            title: 'Non-retour (jours avant J)',
            key: 'n',
            width: 190,
            render: (_, m) => (
              <InputNumber min={0} value={m.nonRetourJours} placeholder="calculé" onChange={(v) => majModule(m.i, { nonRetourJours: v === null ? null : Number(v) })} />
            ),
          },
          { title: 'Tâches', key: 't', width: 80, align: 'right', render: (_, m) => r.taches.filter((t) => t.module === m.code).length },
          {
            title: '',
            key: 's',
            width: 50,
            render: (_, m) =>
              m.code !== 'socle' && <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => changer({ ...r, modules: r.modules.filter((_, k) => k !== m.i) })} />,
          },
        ]}
      />
      <Button
        icon={<PlusOutlined />}
        style={{ marginTop: 12 }}
        onClick={() => changer({ ...r, modules: [...r.modules, { code: `module_${r.modules.length + 1}`, libelle: 'Nouveau module', activation: '', nonRetourJours: null }] })}
      >
        Ajouter un module
      </Button>
    </Card>
  );

  // --- Tâches types ---
  const majTache = (i: number, champs: Partial<TacheType>) => changer({ ...r, taches: r.taches.map((t, k) => (k === i ? { ...t, ...champs } : t)) });
  const taches = r.taches.map((t, i) => ({ ...t, i })).filter((t) => !filtreModule || t.module === filtreModule);
  const ongletTaches = (
    <Card
      size="small"
      extra={
        <Select allowClear placeholder="Tous les modules" value={filtreModule ?? undefined} onChange={(v) => setFiltreModule(v ?? null)} options={optionsModules} style={{ width: 220 }} />
      }
      title={`${taches.length} tâche(s) type`}
    >
      <Table
        rowKey={(t) => `${t.i}`}
        size="small"
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        dataSource={taches}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Code', key: 'c', width: 90, fixed: 'left', render: (_, t) => <Input size="small" value={t.code} onChange={(e) => majTache(t.i, { code: e.target.value.trim() })} /> },
          { title: 'Libellé', key: 'l', width: 300, render: (_, t) => <Input size="small" value={t.libelle} onChange={(e) => majTache(t.i, { libelle: e.target.value })} /> },
          { title: 'Module', key: 'm', width: 160, render: (_, t) => <Select size="small" value={t.module} options={optionsModules} onChange={(module) => majTache(t.i, { module })} style={{ width: 150 }} /> },
          { title: 'Jalon', key: 'j', width: 150, render: (_, t) => <Select size="small" value={t.jalon} options={optionsJalons} onChange={(jalon) => majTache(t.i, { jalon })} style={{ width: 140 }} /> },
          { title: 'Jours / J', key: 'o', width: 90, render: (_, t) => <InputNumber size="small" value={t.offset} onChange={(v) => majTache(t.i, { offset: Number(v ?? 0) })} style={{ width: 80 }} /> },
          {
            title: 'Dès',
            key: 'n',
            width: 80,
            render: (_, t) => <Select size="small" value={t.niveauMin} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `N${n}` }))} onChange={(niveauMin) => majTache(t.i, { niveauMin })} />,
          },
          { title: 'P', key: 'p', width: 170, render: (_, t) => <Select size="small" value={t.porte} options={optionsRoles} onChange={(porte) => majTache(t.i, { porte })} style={{ width: 160 }} /> },
          { title: 'F', key: 'f', width: 170, render: (_, t) => <Select size="small" allowClear value={t.fait || undefined} options={optionsRoles} onChange={(v) => majTache(t.i, { fait: v ?? '' })} style={{ width: 160 }} /> },
          { title: 'V', key: 'v', width: 170, render: (_, t) => <Select size="small" allowClear value={t.valide || undefined} options={optionsRoles} onChange={(v) => majTache(t.i, { valide: v ?? '' })} style={{ width: 160 }} /> },
          { title: 'I', key: 'i', width: 220, render: (_, t) => <Select size="small" mode="multiple" value={t.informe} options={optionsRoles} onChange={(informe) => majTache(t.i, { informe })} style={{ width: 210 }} /> },
          { title: 'Livrable', key: 'lv', width: 200, render: (_, t) => <Input size="small" value={t.livrable} onChange={(e) => majTache(t.i, { livrable: e.target.value })} /> },
          { title: 'Bloquante', key: 'b', width: 90, render: (_, t) => <Checkbox checked={t.bloquante} onChange={(e) => majTache(t.i, { bloquante: e.target.checked })} /> },
          {
            title: 'Incompressible',
            key: 'ic',
            width: 120,
            render: (_, t) => (
              <InputNumber size="small" min={0} value={t.incompressibleJours} addonAfter="j" onChange={(v) => majTache(t.i, { incompressibleJours: v === null ? null : Number(v) })} style={{ width: 100 }} />
            ),
          },
          {
            title: '',
            key: 's',
            width: 50,
            render: (_, t) => <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => changer({ ...r, taches: r.taches.filter((_, k) => k !== t.i) })} />,
          },
        ]}
      />
      <Button
        icon={<PlusOutlined />}
        style={{ marginTop: 12 }}
        onClick={() =>
          changer({
            ...r,
            taches: [
              ...r.taches,
              {
                code: `T-${String(r.taches.length + 1).padStart(3, '0')}`,
                libelle: 'Nouvelle tâche',
                module: filtreModule ?? 'socle',
                jalon: r.jalons[0].code,
                offset: r.jalons[0].offset,
                niveauMin: 1,
                porte: 'pilote',
                fait: '',
                valide: '',
                informe: [],
                livrable: '',
                bloquante: false,
                incompressibleJours: null,
              },
            ],
          })
        }
      >
        Ajouter une tâche type
      </Button>
    </Card>
  );

  // --- Rôles et budget ---
  const majRole = (i: number, champs: Partial<R['roles'][number]>) => changer({ ...r, roles: r.roles.map((x, k) => (k === i ? { ...x, ...champs } : x)) });
  const ongletRoles = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small" title="Rôles">
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          « Distinct à partir de » : en dessous de ce niveau, le pilote tient le rôle (par exemple le régisseur jour J en N1 et N2).
        </Paragraph>
        <Table
          rowKey={(x) => x.code}
          size="small"
          pagination={false}
          dataSource={r.roles.map((x, i) => ({ ...x, i }))}
          columns={[
            { title: 'Code', key: 'c', width: 160, render: (_, x) => (x.code === 'pilote' ? <Text code>pilote</Text> : <Input value={x.code} onChange={(e) => majRole(x.i, { code: e.target.value.trim() })} />) },
            { title: 'Libellé', key: 'l', width: 220, render: (_, x) => <Input value={x.libelle} onChange={(e) => majRole(x.i, { libelle: e.target.value })} /> },
            { title: 'Mission', key: 'm', render: (_, x) => <Input value={x.mission} onChange={(e) => majRole(x.i, { mission: e.target.value })} /> },
            {
              title: 'Distinct à partir de',
              key: 'n',
              width: 150,
              render: (_, x) => <Select value={x.niveauMin} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `N${n}` }))} onChange={(niveauMin) => majRole(x.i, { niveauMin })} />,
            },
            {
              title: '',
              key: 's',
              width: 50,
              render: (_, x) => x.code !== 'pilote' && <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => changer({ ...r, roles: r.roles.filter((_, k) => k !== x.i) })} />,
            },
          ]}
        />
        <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => changer({ ...r, roles: [...r.roles, { code: `role_${r.roles.length + 1}`, libelle: 'Nouveau rôle', mission: '', niveauMin: 1 }] })}>
          Ajouter un rôle
        </Button>
      </Card>
      <Card size="small" title="Postes budgétaires">
        <Select mode="tags" value={r.budgetPostes} onChange={(budgetPostes) => changer({ ...r, budgetPostes })} style={{ width: '100%' }} />
      </Card>
    </div>
  );

  return (
    <Card
      title="Référentiel du rétroplanning"
      extra={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={exporter}>
            Exporter (JSON)
          </Button>
          <Upload
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={async (fichier) => {
              try {
                changer(JSON.parse(await fichier.text()) as R);
                message.info('Fichier chargé : vérifiez puis enregistrez.');
              } catch {
                message.error('Fichier JSON illisible');
              }
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>Importer (JSON)</Button>
          </Upload>
          {defaut && (
            <Popconfirm title="Revenir aux valeurs par défaut ?" description="Rien n'est enregistré tant que vous ne cliquez pas sur Enregistrer." onConfirm={() => changer(defaut)} okText="Revenir" cancelText="Annuler">
              <Button>Valeurs par défaut</Button>
            </Popconfirm>
          )}
          {modifie && <Button onClick={charger}>Annuler les modifications</Button>}
          <Button type="primary" disabled={!modifie} loading={envoi} onClick={enregistrer}>
            Enregistrer
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Un seul squelette, trois curseurs : le niveau (jauge et majorations), les jalons actifs et leur valideur, les modules."
        description="Le référentiel s'applique aux nouveaux projets, et à un projet existant dès que sa jauge ou ses caractéristiques changent. Les tâches faites et les tâches ajoutées à la main ne sont jamais retirées."
      />
      <Tabs
        items={[
          { key: 'niveaux', label: 'Niveaux et jalons', children: ongletNiveaux },
          { key: 'criteres', label: `Critères (${r.criteres.length})`, children: ongletCriteres },
          { key: 'modules', label: `Modules (${r.modules.length})`, children: ongletModules },
          { key: 'taches', label: `Tâches types (${r.taches.length})`, children: ongletTaches },
          { key: 'roles', label: 'Rôles et budget', children: ongletRoles },
        ]}
      />
    </Card>
  );
}
