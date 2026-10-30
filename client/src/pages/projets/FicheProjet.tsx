import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ArticleMateriel, FicheProjetComplete, ReferentielsProjets, StatutProjet } from '../../types';
import {
  STATUTS_DEMARCHE,
  STATUTS_PROJET,
  aujourdhui,
  codeEcheance,
  decaler,
  ecart,
  formatCourt,
  formatLong,
  jalonDe,
  useReferentiels,
} from '../../lib/projets';
import { lancer } from '../../lib/actionStock';
import { PlanImplantation } from './PlanImplantation';
import { SelecteurEvenement } from '../../components/SelecteurEvenement';
import { couleurStatut, formatEuro, formatJour } from '../../lib/formatStock';

const { Text, Title } = Typography;

/** Champ texte enregistré à la sortie du champ, pour ne pas écrire à chaque frappe. */
function TexteEnregistre({
  valeur,
  onEnregistre,
  multiligne,
  ...reste
}: { valeur: string; onEnregistre: (v: string) => void; multiligne?: boolean } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'>) {
  const [local, setLocal] = useState(valeur);
  useEffect(() => setLocal(valeur), [valeur]);
  const sortir = () => local !== valeur && onEnregistre(local);
  return multiligne ? (
    <Input.TextArea value={local} onChange={(e) => setLocal(e.target.value)} onBlur={sortir} autoSize={{ minRows: 3 }} disabled={reste.disabled} aria-label={reste['aria-label']} />
  ) : (
    <Input {...reste} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={sortir} onPressEnter={sortir} />
  );
}

function NombreEnregistre({ valeur, onEnregistre, ...reste }: { valeur: number | null; onEnregistre: (v: number | null) => void } & Omit<React.ComponentProps<typeof InputNumber>, 'value' | 'onChange' | 'onBlur'>) {
  const [local, setLocal] = useState<number | null>(valeur);
  useEffect(() => setLocal(valeur), [valeur]);
  const sortir = () => local !== valeur && onEnregistre(local);
  return <InputNumber {...reste} value={local} onChange={(v) => setLocal(v === null ? null : Number(v))} onBlur={sortir} onPressEnter={sortir} />;
}

