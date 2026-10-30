import { useRef, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { UploadOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import { useAuth } from '../context/AuthContext';
import { useGeocodage } from '../context/GeocodageContext';

interface Props {
  onImported: () => void;
  /** Si fourni, affiche un bouton « Exporter PDF » (visible de tous, consultation comprise). */
  onExporterPdf?: () => void | Promise<void>;
}

/**
 * Boutons d'export CSV/PDF (tout le monde, consultation seule comprise — ce sont des actions de
 * lecture) et d'import CSV (admin uniquement), avec message de résultat.
 */
export function ImportExportEvenements({ onImported, onExporterPdf }: Props) {
  const { estAdministrateur } = useAuth();
  const { demarrer: demarrerGeocodage } = useGeocodage();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enCoursPdf, setEnCoursPdf] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const exporterCsv = () => {
    window.open('/api/import/evenements/export', '_blank');
  };

  const cliquerExporterPdf = async () => {
    if (!onExporterPdf) return;
    setEnCoursPdf(true);
    try {
      await onExporterPdf();
    } finally {
      setEnCoursPdf(false);
    }
  };

  const importerCsv = async (fichier: File) => {
    setEnCours(true);
    setMessage(null);
    setErreur(null);
    try {
      const form = new FormData();
      form.append('fichier', fichier);
      const res = await api.postForm<{
        ok: boolean;
        created: number;
        doublons: number;
        errors: string[];
      }>('/import/evenements', form);
      let texte = `${res.created} créé(s), ${res.doublons} doublon(s) ignoré(s) (déjà présents, non modifiés), ${res.errors.length} ligne(s) ignorée(s)`;
      if (res.errors.length > 0) {
        texte += ` : ${res.errors.slice(0, 5).join(' ; ')}${res.errors.length > 5 ? '…' : ''}`;
      }
      setMessage(texte);
      onImported();
      if (res.created > 0) demarrerGeocodage();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Échec de l'import : impossible de contacter le serveur.");
    } finally {
      setEnCours(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <Space wrap>
        <Button icon={<DownloadOutlined />} onClick={exporterCsv}>
          Exporter CSV
        </Button>
        {onExporterPdf && (
          <Button icon={<FilePdfOutlined />} loading={enCoursPdf} onClick={cliquerExporterPdf}>
            Exporter PDF
          </Button>
        )}
        {estAdministrateur && (
          <>
            <Button type="primary" icon={<UploadOutlined />} loading={enCours} onClick={() => inputRef.current?.click()}>
              Importer CSV
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => e.target.files?.[0] && importerCsv(e.target.files[0])}
            />
          </>
        )}
      </Space>
      {message && (
        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, background: '#e6f4ff', color: '#0958d9', padding: '6px 12px', borderRadius: 6 }}>
          {message}
        </Typography.Paragraph>
      )}
      {erreur && (
        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, background: '#fff1f0', color: '#cf1322', padding: '6px 12px', borderRadius: 6 }}>
          {erreur}
        </Typography.Paragraph>
      )}
    </div>
  );
}
