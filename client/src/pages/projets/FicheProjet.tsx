import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, FilePdfOutlined, MailOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ArticleMateriel, FicheProjetComplete, JalonPilotage, ReferentielRetroplanning, ReferentielsProjets, StatutProjet, TacheProjet } from '../../types';
import {
  COULEURS_NIVEAU,
  METEO,
  STATUTS_DEMARCHE,
  STATUTS_PROJET,
  aujourdhui,
  codeEcheance,
  decaler,
  ecart,
  formatCourt,
  formatLong,
  libelleModule,
  libelleRole,
  useReferentiels,
} from '../../lib/projets';
import { imprimerFichePassage } from '../../lib/fichePassage';
import { CaracteristiquesEvenement, NiveauProjet } from './Caracteristiques';
import { lancer } from '../../lib/actionStock';
import { PlanImplantation } from './PlanImplantation';
import { SelecteurEvenement } from '../../components/SelecteurEvenement';
import { couleurStatut, formatEuro, formatJour } from '../../lib/formatStock';

const { Paragraph, Text, Title } = Typography;

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

// --- Pilotage : où en est-on, qu'est-ce qui bloque, qui doit agir ---------------------------------

function FranchirJalon({ jalon, projetId, recharger, disabled }: { jalon: JalonPilotage; projetId: string; recharger: () => Promise<void>; disabled?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  return (
    <>
      <Button type="primary" disabled={disabled} onClick={() => setOuvert(true)}>
        Franchir le jalon {jalon.code}
      </Button>
      <Modal
        open={ouvert}
        title={`${jalon.code} ${jalon.libelle} : ${jalon.question}`}
        okText="Oui, franchir le jalon"
        cancelText="Annuler"
        onCancel={() => setOuvert(false)}
        onOk={async () => {
          if (await lancer(api.post(`/projets/${projetId}/jalons/${jalon.code}/franchir`, { commentaire }))) {
            setOuvert(false);
            setCommentaire('');
            await recharger();
          }
        }}
      >
        <Paragraph>
          Livrable attendu : <Text strong>{jalon.livrable}</Text>
        </Paragraph>
        <Input.TextArea rows={3} placeholder="Commentaire (facultatif) : réserves, décisions prises…" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </Modal>
    </>
  );
}

function FriseJalons({ fiche, referentiels }: Ops) {
  const { pilotage: p, projet } = fiche;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.jalons.length}, minmax(96px, 1fr))`, minWidth: p.jalons.length * 100 }}>
        {p.jalons.map((j) => {
          const couleur = j.franchi ? '#2c7a4b' : METEO[j.meteo].couleur;
          const prochain = p.prochain?.code === j.code;
          return (
            <a key={j.code} href={`?onglet=retro#jalon-${j.code}`} title={`${j.libelle} — ${j.question}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', color: 'inherit' }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: `3px solid ${couleur}`,
                  background: j.franchi ? couleur : '#fff',
                  outline: prochain ? '3px solid #1c5da8' : undefined,
                  outlineOffset: 2,
                  color: '#fff',
                  fontSize: 13,
                  lineHeight: '18px',
                  textAlign: 'center',
                }}
              >
                {j.franchi ? '✓' : ''}
              </span>
              <Text strong style={{ fontFamily: 'monospace' }}>
                {j.code}
              </Text>
              <Text style={{ fontSize: 12 }}>{j.libelle}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatCourt(j.date)} · {j.faites}/{j.total}
              </Text>
            </a>
          );
        })}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {p.jalons.length} rendez-vous au niveau N{p.niveau}. Plein : jalon franchi · contour vert, orange ou rouge : météo · cerclé de bleu :
        prochain jalon. Jour J le {formatLong(projet.dateJour)} ({codeEcheance(ecart(aujourdhui(), projet.dateJour))} aujourd'hui).
        {referentiels.referentiel.jalons.length > p.jalons.length && ' Les tâches des jalons non actifs à ce niveau sont rattachées au jalon actif suivant.'}
      </Text>
    </div>
  );
}