function Champ({ libelle, children, large }: { libelle: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label style={{ display: 'block', gridColumn: large ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

const grille: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 };

interface Ops {
  fiche: FicheProjetComplete;
  referentiels: ReferentielsProjets;
  recharger: () => Promise<void>;
  majProjet: (champs: Record<string, unknown>) => Promise<void>;
  ligne: (chemin: string, ligneId: string | null, donnees?: Record<string, unknown>) => Promise<void>;
  peut: (niveau: 'contribution' | 'validation' | 'administration') => boolean;
}

// --- Rétroplanning --------------------------------------------------------------------------------

function Retroplanning({ fiche, referentiels: ref, ligne, peut }: Ops) {
  const jour = aujourdhui();
  const { projet, taches } = fiche;
  const modifiable = peut('contribution');
  const [nouvelle, setNouvelle] = useState({ libelle: '', decalage: -30, branche: ref.branches[0] ?? '' });
  const responsables = [...ref.branches, ...fiche.prestataires.map((p) => `Prestataire · ${p.nom}`)];
  const position = ecart(jour, projet.dateJour);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ref.jalons.length}, minmax(76px, 1fr))`, minWidth: 700, position: 'relative' }}>
            {ref.jalons.map((j) => {
              const lot = taches.filter((t) => jalonDe(ref.jalons, t.decalage).c === j.c);
              const faites = lot.filter((t) => t.fait).length;
              const retard = lot.some((t) => !t.fait && decaler(projet.dateJour, t.decalage) < jour);
              const couleur = lot.length && faites === lot.length ? '#2c7a4b' : retard ? '#be3327' : faites ? '#e3a914' : '#ffffff';
              const actuel = position >= j.o && position < (ref.jalons[ref.jalons.indexOf(j) + 1]?.o ?? Infinity);
              return (
                <a
                  key={j.c}
                  href={`#jalon-${j.c}`}
                  title={`${j.l} — ${j.s}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', color: 'inherit' }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: j.reunion ? 5 : '50%',
                      border: `3px solid ${couleur === '#ffffff' ? '#7a8898' : couleur}`,
                      background: couleur,
                      outline: actuel ? '3px solid #1c5da8' : undefined,
                      outlineOffset: 2,
                    }}
                  />
                  <Text strong style={{ fontFamily: 'monospace' }}>
                    {j.c}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatCourt(decaler(projet.dateJour, j.o))}
                  </Text>
                  <Text style={{ fontSize: 12 }}>{lot.length ? `${faites}/${lot.length}` : '—'}</Text>
                </a>
              );
            })}
          </div>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Vert : jalon soldé · orange : en cours · rouge : tâche en retard · carré : réunion jalon · contour bleu : position
          d'aujourd'hui ({codeEcheance(position)}).
        </Text>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        {ref.jalons.map((j) => {
          const lot = taches.filter((t) => jalonDe(ref.jalons, t.decalage).c === j.c).sort((a, b) => a.decalage - b.decalage);
          return (
            <div key={j.c} id={`jalon-${j.c}`} style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
                <Tag>{j.c}</Tag>
                <Text strong>{j.l}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {j.s} · {formatLong(decaler(projet.dateJour, j.o))}
                </Text>
              </div>
              {lot.length === 0 && <Text type="secondary">Aucune tâche sur ce jalon.</Text>}
              {lot.map((t) => {
                const echeance = decaler(projet.dateJour, t.decalage);
                const retard = !t.fait && echeance < jour;
                return (
                  <div key={t._id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', flexWrap: 'wrap' }}>
                    <Checkbox
                      checked={t.fait}
                      disabled={!modifiable}
                      onChange={(e) => ligne('taches', t._id, { fait: e.target.checked })}
                      aria-label={`Tâche faite : ${t.libelle}`}
                    />
                    <Text delete={t.fait} type={t.fait ? 'secondary' : undefined} style={{ flex: '1 1 260px' }}>
                      {t.libelle}
                      {t.fait && t.faitPar && <Text type="secondary" style={{ fontSize: 12 }}> — {t.faitPar}</Text>}
                    </Text>
                    <Text type={retard ? 'danger' : 'secondary'} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {codeEcheance(t.decalage)} · {formatCourt(echeance)}
                    </Text>
                    <Select
                      size="small"
                      value={t.branche}
                      disabled={!modifiable}
                      onChange={(branche) => ligne('taches', t._id, { branche })}
                      options={[...new Set([...responsables, t.branche])].map((b) => ({ value: b, label: b }))}
                      style={{ width: 190 }}
                      aria-label="Responsable"
                    />
                    {modifiable && (
                      <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Supprimer la tâche" onClick={() => ligne('taches', t._id)} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {modifiable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 16, borderTop: '1px solid #f0f0f0' }}>
            <Input
              placeholder="Ajouter une tâche spécifique"
              value={nouvelle.libelle}
              onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })}
              style={{ flex: '1 1 260px' }}
            />
            <InputNumber value={nouvelle.decalage} onChange={(v) => setNouvelle({ ...nouvelle, decalage: Number(v ?? 0) })} addonAfter="jours / J" style={{ width: 160 }} />
            <Select value={nouvelle.branche} onChange={(branche) => setNouvelle({ ...nouvelle, branche })} options={responsables.map((b) => ({ value: b, label: b }))} style={{ width: 190 }} />
            <Button
              disabled={!nouvelle.libelle.trim()}
              onClick={async () => {
                await ligne('taches', null, nouvelle);
                setNouvelle({ ...nouvelle, libelle: '' });
              }}
            >
              Ajouter
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// --- Logistique -----------------------------------------------------------------------------------

function Logistique({ fiche, majProjet, recharger, peut }: Ops) {
  const { projet, materiel, conflits } = fiche;
  const modifiable = peut('contribution');
  const [catalogue, setCatalogue] = useState<ArticleMateriel[]>([]);
  const [ajout, setAjout] = useState<{ articleId: string | null; quantite: number }>({ articleId: null, quantite: 10 });

  useEffect(() => {
    api.get<{ articles: ArticleMateriel[] }>('/projets/materiel').then((d) => setCatalogue(d.articles.filter((a) => a.actif)));
  }, []);

  const reserver = async (articleId: string, quantite: number) => {
    if (await lancer(api.put(`/projets/${projet._id}/materiel`, { articleId, quantite }))) await recharger();
  };

  const planning: [keyof typeof projet, string][] = [
    ['montage', 'Début du montage'],
    ['ouverture', 'Ouverture au public'],
    ['fermeture', "Fin d'exploitation"],
    ['demontage', 'Fin du démontage'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {conflits.map((c) => (
        <Alert
          key={c.articleId}
          type="error"
          showIcon
          message={`${c.nom} : ${c.demande} ${c.unite} mobilisés sur la période pour ${c.total} en stock.${c.concurrents.length ? ` Projets concurrents : ${c.concurrents.join(', ')}.` : ''}`}
        />
      ))}
      <Card
        title="Matériel réservé"
        extra={
          <Text type="secondary">
            Période bloquée : {formatCourt(decaler(projet.dateJour, -1))} → {formatCourt(decaler(projet.dateFin ?? projet.dateJour, 1))}
          </Text>
        }
      >
        <Table
          rowKey="articleId"
          size="small"
          pagination={false}
          dataSource={materiel}
          locale={{ emptyText: 'Aucun matériel réservé' }}
          columns={[
            { title: 'Article', dataIndex: 'nom' },
            {
              title: 'Quantité',
              key: 'q',
              render: (_, m) => (
                <Space>
                  <NombreEnregistre valeur={m.quantite} min={0} disabled={!modifiable} onEnregistre={(v) => reserver(m.articleId, v ?? 0)} aria-label={`Quantité de ${m.nom}`} />
                  <Text type="secondary">{m.unite}</Text>
                </Space>
              ),
            },
            {
              title: 'Stock total',
              key: 't',
              align: 'right',
              render: (_, m) => (conflits.some((c) => c.articleId === m.articleId) ? <Tag color="red">{m.total}</Tag> : m.total),
            },
            ...(modifiable
              ? [
                  {
                    title: '',
                    key: 'x',
                    width: 50,
                    render: (_: unknown, m: (typeof materiel)[number]) => (
                      <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Retirer ${m.nom}`} onClick={() => reserver(m.articleId, 0)} />
                    ),
                  },
                ]
              : []),
          ]}
        />
        {modifiable && (
          <Space style={{ marginTop: 12 }} wrap>
            <Select
              placeholder="Article"
              value={ajout.articleId ?? undefined}
              onChange={(articleId) => setAjout({ ...ajout, articleId })}
              options={catalogue.filter((a) => !materiel.some((m) => m.articleId === a._id)).map((a) => ({ value: a._id, label: `${a.nom} (${a.total} ${a.unite})` }))}
              style={{ width: 260 }}
            />
            <InputNumber min={1} value={ajout.quantite} onChange={(v) => setAjout({ ...ajout, quantite: Number(v ?? 1) })} aria-label="Quantité" />
            <Button
              disabled={!ajout.articleId}
              onClick={async () => {
                await reserver(ajout.articleId!, ajout.quantite);
                setAjout({ articleId: null, quantite: 10 });
              }}
            >
              Réserver
            </Button>
          </Space>
        )}
      </Card>
      <Card title="Planning du jour J">
        <div style={grille}>
          {planning.map(([cle, libelle]) => (
            <Champ key={cle} libelle={libelle}>
              <TexteEnregistre type="datetime-local" valeur={String(projet[cle] ?? '')} disabled={!modifiable} onEnregistre={(v) => majProjet({ [cle]: v })} />
            </Champ>
          ))}
          <Champ libelle="Implantation, accès, points de livraison" large>
            <TexteEnregistre multiligne valeur={projet.implantation} disabled={!modifiable} onEnregistre={(v) => majProjet({ implantation: v })} aria-label="Implantation" />
          </Champ>
        </div>
      </Card>
    </div>
  );
}

