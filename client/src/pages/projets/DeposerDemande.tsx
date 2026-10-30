import { useEffect, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, Button, Card, Checkbox, DatePicker, Input, InputNumber, Progress, Select, Table, Tag, Typography } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { DemandeEvenement, TypeProjet } from '../../types';
import { BESOINS, STATUTS_DEMANDE, formatLong, useReferentiels } from '../../lib/projets';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

function Champ({ libelle, children, large }: { libelle: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label style={{ display: 'block', gridColumn: large ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

const VIDE = {
  intitule: '',
  structure: '',
  contact: '',
  date: null as Dayjs | null,
  lieu: '',
  type: 'quartier' as TypeProjet,
  jauge: null as number | null,
  besoins: [] as string[],
  description: '',
};

/** Dépôt d'une demande d'événement par une direction, une mairie de quartier ou un élu, et suivi. */
export default function DeposerDemande() {
  const { session } = useAuth();
  const ref = useReferentiels();
  const [f, setF] = useState({ ...VIDE, structure: session?.direction ?? '', contact: session?.email ?? '' });
  const [demandes, setDemandes] = useState<DemandeEvenement[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => api.get<{ demandes: DemandeEvenement[] }>('/projets/demandes/miennes').then((d) => setDemandes(d.demandes));
  useEffect(() => {
    charger();
  }, []);

  const delai = f.date ? f.date.diff(dayjs().startOf('day'), 'day') : null;
  const valide = f.intitule.trim() && f.structure.trim() && f.contact.trim() && f.date;

  const envoyer = async () => {
    setEnvoi(true);
    const ok = await lancer(
      api.post('/projets/demandes', {
        intitule: f.intitule,
        structure: f.structure,
        contact: f.contact,
        dateSouhaitee: f.date?.format('YYYY-MM-DD'),
        lieu: f.lieu,
        type: f.type,
        jauge: f.jauge,
        besoins: f.besoins,
        description: f.description,
      })
    );
    setEnvoi(false);
    if (ok) {
      setF({ ...VIDE, structure: f.structure, contact: f.contact });
      charger();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <Card title="Demande d'événement ou d'animation">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Le service instruit les demandes dans l'ordre d'arrivée. Tout événement doit être déposé au moins 6 mois avant sa date : au-delà, sa faisabilité n'est pas garantie."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <Champ libelle="Direction, élu ou structure">
            <Input value={f.structure} onChange={(e) => setF({ ...f, structure: e.target.value })} placeholder="Ex. Mairie de quartier de Petite-Synthe" />
          </Champ>
          <Champ libelle="Téléphone ou courriel">
            <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
          </Champ>
          <Champ libelle="Intitulé de l'événement" large>
            <Input value={f.intitule} onChange={(e) => setF({ ...f, intitule: e.target.value })} />
          </Champ>
          <Champ libelle="Date souhaitée">
            <DatePicker format="DD/MM/YYYY" value={f.date} onChange={(date) => setF({ ...f, date })} disabledDate={(d) => d.isBefore(dayjs(), 'day')} style={{ width: '100%' }} />
          </Champ>
          <Champ libelle="Lieu envisagé">
            <Input value={f.lieu} onChange={(e) => setF({ ...f, lieu: e.target.value })} />
          </Champ>
          <Champ libelle="Nature">
            <Select value={f.type} onChange={(type) => setF({ ...f, type })} options={Object.entries(ref?.types ?? {}).map(([value, label]) => ({ value, label }))} style={{ width: '100%' }} />
          </Champ>
          <Champ libelle="Public attendu (nombre)">
            <InputNumber min={0} value={f.jauge} onChange={(v) => setF({ ...f, jauge: v === null ? null : Number(v) })} style={{ width: '100%' }} />
          </Champ>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Besoins identifiés</div>
            <Checkbox.Group value={f.besoins} onChange={(besoins) => setF({ ...f, besoins: besoins as string[] })} options={BESOINS} />
          </div>
          <Champ libelle="Description, objectifs, contraintes connues" large>
            <Input.TextArea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Champ>
        </div>
        {delai !== null && ref && delai < ref.delaiInscriptionJours && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={`Date à ${delai} jours : elle se situe dans la fenêtre des 6 mois. La demande sera examinée, mais sa faisabilité n'est pas garantie.`}
          />
        )}
        <Button type="primary" style={{ marginTop: 16 }} disabled={!valide} loading={envoi} onClick={envoyer}>
          Envoyer la demande
        </Button>
      </Card>

      <Card title="Suivi de mes demandes">
        <Table
          rowKey="_id"
          size="small"
          pagination={false}
          dataSource={demandes}
          locale={{ emptyText: 'Aucune demande déposée' }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Reçue le', key: 'r', width: 110, render: (_, d) => formatLong(d.createdAt) },
            {
              title: 'Demande',
              key: 'd',
              render: (_, d) => (
                <div>
                  <Text strong>{d.intitule}</Text>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{d.structure}</div>
                  {d.reponse && <div style={{ fontSize: 13 }}>{d.reponse}</div>}
                </div>
              ),
            },
            { title: 'Date souhaitée', key: 'ds', width: 130, render: (_, d) => formatLong(d.dateSouhaitee) },
            { title: 'Statut', key: 's', width: 130, render: (_, d) => <Tag color={STATUTS_DEMANDE[d.statut].couleur}>{STATUTS_DEMANDE[d.statut].libelle}</Tag> },
            {
              title: 'Avancement',
              key: 'a',
              width: 180,
              render: (_, d) =>
                d.avancement !== null && d.avancement !== undefined ? (
                  <div>
                    <Progress percent={d.avancement} size="small" />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      du rétroplanning
                    </Text>
                  </div>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