function Pilotage(ops: Ops) {
  const { fiche, referentiels: ref, recharger, peut } = ops;
  const { pilotage: p, projet } = fiche;
  const r = ref.referentiel;
  const { session } = useAuth();
  const prochain = p.prochain;
  const peutFranchir =
    !!prochain && (peut('validation') || (peut('contribution') && projet.roles[prochain.valideurTenu]?.utilisateurId === session?.userId));
  const rang = prochain ? p.jalons.findIndex((j) => j.code === prochain.code) : -1;
  const precedentFranchi = rang <= 0 || !!p.jalons[rang - 1].franchi;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Où en est-on ?">
        <FriseJalons {...ops} />
        {prochain ? (
          <div style={{ marginTop: 16, padding: 12, borderLeft: `4px solid ${METEO[prochain.meteo].couleur}`, background: '#fafafa' }}>
            <Space wrap style={{ marginBottom: 6 }}>
              <Tag color={METEO[prochain.meteo].tag}>{METEO[prochain.meteo].libelle}</Tag>
              <Text strong>
                Prochain jalon : {prochain.code} {prochain.libelle}, le {formatLong(prochain.date)}
              </Text>
            </Space>
            <div>
              <Text>{prochain.question}</Text>
            </div>
            <div>
              <Text type="secondary">Livrable : {prochain.livrable}</Text>
            </div>
            <div>
              <Text type="secondary">
                Validé par : {libelleRole(r, prochain.valideurTenu)}
                {prochain.valideurNom ? ` — ${prochain.valideurNom}` : ' (personne non désignée)'} · {prochain.faites}/{prochain.total} tâches faites
                {prochain.bloquantsOuverts > 0 && `, ${prochain.bloquantsOuverts} bloquante(s) à solder avant le passage`}
              </Text>
            </div>
            <Space wrap style={{ marginTop: 10 }}>
              <FranchirJalon jalon={prochain} projetId={projet._id} recharger={recharger} disabled={!peutFranchir || !precedentFranchi || prochain.bloquantsOuverts > 0} />
              <Button icon={<FilePdfOutlined />} onClick={() => imprimerFichePassage(fiche, prochain, r)}>
                Fiche de passage
              </Button>
            </Space>
          </div>
        ) : (
          <Alert style={{ marginTop: 16 }} type="success" showIcon message="Tous les jalons sont franchis." />
        )}
      </Card>

      <Card title={`Qu'est-ce qui bloque ? (${p.bloquants.length})`}>
        {p.bloquants.length === 0 ? (
          <Text type="secondary">Aucune tâche bloquante en retard ni infaisable.</Text>
        ) : (
          <Table
            rowKey="_id"
            size="small"
            pagination={false}
            dataSource={p.bloquants}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: 'Tâche',
                key: 't',
                render: (_, t) => (
                  <div>
                    <Text strong>{t.libelle}</Text>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {libelleModule(r, t.module)} · jalon {t.jalonActif}
                      {t.livrable && ` · ${t.livrable}`}
                    </div>
                  </div>
                ),
              },
              {
                title: 'Échéance',
                key: 'e',
                width: 150,
                render: (_, t) => (
                  <Space direction="vertical" size={0}>
                    <Text type={t.enRetard ? 'danger' : undefined}>{formatLong(t.echeance)}</Text>
                    {t.infaisable && <Tag color="red">Infaisable : {t.incompressibleJours} j incompressibles</Tag>}
                    {t.enRetard && !t.infaisable && <Tag color="orange">En retard</Tag>}
                  </Space>
                ),
              },
              {
                title: 'Qui doit agir (P)',
                key: 'p',
                render: (_, t) => (
                  <div>
                    <Text strong>{t.portePar ?? <Text type="secondary">non désigné</Text>}</Text>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{libelleRole(r, t.porteTenu)}</div>
                  </div>
                ),
              },
              {
                title: '',
                key: 'r',
                width: 150,
                render: (_, t) =>
                  peut('contribution') && (
                    <Space direction="vertical" size={0}>
                      <Button
                        size="small"
                        icon={<MailOutlined />}
                        onClick={async () => {
                          if (await lancer(api.post(`/projets/${projet._id}/taches/${t._id}/relance`))) await recharger();
                        }}
                      >
                        Relancer
                      </Button>
                      {t.relanceLe && <Text type="secondary" style={{ fontSize: 11 }}>relancé le {new Date(t.relanceLe).toLocaleDateString('fr-FR')}</Text>}
                    </Space>
                  ),
              },
            ]}
          />
        )}
      </Card>

      {p.nonRetour.length > 0 && (
        <Card title="Dates de non-retour" extra={<Text type="secondary">dernière date pour lancer chaque module sans le sacrifier</Text>}>
          <Space wrap>
            {p.nonRetour.map((n) => (
              <Tag key={n.module} color={n.depassee ? 'red' : n.date < aujourdhui() ? 'default' : 'blue'} style={{ padding: '4px 8px' }}>
                {n.libelle} : {formatLong(n.date)} ({codeEcheance(-n.delai)}){n.depassee ? ' — dépassée' : ''}
              </Tag>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
}

// --- Rétroplanning --------------------------------------------------------------------------------

function RolesTache({ t, r }: { t: TacheProjet; r: ReferentielRetroplanning }) {
  const lettres: [string, string[]][] = [
    ['P', [t.porteTenu]],
    ['F', t.faitRole ? [t.faitRole] : []],
    ['V', t.valideRole ? [t.valideRole] : []],
    ['I', t.informe],
  ];
  return (
    <Space size={4} wrap>
      {lettres
        .filter(([, roles]) => roles.length)
        .map(([l, roles]) => (
          <Tag key={l} color={l === 'P' ? 'blue' : undefined} style={{ marginInlineEnd: 0, fontSize: 11 }} title={roles.map((x) => libelleRole(r, x)).join(', ')}>
            {l} : {roles.map((x) => libelleRole(r, x).replace(/^Référent /, 'Réf. ')).join(', ')}
          </Tag>
        ))}
    </Space>
  );
}

function Retroplanning({ fiche, referentiels: ref, ligne, peut }: Ops) {
  const { pilotage: p, taches } = fiche;
  const r = ref.referentiel;
  const modifiable = peut('contribution');
  const [nouvelle, setNouvelle] = useState({ libelle: '', decalage: -30, porte: 'pilote', bloquante: false });
  const [filtre, setFiltre] = useState<'toutes' | 'ouvertes' | 'bloquantes'>('toutes');
  const roles = p.roles.filter((x) => x.utile);

  return (
    <Card
      styles={{ body: { padding: 0 } }}
      title="Rétroplanning"
      extra={
        <Segmented
          value={filtre}
          onChange={(v) => setFiltre(v as typeof filtre)}
          options={[
            { value: 'toutes', label: 'Toutes' },
            { value: 'ouvertes', label: 'À faire' },
            { value: 'bloquantes', label: 'Bloquantes' },
          ]}
        />
      }
    >
      {p.jalons.map((j) => {
        const lot = taches
          .filter((t) => t.jalonActif === j.code)
          .filter((t) => (filtre === 'ouvertes' ? !t.fait : filtre === 'bloquantes' ? t.bloquante : true))
          .sort((a, b) => a.decalage - b.decalage);
        return (
          <div key={j.code} id={`jalon-${j.code}`} style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
              <Tag color={j.franchi ? 'green' : METEO[j.meteo].tag}>{j.code}</Tag>
              <Text strong>{j.libelle}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatLong(j.date)} · {j.question} · validé par {libelleRole(r, j.valideurTenu)}
                {j.franchi && ` · franchi par ${j.franchi.decidePar} le ${new Date(j.franchi.createdAt).toLocaleDateString('fr-FR')}`}
              </Text>
            </div>
            {lot.length === 0 && <Text type="secondary">Aucune tâche.</Text>}
            {lot.map((t) => (
              <div key={t._id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', flexWrap: 'wrap', borderBottom: '1px dashed #f5f5f5' }}>
                <Checkbox checked={t.fait} disabled={!modifiable} onChange={(e) => ligne('taches', t._id, { fait: e.target.checked })} aria-label={`Tâche faite : ${t.libelle}`} />
                <div style={{ flex: '1 1 300px' }}>
                  <Text delete={t.fait} type={t.fait ? 'secondary' : undefined}>
                    {t.libelle}
                  </Text>
                  {t.bloquante && !t.fait && (
                    <Tag color={t.infaisable ? 'red' : 'volcano'} style={{ marginLeft: 6 }}>
                      {t.infaisable ? `Infaisable (${t.incompressibleJours} j)` : 'Bloquante'}
                    </Tag>
                  )}
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    <Tag style={{ fontSize: 11 }}>{libelleModule(r, t.module)}</Tag>
                    {t.livrable && `Livrable : ${t.livrable}`}
                    {t.jalon !== t.jalonActif && ` · rattachée depuis ${t.jalon}`}
                    {t.fait && t.faitPar && ` · fait par ${t.faitPar}`}
                  </div>
                </div>
                <RolesTache t={t} r={r} />
                <Text type={t.enRetard ? 'danger' : 'secondary'} style={{ fontFamily: 'monospace', fontSize: 12, width: 110, textAlign: 'right' }}>
                  {codeEcheance(t.decalage)} · {formatCourt(t.echeance)}
                </Text>
                {modifiable && (
                  <Popconfirm title="Supprimer cette tâche ?" okText="Supprimer" cancelText="Annuler" onConfirm={() => ligne('taches', t._id)}>
                    <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Supprimer la tâche" />
                  </Popconfirm>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {modifiable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 16, borderTop: '1px solid #f0f0f0', alignItems: 'center' }}>
          <Input placeholder="Ajouter une tâche spécifique" value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} style={{ flex: '1 1 260px' }} />
          <InputNumber value={nouvelle.decalage} onChange={(v) => setNouvelle({ ...nouvelle, decalage: Number(v ?? 0) })} addonAfter="jours / J" style={{ width: 160 }} />
          <Select value={nouvelle.porte} onChange={(porte) => setNouvelle({ ...nouvelle, porte })} options={roles.map((x) => ({ value: x.code, label: `P : ${x.libelle}` }))} style={{ width: 220 }} aria-label="Porte (P)" />
          <Checkbox checked={nouvelle.bloquante} onChange={(e) => setNouvelle({ ...nouvelle, bloquante: e.target.checked })}>
            Bloquante
          </Checkbox>
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
  );
}

// --- Équipe : qui tient quel rôle ----------------------------------------------------------------

function Equipe({ fiche, referentiels: ref, majProjet, peut }: Ops) {
  const { projet, pilotage: p } = fiche;
  const r = ref.referentiel;
  const modifiable = peut('validation');
  const [intervenants, setIntervenants] = useState<{ _id: string; nom: string }[]>([]);
  useEffect(() => {
    api.get<{ intervenants: { _id: string; nom: string }[] }>('/projets/intervenants').then((d) => setIntervenants(d.intervenants));
  }, []);
  const designer = (role: string, valeur: string | null, nomLibre?: string) => {
    const roles = { ...projet.roles };
    if (!valeur && !nomLibre) delete roles[role];
    else if (nomLibre !== undefined) roles[role] = { utilisateurId: null, nom: nomLibre };
    else roles[role] = { utilisateurId: valeur, nom: intervenants.find((i) => i._id === valeur)?.nom ?? '' };
    return majProjet({ roles });
  };
  const lignes = p.roles.filter((x) => x.utile);
  const formation = fiche.formation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Card
      size="small"
      title="Accompagnement du pilote"
      extra={
        formation &&
        (formation.autonome ? (
          <Tag color="green">Pilote autonome</Tag>
        ) : (
          <Space size={4} wrap>
            {formation.etapes.map((e) => (
              <Tag key={e.code} color={e.acquise ? 'green' : e.code === formation.prochaine ? 'blue' : undefined}>
                {e.acquise ? '✓ ' : ''}
                {e.libelle}
              </Tag>
            ))}
          </Space>
        ))
      }
    >
      {!projet.roles.pilote?.utilisateurId ? (
        <Text type="secondary">Désignez d'abord le pilote (compte de l'application) ci-dessous.</Text>
      ) : (
        <Space wrap>
          <Select
            allowClear
            disabled={!modifiable}
            placeholder="Mode d'accompagnement"
            value={projet.formationMode ?? undefined}
            onChange={(v) => majProjet({ formationMode: v ?? null })}
            options={[
              { value: 'binome', label: 'En binôme avec un formateur' },
              { value: 'seul', label: 'Seul' },
              { value: 'copilote', label: 'En copilote' },
            ]}
            style={{ width: 260 }}
          />
          {(projet.formationMode === 'binome' || projet.formationMode === 'copilote') && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={!modifiable}
              placeholder="Formateur"
              value={projet.formateur?.utilisateurId ?? undefined}
              onChange={(v) => majProjet({ formateur: v ? { utilisateurId: v, nom: intervenants.find((i) => i._id === v)?.nom ?? '' } : null })}
              options={intervenants.filter((i) => i._id !== projet.roles.pilote?.utilisateurId).map((i) => ({ value: i._id, label: i.nom }))}
              style={{ width: 240 }}
            />
          )}
        </Space>
      )}
      {formation?.avis && <Alert type="warning" showIcon style={{ marginTop: 10 }} message={formation.avis} />}
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Parcours : un N1 en binôme, un N1 seul, un N2 en binôme, un N3 en copilote, puis autonomie. Une étape est acquise au bilan
        (dernier jalon franchi). Suivi complet : Projets → Formation des pilotes.
      </Text>
    </Card>
    <Card
      title="Équipe du projet"
      extra={<Text type="secondary">Un seul « P » par tâche : la personne désignée ici reçoit les relances.</Text>}
    >
      {!modifiable && <Paragraph type="secondary">Les rôles sont désignés par les comptes de niveau Validation (chef de service).</Paragraph>}
      <Table
        rowKey="code"
        size="small"
        pagination={false}
        dataSource={lignes}
        columns={[
          {
            title: 'Rôle',
            key: 'r',
            render: (_, x) => (
              <div>
                <Text strong>{x.libelle}</Text>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>{x.mission}</div>
              </div>
            ),
          },
          {
            title: 'Tâches portées',
            key: 'n',
            width: 110,
            align: 'right',
            render: (_, x) => fiche.taches.filter((t) => t.porteTenu === x.code && !t.fait).length || '—',
          },
          {
            title: 'Tenu par',
            key: 'p',
            width: 320,
            render: (_, x) =>
              x.tenuPar !== x.code ? (
                <Text type="secondary">
                  Le pilote, au niveau N{p.niveau} (rôle distinct à partir de N{x.niveauMin})
                </Text>
              ) : (
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    disabled={!modifiable}
                    placeholder="Compte de l'application"
                    value={projet.roles[x.code]?.utilisateurId ?? undefined}
                    onChange={(v) => designer(x.code, v ?? null)}
                    options={intervenants.map((i) => ({ value: i._id, label: i.nom }))}
                    style={{ width: '60%' }}
                  />
                  <TexteEnregistre
                    placeholder="ou nom (sans relance)"
                    disabled={!modifiable}
                    valeur={projet.roles[x.code] && !projet.roles[x.code].utilisateurId ? projet.roles[x.code].nom : ''}
                    onEnregistre={(nom) => designer(x.code, null, nom.trim() || undefined)}
                    style={{ width: '40%' }}
                  />
                </Space.Compact>
              ),
          },
        ]}
      />
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        En N1 et N2, le pilote tient aussi le rôle de régisseur jour J ; à partir de N3, les deux rôles sont séparés.
      </Text>
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
        <Champ libelle="Jauge prévisionnelle (fixe le niveau de base)">
          <NombreEnregistre valeur={projet.jauge} min={0} disabled={!modifiable} onEnregistre={(jauge) => majProjet({ jauge })} style={{ width: '100%' }} />
        </Champ>
        <Champ libelle="Niveau" large>
          <NiveauProjet niveau={fiche.pilotage.niveau} libelle={fiche.pilotage.niveauLibelle} base={fiche.pilotage.base} majorations={fiche.pilotage.majorations} multiSites={fiche.pilotage.multiSites} />
        </Champ>
        <Champ libelle="Caractéristiques de l'événement (modules et majorations)" large>
          <CaracteristiquesEvenement referentiel={ref.referentiel} criteres={projet.criteres} disabled={!modifiable} onChange={(criteres) => majProjet({ criteres })} />
          {projet.type && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ancien type : {ref.types[projet.type]}
            </Text>
          )}
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
        Changer le jour J recalcule toutes les échéances. Changer la jauge ou les caractéristiques recalcule le niveau : les tâches
        devenues utiles sont ajoutées, celles qui ne le sont plus sont retirées si elles ne sont pas faites. Projet inscrit le{' '}
        {formatLong(projet.inscritLe)}.
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
    if (!res.ok || champs.dateJour || 'jauge' in champs || 'criteres' in champs) await lancer(Promise.resolve(res));
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
    {
      key: 'pilotage',
      label: (
        <span>
          Pilotage <Badge color={METEO[fiche.pilotage.meteo].couleur} />
        </span>
      ),
      children: <Pilotage {...ops} />,
    },
    { key: 'retro', label: 'Rétroplanning', children: <Retroplanning {...ops} /> },
    { key: 'equipe', label: 'Équipe', children: <Equipe {...ops} /> },
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
    onglets.splice(8, 0, {
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
            {fiche.pilotage.modules.map((m) => m.libelle).join(' + ')} · {projet.lieu || 'lieu à préciser'}
          </Text>
          <Title level={3} style={{ margin: 0 }}>
            {projet.titre}
          </Title>
        </div>
        <Space wrap>
          <Tag color={COULEURS_NIVEAU[fiche.pilotage.niveau]}>
            N{fiche.pilotage.niveau} · {fiche.pilotage.niveauLibelle}
          </Tag>
          <Tag color={METEO[fiche.pilotage.meteo].tag}>{METEO[fiche.pilotage.meteo].libelle}</Tag>
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
          description={`Le projet a été inscrit ${inscription} jours avant sa date. Les tâches antérieures à l'inscription apparaissent en retard : cochez celles déjà traitées ou justifiez l'écart dans les notes.${fiche.pilotage.infaisables ? ` ${fiche.pilotage.infaisables} tâche(s) bloquante(s) ne tiennent plus dans les délais incompressibles : voir l'onglet Pilotage.` : ''}`}
        />
      )}
      <Tabs activeKey={params.get('onglet') ?? 'pilotage'} onChange={(onglet) => setParams({ onglet }, { replace: true })} items={onglets} destroyOnHidden />
    </div>
  );
}