// --- Sécurité et réglementaire -------------------------------------------------------------------

function Reglementaire({ fiche, ligne, peut }: Ops) {
  const jour = aujourdhui();
  const { projet, demarches } = fiche;
  const modifiable = peut('contribution');
  const [nouvelle, setNouvelle] = useState({ libelle: '', decalage: -30 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(projet.jauge ?? 0) >= 1500 && (
        <Alert
          type="warning"
          showIcon
          message={`Jauge de ${projet.jauge!.toLocaleString('fr-FR')} personnes : vérifiez les obligations de déclaration propres aux grands rassemblements et le dimensionnement des secours avec la préfecture et le SDIS.`}
        />
      )}
      <Card>
        <Table
          rowKey="_id"
          size="small"
          pagination={false}
          dataSource={[...demarches].sort((a, b) => a.decalage - b.decalage)}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Démarche', dataIndex: 'libelle', render: (v: string) => <Text strong>{v}</Text> },
            {
              title: 'Échéance',
              key: 'e',
              width: 150,
              render: (_, d) => {
                const e = decaler(projet.dateJour, d.decalage);
                const texte = `${codeEcheance(d.decalage)} · ${formatCourt(e)}`;
                return (d.statut === 'a_faire' || d.statut === 'depose') && e < jour ? <Tag color="red">{texte}</Tag> : texte;
              },
            },
            {
              title: 'Statut',
              key: 's',
              width: 160,
              render: (_, d) => (
                <Select
                  size="small"
                  value={d.statut}
                  disabled={!modifiable}
                  onChange={(statut) => ligne('demarches', d._id, { statut })}
                  options={Object.entries(STATUTS_DEMARCHE).map(([value, s]) => ({ value, label: s.libelle }))}
                  style={{ width: 150 }}
                  aria-label="Statut"
                />
              ),
            },
            {
              title: 'Référence ou remarque',
              key: 'n',
              render: (_, d) => (
                <TexteEnregistre size="small" valeur={d.note} disabled={!modifiable} placeholder="N° d'arrêté, date de dépôt…" onEnregistre={(note) => ligne('demarches', d._id, { note })} />
              ),
            },
            ...(modifiable
              ? [
                  {
                    title: '',
                    key: 'x',
                    width: 50,
                    render: (_: unknown, d: (typeof demarches)[number]) => (
                      <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Supprimer la démarche" onClick={() => ligne('demarches', d._id)} />
                    ),
                  },
                ]
              : []),
          ]}
        />
        {modifiable && (
          <Space style={{ marginTop: 12 }} wrap>
            <Input placeholder="Ajouter une démarche" value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} style={{ width: 320 }} />
            <InputNumber value={nouvelle.decalage} onChange={(v) => setNouvelle({ ...nouvelle, decalage: Number(v ?? 0) })} addonAfter="jours / J" style={{ width: 160 }} />
            <Button
              disabled={!nouvelle.libelle.trim()}
              onClick={async () => {
                await ligne('demarches', null, nouvelle);
                setNouvelle({ ...nouvelle, libelle: '' });
              }}
            >
              Ajouter
            </Button>
          </Space>
        )}
      </Card>
    </div>
  );
}

