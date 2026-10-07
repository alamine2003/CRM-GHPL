/**
 * Rapport de la visite effectuée (RPT-001 à RPT-005, RPT-008) : l'objectif prévu, le résultat
 * obtenu, les produits présentés dans l'ordre avec le retour du prescripteur, le résumé, la
 * prochaine action, les échantillons et cadeaux remis, puis les champs propres au pays.
 * Il s'enregistre en brouillon et se soumet une fois complet. En 0.5.1 il s'écrit avec du
 * réseau ; la saisie hors connexion arrive avec la synchronisation des rapports (0.5.6).
 */
import type {
  DefinitionChamp,
  Rapport,
  SaisieRapport,
  ValeursChamps,
  VisiteProgramme,
} from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Switch, View } from 'react-native';
import { envoyerAttente, estTransitoire } from './Brouillons';
import { Alerte, Bouton, Carte, Champ, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';
import { ProduitsPresentes, Remises } from './RapportProduits';
import { changerVisite, useVisiteDuProgramme } from './Execution';
import { nomProspect } from './Fiches';
import { messageErreur, useSession } from './session';

const SOCLE = ['produits', 'retours', 'resultat', 'resume', 'prochaine_action'] as const;
const MODIFIABLES = new Set(['brouillon', 'a_corriger', 'rouvert']);

type Saisie = Required<Omit<SaisieRapport, 'champs'>> & { champs: ValeursChamps };

function saisieDe(rapport: Rapport): Saisie {
  return {
    presentations: rapport.presentations,
    remises: rapport.remises,
    resultat: rapport.resultat,
    resultat_obtenu: rapport.resultat_obtenu,
    resume: rapport.resume,
    prochaine_action: rapport.prochaine_action,
    champs: (rapport.champs ?? {}) as ValeursChamps,
  };
}

/** Ce qui manque avant de soumettre, comme le serveur le calcule (RPT-002 CA1). */
export function manquantsDe(saisie: Saisie, definitions: DefinitionChamp[]): string[] {
  const rempli = {
    produits: saisie.presentations.length > 0,
    retours: saisie.presentations.every((x) => !!x.retour),
    resultat: saisie.resultat != null,
    resume: saisie.resume.trim() !== '',
    prochaine_action: saisie.prochaine_action.trim() !== '',
  };
  return [
    ...SOCLE.filter((c) => !rempli[c]),
    ...definitions
      .filter(
        (d) =>
          d.obligatoire &&
          [null, undefined, '', false].some((vide) => vide === saisie.champs[d.code]),
      )
      .map((d) => d.code),
  ];
}

/** Un nombre saisi au clavier (virgule ou point) ; vide si rien. */
function nombreDe(texte: string): number | string | null {
  const net = texte.trim().replace(',', '.');
  if (!net) return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : texte;
}

function ChampPays({
  definition,
  valeur,
  surValeur,
}: {
  definition: DefinitionChamp;
  valeur: ValeursChamps[string] | undefined;
  surValeur: (v: ValeursChamps[string]) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const libelle = definition.obligatoire
    ? definition.libelle
    : t('rapport.facultatif', { libelle: definition.libelle });
  if (definition.type === 'case')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <Texte style={{ flex: 1 }}>{libelle}</Texte>
        <Switch
          accessibilityLabel={definition.libelle}
          value={valeur === true}
          onValueChange={surValeur}
          trackColor={{ true: p.succes }}
        />
      </View>
    );
  if (definition.type === 'liste')
    return (
      <View style={{ gap: 6 }}>
        <Texte variante="libelle">{libelle}</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {definition.options.map((o) => (
            <Pilule
              key={o}
              libelle={o}
              actif={valeur === o}
              onPress={() => surValeur(valeur === o ? null : o)}
            />
          ))}
        </View>
      </View>
    );
  return (
    <Champ
      libelle={libelle}
      value={valeur == null ? '' : String(valeur)}
      onChangeText={(texte) => surValeur(definition.type === 'nombre' ? nombreDe(texte) : texte)}
      keyboardType={definition.type === 'nombre' ? 'decimal-pad' : 'default'}
      maxLength={definition.type === 'nombre' ? 12 : 500}
      multiline={definition.type === 'texte'}
    />
  );
}

/** Rappel de la visite en tête du rapport : prospect, lieu, heures. */
function EnteteVisite({
  visite,
  fuseau,
}: {
  visite: VisiteProgramme | undefined;
  fuseau?: string;
}) {
  const { t } = useTranslation();
  if (!visite) return null;
  const heure = (iso: string | null) => {
    if (!iso) return visite.heure;
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: fuseau,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toTimeString().slice(0, 5);
    }
  };
  return (
    <View style={{ gap: 2 }}>
      <Texte variante="fort">
        {visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect')}
      </Texte>
      <Texte variante="discret">
        {[visite.etablissement?.nom, [heure(visite.debut_le), heure(visite.fin_le)].join('–')]
          .filter(Boolean)
          .join(' · ')}
      </Texte>
    </View>
  );
}

/** L'objectif planifié, en tête du rapport (RPT-003 CA1) ; la justification d'une imprévue. */
function ObjectifPrevu({ rapport }: { rapport: Rapport }) {
  const { t } = useTranslation();
  const [libelle, texte] = rapport.objectif_prevu
    ? [t('rapport.objectifPrevu'), rapport.objectif_prevu]
    : rapport.est_imprevue
      ? [t('rapport.imprevue'), rapport.justification]
      : [t('rapport.objectifPrevu'), t('rapport.sansObjectif')];
  return (
    <Carte>
      <View style={{ gap: 2 }}>
        <Texte variante="libelle">{libelle}</Texte>
        <Texte variante={rapport.objectif_prevu || rapport.est_imprevue ? 'fort' : 'discret'}>
          {texte}
        </Texte>
      </View>
    </Carte>
  );
}

function Bloc({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Texte variante="libelle">{libelle}</Texte>
      <Texte>{valeur}</Texte>
    </View>
  );
}

/** Le rapport soumis, en lecture : ce qui a été transmis au superviseur. */
function RapportLu({ rapport }: { rapport: Rapport }) {
  const { t } = useTranslation();
  const champs = (rapport.champs ?? {}) as ValeursChamps;
  const libelleDe = (liste: { id: string; libelle: string }[], id: string | null) =>
    liste.find((x) => x.id === id)?.libelle ?? '—';
  const valeur = (d: DefinitionChamp) => {
    const v = champs[d.code];
    if (d.type === 'case') return v ? t('rapport.oui') : t('rapport.non');
    return v == null || v === '' ? '—' : String(v);
  };
  // Libellé au-dessus de la valeur : les textes longs (résumé) gardent toute la largeur.
  return (
    <View style={{ gap: 14 }}>
      <ObjectifPrevu rapport={rapport} />
      <Bloc
        libelle={t('rapport.resultat')}
        valeur={[libelleDe(rapport.resultats_proposes, rapport.resultat), rapport.resultat_obtenu]
          .filter(Boolean)
          .join('\n')}
      />
      <Bloc
        libelle={t('rapport.produits')}
        valeur={
          rapport.presentations
            .map(
              (x, i) =>
                `${i + 1}. ${x.libelle}${x.retour ? ` — ${t(`rapport.retours.${x.retour}`)}` : ''}`,
            )
            .join('\n') || '—'
        }
      />
      <Bloc
        libelle={t('rapport.remises')}
        valeur={
          rapport.remises
            .map((r) => `${t(`rapport.typesRemise.${r.type}`)} · ${r.libelle} × ${r.quantite}`)
            .join('\n') || t('rapport.aucuneRemise')
        }
      />
      <Bloc libelle={t('rapport.resume')} valeur={rapport.resume || '—'} />
      <Bloc libelle={t('rapport.prochaineAction')} valeur={rapport.prochaine_action || '—'} />
      {rapport.definitions.map((d) => (
        <Bloc key={d.code} libelle={d.libelle} valeur={valeur(d)} />
      ))}
    </View>
  );
}

export function FormulaireRapport({ id }: { id: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const { programme, visite } = useVisiteDuProgramme(id);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<'enregistrer' | 'soumettre' | null>(null);
  const [message, setMessage] = useState<{ texte: string; ton: 'erreur' | 'succes' } | null>(null);

  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let actif = true;
    // La fin de visite restée dans la file part d'abord : le serveur doit la connaître.
    void envoyerAttente(client)
      .catch(() => 0)
      .then(() => client.visites.rapport(id))
      .then(
        (r) => {
          if (!actif) return;
          setRapport(r);
          setSaisie(saisieDe(r));
        },
        (e: unknown) =>
          actif &&
          setErreurChargement(
            estTransitoire(e) ? t('rapport.horsLigne') : messageErreur(e, t('erreurs.reseau')),
          ),
      );
    return () => {
      actif = false;
    };
  }, [client, id, t, tentative]);

  if (erreurChargement)
    return (
      <View style={{ gap: 12 }}>
        <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
        <Alerte type="attention">{erreurChargement}</Alerte>
        <Bouton
          secondaire
          libelle={t('rapport.reessayer')}
          onPress={() => {
            setErreurChargement(null);
            setTentative((n) => n + 1);
          }}
        />
      </View>
    );
  if (!rapport || !saisie)
    return <ActivityIndicator accessibilityLabel={t('session.chargement')} />;

  if (!MODIFIABLES.has(rapport.statut))
    return (
      <View style={{ gap: 12 }}>
        <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
        {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
        {!message && <Alerte type="succes">{t('rapport.soumisLe')}</Alerte>}
        <RapportLu rapport={rapport} />
      </View>
    );

  const manquants = manquantsDe(saisie, rapport.definitions);
  const libelleManquant = (code: string) =>
    (SOCLE as readonly string[]).includes(code)
      ? t(`rapport.socle.${code}`)
      : (rapport.definitions.find((d) => d.code === code)?.libelle ?? code);
  const changer = (champs: Partial<Saisie>) => {
    setMessage(null);
    setSaisie({ ...saisie, ...champs });
  };
  async function agir(action: 'enregistrer' | 'soumettre') {
    if (!saisie) return;
    setEnvoi(action);
    setMessage(null);
    try {
      let r = await client.visites.enregistrerRapport(id, saisie);
      if (action === 'soumettre')
        r = await client.visites.soumettreRapport(id, new Date().toISOString());
      setRapport(r);
      setSaisie(saisieDe(r));
      await changerVisite(id, { rapport_statut: r.statut });
      setMessage({
        texte: t(action === 'soumettre' ? 'rapport.soumis' : 'rapport.enregistre'),
        ton: 'succes',
      });
    } catch (e) {
      setMessage({
        texte: estTransitoire(e)
          ? t('rapport.horsLigneEnvoi')
          : messageErreur(e, t('erreurs.reseau')),
        ton: 'erreur',
      });
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
      {rapport.statut === 'a_corriger' && (
        <Alerte type="attention">{t('rapport.aCorriger')}</Alerte>
      )}

      <ObjectifPrevu rapport={rapport} />
      <View style={{ gap: 6 }}>
        <Texte variante="sousTitre">{t('rapport.resultat')}</Texte>
        <Texte variante="discret">{t('rapport.resultatAide')}</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {rapport.resultats_proposes.map((r) => (
            <Pilule
              key={r.id}
              libelle={r.libelle}
              actif={saisie.resultat === r.id}
              onPress={() => changer({ resultat: saisie.resultat === r.id ? null : r.id })}
            />
          ))}
        </View>
        <View style={{ marginTop: 8 }}>
          <Champ
            libelle={t('rapport.resultatObtenu')}
            placeholder={t('rapport.resultatObtenuIndice')}
            value={saisie.resultat_obtenu}
            onChangeText={(resultat_obtenu) => changer({ resultat_obtenu })}
            maxLength={1000}
            multiline
          />
        </View>
      </View>

      <ProduitsPresentes
        rapport={rapport}
        presentations={saisie.presentations}
        surChangement={(presentations) => changer({ presentations })}
      />

      <Champ
        libelle={t('rapport.resume')}
        placeholder={t('rapport.resumeIndice')}
        value={saisie.resume}
        onChangeText={(resume) => changer({ resume })}
        maxLength={4000}
        multiline
      />
      <Champ
        libelle={t('rapport.prochaineAction')}
        placeholder={t('rapport.prochaineActionIndice')}
        value={saisie.prochaine_action}
        onChangeText={(prochaine_action) => changer({ prochaine_action })}
        maxLength={500}
        multiline
      />

      <Remises
        rapport={rapport}
        presentations={saisie.presentations}
        remises={saisie.remises}
        surChangement={(remises) => changer({ remises })}
      />

      {rapport.definitions.length > 0 && (
        <View style={{ gap: 12 }}>
          <Texte variante="sousTitre">{t('rapport.champsPays')}</Texte>
          {rapport.definitions.map((d) => (
            <ChampPays
              key={d.code}
              definition={d}
              valeur={saisie.champs[d.code]}
              surValeur={(v) => changer({ champs: { ...saisie.champs, [d.code]: v } })}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
        {manquants.length > 0 && (
          <Texte variante="discret">
            {t('rapport.manque', { liste: manquants.map(libelleManquant).join(', ') })}
          </Texte>
        )}
        <Bouton
          libelle={t('rapport.soumettre')}
          chargement={envoi === 'soumettre'}
          desactive={manquants.length > 0 || envoi !== null}
          onPress={() => void agir('soumettre')}
        />
        <Bouton
          secondaire
          libelle={t('rapport.enregistrer')}
          chargement={envoi === 'enregistrer'}
          desactive={envoi !== null}
          onPress={() => void agir('enregistrer')}
        />
      </View>
    </View>
  );
}
