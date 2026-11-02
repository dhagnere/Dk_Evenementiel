import { Alert, Checkbox, Space, Tag, Typography } from 'antd';
import type { ReferentielRetroplanning, SimulationProjet } from '../../types';
import { COULEURS_NIVEAU, formatLong, libelleModule } from '../../lib/projets';

const { Text } = Typography;

/**
 * Caractéristiques de l'événement : chaque case active des modules (tâches ajoutées) et/ou relève
 * le niveau d'un cran (majoration). L'effet de chaque case est écrit à côté, pour que le demandeur
 * comme le pilote voient pourquoi une tâche apparaît.
 */
export function CaracteristiquesEvenement({
  referentiel,
  criteres,
  onChange,
  disabled,
}: {
  referentiel: ReferentielRetroplanning;
  criteres: string[];
  onChange: (criteres: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox.Group value={criteres} onChange={(v) => onChange(v as string[])} disabled={disabled} style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '6px 16px', width: '100%' }}>
        {referentiel.criteres.map((c) => {
          const effets = [
            ...c.modules.map((m) => libelleModule(referentiel, m)),
            ...(c.majoration ? ['+1 niveau'] : []),
            ...(c.niveauMax ? ['niveau N4'] : []),
          ];
          return (
            <Checkbox key={c.code} value={c.code}>
              {c.libelle}
              {effets.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {' '}
                  · {effets.join(', ')}
                </Text>
              )}
            </Checkbox>
          );
        })}
      </div>
    </Checkbox.Group>
  );
}

/** Niveau, avec le détail du calcul : jauge, majorations, plafond. */
export function NiveauProjet({ niveau, libelle, base, majorations, multiSites }: { niveau: number; libelle: string; base: number; majorations: string[]; multiSites: boolean }) {
  const detail = multiSites
    ? 'événement multi-sites'
    : [`N${base} par la jauge`, ...majorations.map((m) => `+1 : ${m}`), ...(base + majorations.length > 4 ? ['plafonné à N4'] : [])].join(' · ');
  return (
    <Space wrap size={6}>
      <Tag color={COULEURS_NIVEAU[niveau]} style={{ fontWeight: 600 }}>
        N{niveau} · {libelle}
      </Tag>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {detail}
      </Text>
    </Space>
  );
}

/**
 * Ce que donnerait l'événement : niveau, modules, jalons, dates de non-retour et tâches devenues
 * infaisables. C'est le calendrier qui dit ce qui n'est plus faisable, pas le service.
 */
export function ApercuSimulation({ simulation, referentiel }: { simulation: SimulationProjet; referentiel: ReferentielRetroplanning }) {
  const depassees = simulation.nonRetour.filter((n) => n.depassee);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <NiveauProjet niveau={simulation.niveau} libelle={simulation.niveauLibelle} base={simulation.base} majorations={simulation.majorations} multiSites={simulation.multiSites} />
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Modules :{' '}
        </Text>
        {simulation.modules.map((m) => (
          <Tag key={m.code}>{m.libelle}</Tag>
        ))}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {simulation.nombreTaches} tâches
        </Text>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {simulation.jalons.length} rendez-vous :{' '}
        </Text>
        {simulation.jalons.map((j) => (
          <Tag key={j.code} color={j.passe ? 'red' : undefined}>
            {j.code} {j.libelle} · {formatLong(j.date)}
          </Tag>
        ))}
      </div>
      {simulation.nonRetour.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Dates de non-retour :{' '}
          </Text>
          {simulation.nonRetour.map((n) => (
            <Tag key={n.module} color={n.depassee ? 'red' : 'default'}>
              {n.libelle} : {formatLong(n.date)}
            </Tag>
          ))}
        </div>
      )}
      {(depassees.length > 0 || simulation.infaisables.length > 0) && (
        <Alert
          type="error"
          showIcon
          message={`À ${simulation.restant} jours de l'événement, certaines étapes ne sont plus réalisables dans les délais`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {depassees.map((n) => (
                <li key={n.module}>
                  {n.libelle} : date de non-retour dépassée ({formatLong(n.date)}, {n.delai} jours avant J).
                </li>
              ))}
              {simulation.infaisables.map((t) => (
                <li key={t.code}>
                  {t.libelle} ({libelleModule(referentiel, t.module)}) : {t.incompressibleJours} jours incompressibles.
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
