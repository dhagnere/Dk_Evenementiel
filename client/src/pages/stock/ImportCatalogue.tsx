import { useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Drawer, Grid, Space, Table, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { formatEuro } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';

const { Text, Paragraph } = Typography;

interface Rapport {
  articles: { ligne: number; reference: string; libelle: string; famille: string; categorie: string; emplacement: string; stockInitial: number; prix: number | null; actif: boolean }[];
  anomalies: { ligne: number; reference: string; message: string }[];
  ecartes: { ligne: number; reference: string }[];
  existants: string[];
  aCreer: number;
  valeur: number;
  protocole: number;
  retires: number;
  aValoriser: number;
  emplacementsInconnus: string[];
}

/**
 * Import d'un catalogue depuis un CSV (super-administrateurs) : analyse sans écriture, puis import
 * si l'analyse est propre. Accepte le modèle de l'application et le classeur de reprise enregistré en CSV.
 */
export function ImportCatalogue({ ouvert, onFerme, onImporte }: { ouvert: boolean; onFerme: () => void; onImporte: () => void }) {
  const mobile = !Grid.useBreakpoint().md;
  const [fichier, setFichier] = useState<File | null>(null);
  const [ajouterEmplacements, setAjouterEmplacements] = useState(false);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (mode: 'analyse' | 'import') => {
    if (!fichier) return;
    const form = new FormData();
    form.append('fichier', fichier);
    form.append('ajouterEmplacements', String(ajouterEmplacements));
    setEnCours(true);
    try {
      const res = await api.postForm<{ ok: boolean; message?: string; rapport?: Rapport }>(`/stock/catalogue/import?mode=${mode}`, form);
      if (mode === 'analyse') {
        if (res.ok && res.rapport) setRapport(res.rapport);
        else await lancer(Promise.resolve(res));
      } else if (await lancer(Promise.resolve(res))) {
        setRapport(null);
        setFichier(null);
        onImporte();
        onFerme();
      }
    } catch (err) {
      await lancer(Promise.reject(err));
    } finally {
      setEnCours(false);
    }
  };

  const fermer = () => {
    setRapport(null);
    setFichier(null);
    onFerme();
  };

  return (
    <Drawer title="Importer un catalogue (CSV)" open={ouvert} onClose={fermer} width={mobile ? '100%' : 860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Paragraph style={{ margin: 0 }}>
          Une ligne par article. Colonnes : référence, libellé, famille, catégorie (Goodies ou Protocole), emplacement, stock, prix
          (vide : à valoriser), seuil, actif (Oui/Non), fournisseur, délai, historique. Séparateur « ; » ou « , ». Le classeur de
          reprise enregistré en CSV est accepté tel quel ; ses lignes marquées « Écarter » sont ignorées.
        </Paragraph>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Un article dont la référence existe déjà n'est pas modifié : réimporter le même fichier ne crée pas de doublon. Chaque
          article créé reçoit son stock initial et une ligne « Création » au journal des mouvements.
        </Paragraph>
        <Space wrap>
          <Button icon={<DownloadOutlined />} href="/api/stock/catalogue/modele">
            Télécharger le modèle
          </Button>
          <Upload
            accept=".csv,text/csv"
            maxCount={1}
            beforeUpload={(f) => {
              setFichier(f);
              setRapport(null);
              return false;
            }}
            onRemove={() => {
              setFichier(null);
              setRapport(null);
            }}
            fileList={fichier ? [{ uid: '1', name: fichier.name, status: 'done' }] : []}
          >
            <Button icon={<UploadOutlined />}>Choisir le fichier</Button>
          </Upload>
        </Space>
        <Checkbox
          checked={ajouterEmplacements}
          onChange={(e) => {
            setAjouterEmplacements(e.target.checked);
            setRapport(null);
          }}
        >
          Ajouter aux paramètres les emplacements absents de la liste
        </Checkbox>
        <div>
          <Button type="primary" disabled={!fichier} loading={enCours && !rapport} onClick={() => envoyer('analyse')}>
            Analyser le fichier
          </Button>
        </div>

        {rapport && (
          <>
            <Descriptions size="small" bordered column={{ xs: 1, md: 2 }} title="Résultat de l'analyse">
              <Descriptions.Item label="Articles lus">{rapport.articles.length + rapport.anomalies.filter((a) => a.message.startsWith('à compléter')).length}</Descriptions.Item>
              <Descriptions.Item label="À créer">
                <Text strong>{rapport.aCreer}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Déjà au catalogue (inchangés)">{rapport.existants.length}</Descriptions.Item>
              <Descriptions.Item label="Écartés (décision « Écarter »)">{rapport.ecartes.length}</Descriptions.Item>
              <Descriptions.Item label="Cadeaux protocolaires">{rapport.protocole}</Descriptions.Item>
              <Descriptions.Item label="Retirés du catalogue">{rapport.retires}</Descriptions.Item>
              <Descriptions.Item label="À valoriser (sans prix)">{rapport.aValoriser}</Descriptions.Item>
              <Descriptions.Item label="Valeur reprise">{formatEuro(rapport.valeur)}</Descriptions.Item>
              {rapport.emplacementsInconnus.length > 0 && (
                <Descriptions.Item label="Emplacements ajoutés" span={2}>
                  {rapport.emplacementsInconnus.map((e) => (
                    <Tag key={e}>{e}</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>

            {rapport.anomalies.length > 0 ? (
              <>
                <Alert type="error" showIcon message={`${rapport.anomalies.length} anomalie(s) : corrigez le fichier puis analysez-le de nouveau. Rien n'a été importé.`} />
                <Table
                  rowKey={(a) => `${a.ligne}-${a.message}`}
                  size="small"
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  dataSource={rapport.anomalies}
                  columns={[
                    { title: 'Ligne', dataIndex: 'ligne', width: 70 },
                    { title: 'Référence', dataIndex: 'reference', width: 120 },
                    { title: 'Anomalie', dataIndex: 'message' },
                  ]}
                />
              </>
            ) : (
              <Alert
                type={rapport.aCreer > 0 ? 'success' : 'info'}
                showIcon
                message={rapport.aCreer > 0 ? 'Aucune anomalie : le fichier peut être importé.' : 'Aucun article nouveau à créer.'}
                action={
                  rapport.aCreer > 0 && (
                    <Button type="primary" loading={enCours} onClick={() => envoyer('import')}>
                      Importer {rapport.aCreer} article(s)
                    </Button>
                  )
                }
              />
            )}

            <Table
              rowKey="ligne"
              size="small"
              title={() => 'Aperçu'}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              dataSource={rapport.articles}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Réf.', dataIndex: 'reference' },
                { title: 'Libellé', dataIndex: 'libelle' },
                { title: 'Famille', dataIndex: 'famille' },
                { title: 'Catégorie', dataIndex: 'categorie' },
                { title: 'Emplacement', dataIndex: 'emplacement' },
                { title: 'Stock', dataIndex: 'stockInitial', align: 'right' },
                { title: 'Prix', key: 'p', align: 'right', render: (_, a) => (a.prix === null ? <Text type="secondary">à valoriser</Text> : formatEuro(a.prix)) },
                { title: 'Actif', key: 'a', render: (_, a) => (a.actif ? 'Oui' : <Tag>Retiré</Tag>) },
                {
                  title: '',
                  key: 'e',
                  render: (_, a) => (rapport.existants.includes(a.reference) ? <Tag>Déjà présent</Tag> : null),
                },
              ]}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