// --- Prestataires ---------------------------------------------------------------------------------

function Prestataires({ fiche, referentiels: ref, ligne, peut }: Ops) {
  const modifiable = peut('contribution');
  const [nouveau, setNouveau] = useState({ nom: '', prestation: '' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {fiche.prestataires.length === 0 && <Empty description="Aucun prestataire rattaché à ce projet" />}
      {fiche.prestataires.map((p) => {
        const manquantes = ref.pieces.filter((x) => !p.pieces[x.code]).length;
        const maj = (champs: Record<string, unknown>) => ligne('prestataires', p._id, champs);
        return (
          <Card
            key={p._id}
            title={p.nom}
            extra={
              <Space>
                {manquantes ? <Tag color="orange">{manquantes} pièce(s) manquante(s)</Tag> : <Tag color="green">Dossier complet</Tag>}
                {modifiable && (
                  <Popconfirm title="Retirer ce prestataire ?" okText="Retirer" cancelText="Annuler" onConfirm={() => ligne('prestataires', p._id)}>
                    <Button size="small" danger>
                      Retirer
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            }
          >
            <div style={grille}>
              <Champ libelle="Prestation">
                <TexteEnregistre valeur={p.prestation} disabled={!modifiable} onEnregistre={(prestation) => maj({ prestation })} />
              </Champ>
              <Champ libelle="Contact">
                <TexteEnregistre valeur={p.contact} disabled={!modifiable} onEnregistre={(contact) => maj({ contact })} />
              </Champ>
              <Champ libelle="Arrivée sur site">
                <TexteEnregistre type="datetime-local" valeur={p.arrivee} disabled={!modifiable} onEnregistre={(arrivee) => maj({ arrivee })} />
              </Champ>
              <Champ libelle="Départ du site">
                <TexteEnregistre type="datetime-local" valeur={p.depart} disabled={!modifiable} onEnregistre={(depart) => maj({ depart })} />
              </Champ>
              <Champ libelle="Montant engagé (€)">
                <NombreEnregistre valeur={p.montant} min={0} disabled={!modifiable} onEnregistre={(montant) => maj({ montant })} style={{ width: '100%' }} />
              </Champ>
              <Champ libelle="Lien vers les documents">
                <TexteEnregistre type="url" valeur={p.lien} placeholder="https://…" disabled={!modifiable} onEnregistre={(lien) => maj({ lien })} />
              </Champ>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Pièces administratives reçues</div>
                <Space wrap>
                  {ref.pieces.map((x) => (
                    <Checkbox key={x.code} checked={!!p.pieces[x.code]} disabled={!modifiable} onChange={(e) => maj({ pieces: { ...p.pieces, [x.code]: e.target.checked } })}>
                      {x.libelle}
                    </Checkbox>
                  ))}
                </Space>
              </div>
            </div>
          </Card>
        );
      })}
      {modifiable && (
        <Card size="small">
          <Space wrap>
            <Input placeholder="Nom du prestataire" value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} style={{ width: 240 }} />
            <Input placeholder="Prestation (sonorisation, sécurité…)" value={nouveau.prestation} onChange={(e) => setNouveau({ ...nouveau, prestation: e.target.value })} style={{ width: 280 }} />
            <Button
              disabled={!nouveau.nom.trim()}
              onClick={async () => {
                await ligne('prestataires', null, nouveau);
                setNouveau({ nom: '', prestation: '' });
              }}
            >
              Ajouter le prestataire
            </Button>
          </Space>
        </Card>
      )}
    </div>
  );
}

// --- Budget et bilan ------------------------------------------------------------------------------

function BudgetBilan({ fiche, referentiels: ref, ligne, majProjet, peut }: Ops) {
  const { projet, budget } = fiche;
  const modifiable = peut('validation');
  const [poste, setPoste] = useState(ref.budgetPostes[0] ?? '');
  const prevu = budget.reduce((n, b) => n + b.prevu, 0);
  const realise = budget.reduce((n, b) => n + b.realise, 0);
  const ecartTotal = realise - prevu;
  const passe = projet.dateJour < aujourdhui();
  const couleurEcart = (v: number) => (v > 0 ? '#be3327' : '#2c7a4b');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Budget"
        extra={
          <Text>
            Écart réalisé / prévu :{' '}
            <b style={{ color: couleurEcart(ecartTotal) }}>
              {ecartTotal > 0 ? '+' : ''}
              {formatEuro(ecartTotal)}
            </b>
          </Text>
        }
      >
        {!modifiable && <Text type="secondary">Le budget est tenu par les comptes de niveau Validation.</Text>}
        <Table
          rowKey="_id"
          size="small"
          pagination={false}
          dataSource={budget}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Total</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>{formatEuro(prevu)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                <b>{formatEuro(realise)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <b style={{ color: couleurEcart(ecartTotal) }}>{formatEuro(ecartTotal)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
            </Table.Summary.Row>
          )}
          columns={[
            { title: 'Poste', key: 'p', render: (_, b) => <TexteEnregistre size="small" valeur={b.poste} disabled={!modifiable} onEnregistre={(v) => ligne('budget', b._id, { poste: v })} /> },
            {
              title: 'Prévisionnel',
              key: 'pv',
              align: 'right',
              render: (_, b) => <NombreEnregistre size="small" valeur={b.prevu} disabled={!modifiable} onEnregistre={(v) => ligne('budget', b._id, { prevu: v ?? 0 })} aria-label="Prévisionnel" />,
            },
            {
              title: 'Réalisé',
              key: 'r',
              align: 'right',
              render: (_, b) => <NombreEnregistre size="small" valeur={b.realise} disabled={!modifiable} onEnregistre={(v) => ligne('budget', b._id, { realise: v ?? 0 })} aria-label="Réalisé" />,
            },
            {
              title: 'Écart',
              key: 'e',
              align: 'right',
              render: (_, b) => <span style={{ color: couleurEcart(b.realise - b.prevu) }}>{formatEuro(b.realise - b.prevu)}</span>,
            },
            {
              title: '',
              key: 'x',
              width: 50,
              render: (_, b) =>
                modifiable && <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Supprimer la ligne" onClick={() => ligne('budget', b._id)} />,
            },
          ]}
        />
        {modifiable && (
          <Space style={{ marginTop: 12 }} wrap>
            <Select
              value={poste}
              onChange={setPoste}
              options={ref.budgetPostes.map((p) => ({ value: p, label: p }))}
              style={{ width: 260 }}
              showSearch
              aria-label="Poste budgétaire"
            />
            <Button onClick={() => ligne('budget', null, { poste })}>Ajouter une ligne</Button>
          </Space>
        )}
      </Card>
      <Card title="Bilan J+7" extra={passe ? <Tag color="blue">À renseigner pour le {formatCourt(decaler(projet.dateJour, 7))}</Tag> : <Text type="secondary">Après l'événement</Text>}>
        <div style={grille}>
          <Champ libelle="Fréquentation constatée">
            <NombreEnregistre
              valeur={projet.bilan.frequentation ?? null}
              min={0}
              disabled={!modifiable}
              onEnregistre={(v) => majProjet({ bilan: { frequentation: v } })}
              style={{ width: '100%' }}
            />
          </Champ>
          <Champ libelle="Statut du projet">
            <Select
              value={projet.statut}
              disabled={!modifiable}
              onChange={(statut: StatutProjet) => majProjet({ statut })}
              options={Object.entries(STATUTS_PROJET).map(([value, s]) => ({ value, label: s.libelle }))}
              style={{ width: '100%' }}
            />
          </Champ>
          <Champ libelle="Points forts" large>
            <TexteEnregistre multiligne valeur={projet.bilan.forts ?? ''} disabled={!modifiable} onEnregistre={(forts) => majProjet({ bilan: { forts } })} aria-label="Points forts" />
          </Champ>
          <Champ libelle="Points à améliorer pour la prochaine édition" large>
            <TexteEnregistre multiligne valeur={projet.bilan.ameliorer ?? ''} disabled={!modifiable} onEnregistre={(ameliorer) => majProjet({ bilan: { ameliorer } })} aria-label="Points à améliorer" />
          </Champ>
          <Champ libelle="Incidents et mains courantes" large>
            <TexteEnregistre multiligne valeur={projet.bilan.incidents ?? ''} disabled={!modifiable} onEnregistre={(incidents) => majProjet({ bilan: { incidents } })} aria-label="Incidents" />
          </Champ>
        </div>
      </Card>
    </div>
  );
}

// --- Informations ---------------------------------------------------------------------------------

function Informations({ fiche, referentiels: ref, majProjet, recharger, peut }: Ops) {
  const navigate = useNavigate();
  const { projet } = fiche;
  const modifiable = peut('administration');
  return (
    <Card>
      <div style={grille}>
        <Champ libelle="Intitulé" large>
          <TexteEnregistre valeur={projet.titre} disabled={!modifiable} onEnregistre={(titre) => titre.trim() && majProjet({ titre })} />
        </Champ>
        <Champ libelle="Type">
          <Select value={projet.type} disabled={!modifiable} onChange={(type) => majProjet({ type })} options={Object.entries(ref.types).map(([value, label]) => ({ value, label }))} style={{ width: '100%' }} />
        </Champ>
        <Champ libelle="Jour J">
          <DatePicker
            format="DD/MM/YYYY"
            value={dayjs(projet.dateJour)}
            allowClear={false}
            disabled={!modifiable}
            onChange={(d) => d && majProjet({ dateJour: d.format('YYYY-MM-DD') })}
            style={{ width: '100%' }}
          />
        </Champ>
        <Champ libelle="Date de fin (plusieurs jours)">
          <DatePicker
            format="DD/MM/YYYY"
            value={projet.dateFin ? dayjs(projet.dateFin) : null}
            disabled={!modifiable}
            onChange={(d) => majProjet({ dateFin: d ? d.format('YYYY-MM-DD') : null })}
            style={{ width: '100%' }}
          />
        </Champ>
        <Champ libelle="Lieu">
          <TexteEnregistre valeur={projet.lieu} disabled={!modifiable} onEnregistre={(lieu) => majProjet({ lieu })} />
        </Champ>
        <Champ libelle="Jauge prévisionnelle">
          <NombreEnregistre valeur={projet.jauge} min={0} disabled={!modifiable} onEnregistre={(jauge) => majProjet({ jauge })} style={{ width: '100%' }} />
        </Champ>
        <Champ libelle="Demandeur">
          <TexteEnregistre valeur={projet.demandeur} disabled={!modifiable} onEnregistre={(demandeur) => majProjet({ demandeur })} />
        </Champ>
        <Champ libelle="Référent du service">
          <TexteEnregistre valeur={projet.referent} disabled={!modifiable} onEnregistre={(referent) => majProjet({ referent })} />
        </Champ>
        <Champ libelle="Description et notes" large>
          <TexteEnregistre multiligne valeur={projet.description} disabled={!modifiable} onEnregistre={(description) => majProjet({ description })} aria-label="Description" />
        </Champ>
      </div>
      <Text type="secondary" style={{ display: 'block', margin: '12px 0' }}>
        Changer le jour J recalcule toutes les échéances du rétroplanning. Projet inscrit le {formatLong(projet.inscritLe)}.
      </Text>
      {modifiable && (
        <div style={{ margin: '16px 0', maxWidth: 640 }}>
          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Événement du calendrier</div>
          <SelecteurEvenement
            valeur={fiche.evenement && !fiche.evenement.supprime ? fiche.evenement._id : null}
            libelleInitial={fiche.evenement?.nom ?? undefined}
            onChange={async (evenementId) => {
              await lancer(api.put(`/liaisons/projet/${projet._id}/evenement`, { evenementId }));
              await recharger();
            }}
          />
        </div>
      )}
      {modifiable && (
        <Popconfirm
          title="Supprimer ce projet ?"
          description="Suppression définitive pour tous : tâches, démarches, prestataires, budget et plans."
          okText="Supprimer"
          okButtonProps={{ danger: true }}
          cancelText="Annuler"
          onConfirm={async () => {
            if (await lancer(api.delete(`/projets/${projet._id}`))) navigate('/projets/liste');
          }}
        >
          <Button danger>Supprimer le projet</Button>
        </Popconfirm>
      )}
    </Card>
  );
}

// --- Fiche ----------------------------------------------------------------------------------------

export default function FicheProjet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { peut } = useAuth();
  const ref = useReferentiels();
  const [fiche, setFiche] = useState<FicheProjetComplete | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setFiche(await api.get<FicheProjetComplete>(`/projets/${id}`));
    } catch {
      setIntrouvable(true);
    }
  }, [id]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  if (introuvable) {
    return (
      <Card>
        <Empty description="Projet introuvable" />
        <Button onClick={() => navigate('/projets/liste')}>Retour aux projets</Button>
      </Card>
    );
  }
  if (!fiche || !ref) return null;

  const majProjet = async (champs: Record<string, unknown>) => {
    const res = await api.put<{ ok: boolean; message: string }>(`/projets/${fiche.projet._id}`, champs);
    if (!res.ok || champs.dateJour) await lancer(Promise.resolve(res));
    await recharger();
  };
  const ligne = async (chemin: string, ligneId: string | null, donnees?: Record<string, unknown>) => {
    const base = `/projets/${fiche.projet._id}/${chemin}`;
    const appel = ligneId === null ? api.post<{ ok: boolean; message: string }>(base, donnees) : donnees ? api.put<{ ok: boolean; message: string }>(`${base}/${ligneId}`, donnees) : api.delete<{ ok: boolean; message: string }>(`${base}/${ligneId}`);
    try {
      const res = await appel;
      if (!res.ok) await lancer(Promise.resolve(res));
    } catch (err) {
      await lancer(Promise.reject(err));
    }
    await recharger();
  };
  const ops: Ops = { fiche, referentiels: ref, recharger, majProjet, ligne, peut: (niveau) => peut('projets', niveau) };
  const { projet } = fiche;
  const inscription = ecart(projet.dateJour, projet.inscritLe);
  const actif = projet.statut === 'preparation' || projet.statut === 'realise';

  const onglets = [
    { key: 'retro', label: 'Rétroplanning', children: <Retroplanning {...ops} /> },
    {
      key: 'plan',
      label: 'Plan et 3D',
      children: <PlanImplantation fiche={fiche} referentiels={ref} peutModifier={peut('projets', 'contribution')} onMaterielModifie={recharger} />,
    },
    { key: 'logistique', label: 'Logistique', children: <Logistique {...ops} /> },
    { key: 'reglementaire', label: 'Sécurité et réglementaire', children: <Reglementaire {...ops} /> },
    { key: 'prestataires', label: 'Prestataires', children: <Prestataires {...ops} /> },
    { key: 'budget', label: 'Budget et bilan', children: <BudgetBilan {...ops} /> },
    { key: 'infos', label: 'Informations', children: <Informations {...ops} /> },
  ];
  if (fiche.demandesStock !== null) {
    onglets.splice(6, 0, {
      key: 'goodies',
      label: `Goodies (${fiche.demandesStock.length})`,
      children: (
        <Card
          title="Demandes de goodies et cadeaux"
          extra={<Button onClick={() => navigate(`/stock/demandes?projet=${projet._id}`)}>Demander des goodies pour ce projet</Button>}
        >
          {fiche.demandesStock.length === 0 ? (
            <Empty description="Aucune demande rattachée au projet ou à son événement" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              rowKey="_id"
              size="small"
              pagination={false}
              dataSource={fiche.demandesStock}
              columns={[
                { title: 'N°', dataIndex: 'numero' },
                { title: 'Direction', dataIndex: 'directionNom' },
                { title: 'Article', key: 'a', render: (_, d) => `${d.reference} · ${d.libelle}` },
                { title: 'Qté', dataIndex: 'quantite', align: 'right' },
                { title: 'Valeur', key: 'v', align: 'right', render: (_, d) => formatEuro(d.valeur) },
                { title: 'Besoin', key: 'b', render: (_, d) => formatJour(d.dateBesoin) },
                { title: 'Statut', key: 's', render: (_, d) => <Tag color={couleurStatut(d.statut)}>{d.statut}</Tag> },
              ]}
            />
          )}
        </Card>
      ),
    });
  }

  // Écart entre le jour J du projet et la date inscrite au calendrier (report de date au calendrier, par exemple).
  const evenement = fiche.evenement;
  const jourLocal = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : null);
  const ecartCalendrier =
    evenement && !evenement.supprime && evenement.dateDeDebut && jourLocal(evenement.dateDeDebut) !== projet.dateJour
      ? { debut: jourLocal(evenement.dateDeDebut)!, fin: jourLocal(evenement.dateDeFin) }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }} onClick={() => navigate('/projets/liste')}>
          Projets
        </Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Text type="secondary">
            {ref.types[projet.type]} · {projet.lieu || 'lieu à préciser'}
          </Text>
          <Title level={3} style={{ margin: 0 }}>
            {projet.titre}
          </Title>
        </div>
        <Space>
          <Tag color={STATUTS_PROJET[projet.statut].couleur}>{STATUTS_PROJET[projet.statut].libelle}</Tag>
          <Text strong>
            {formatLong(projet.dateJour)}
            {projet.dateFin && projet.dateFin !== projet.dateJour ? ` → ${formatLong(projet.dateFin)}` : ''}
          </Text>
        </Space>
      </div>
      {evenement && !evenement.supprime && (
        <Space wrap>
          <Text type="secondary">
            Au calendrier : {evenement.nom} · {formatLong(evenement.dateDeDebut)}
            {evenement.dateDeFin ? ` → ${formatLong(evenement.dateDeFin)}` : ''}
          </Text>
          <Button size="small" onClick={() => navigate(`/evenement/${evenement._id}`)}>
            Fiche événement
          </Button>
        </Space>
      )}
      {evenement?.supprime && (
        <Alert type="warning" showIcon message={`L'événement « ${evenement.nom ?? ''} » n'existe plus dans le calendrier. Rattachez le projet à un autre événement dans l'onglet Informations.`} />
      )}
      {ecartCalendrier && (
        <Alert
          type="warning"
          showIcon
          message={`Le calendrier indique le ${formatLong(ecartCalendrier.debut)}, le projet le ${formatLong(projet.dateJour)}.`}
          description="La date a pu être reportée au calendrier. Aligner le projet décale tout son rétroplanning."
          action={
            peut('projets', 'administration') && (
              <Button
                size="small"
                onClick={() =>
                  majProjet({ dateJour: ecartCalendrier.debut, dateFin: ecartCalendrier.fin && ecartCalendrier.fin !== ecartCalendrier.debut ? ecartCalendrier.fin : null })
                }
              >
                Aligner sur le calendrier
              </Button>
            )
          }
        />
      )}
      {actif && inscription < ref.delaiInscriptionJours && (
        <Alert
          type="error"
          showIcon
          message="Échéance des 6 mois non tenue"
          description={`Le projet a été inscrit ${inscription} jours avant sa date. Les tâches antérieures à l'inscription apparaissent en retard : cochez celles déjà traitées ou justifiez l'écart dans les notes.`}
        />
      )}
      <Tabs activeKey={params.get('onglet') ?? 'retro'} onChange={(onglet) => setParams({ onglet }, { replace: true })} items={onglets} destroyOnHidden />
    </div>
  );
}
