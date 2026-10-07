/**
 * Rapport de la visite effectuée (RPT-001 à RPT-005, RPT-008) : l'objectif prévu, le résultat
 * obtenu, les produits présentés dans l'ordre avec le retour du prescripteur, le résumé, la
 * prochaine action, les échantillons et cadeaux remis, puis les champs propres au pays.
 * Il s'enregistre tout seul (RPT-009) : sur le téléphone à chaque changement, au serveur dès que
 * le réseau le permet ; déjà ouvert une fois, il se complète sans réseau. La soumission hors
 * connexion arrive en 0.5.7.
 */
import type {
  Correction,
  DefinitionChamp,
  Rapport,
  ValeursChamps,
  VisiteProgramme,
} from '@innov/api-client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Switch, View } from 'react-native';
import { ActionPrecedente } from './ActionPrecedente';
import {
  envoyerAttente,
  estTransitoire,
  lireAttente,
  mettreEnAttente,
  nouvelIdentifiant,
} from './Brouillons';
import {
  garderRapport,
  garderSaisie,
  garderSoumission,
  lireBrouillonRapport,
  marquerEnvoye,
  oublierBrouillon,
  type SaisieLocale,
} from './BrouillonRapport';
import { Alerte, Bouton, Carte, Champ, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';
import i18n from './i18n';
import { PiecesJointes } from './PiecesJointes';
import { ProchaineAction } from './ProchaineAction';
import { ProduitsPresentes, Remises } from './RapportProduits';
import { changerVisite, useVisiteDuProgramme } from './Execution';
import { nomProspect } from './Fiches';
import { messageErreur, useSession } from './session';

const SOCLE = [
  'produits',
  'retours',
  'resultat',
  'resume',
  'prochaine_action_type',
  'prochaine_action',
] as const;
const MODIFIABLES = new Set(['brouillon', 'a_corriger', 'rouvert']);

type Saisie = SaisieLocale;

function saisieDe(rapport: Rapport): Saisie {
  return {
    presentations: rapport.presentations,
    remises: rapport.remises,
    resultat: rapport.resultat,
    resultat_obtenu: rapport.resultat_obtenu,
    resume: rapport.resume,
    prochaine_action: rapport.prochaine_action,
    prochaine_action_type: rapport.prochaine_action_type,
    prochaine_action_echeance: rapport.prochaine_action_echeance,
    visite_proposee: rapport.visite_proposee,
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
    prochaine_action_type: saisie.prochaine_action_type != null,
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

/** « mar. 20 oct. » : une date du rapport, lisible. */
function dateCourte(iso: string) {
  return new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
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
      <Bloc
        libelle={t('rapport.prochaineAction')}
        valeur={
          [
            libelleDe(rapport.types_action_proposes, rapport.prochaine_action_type),
            rapport.prochaine_action,
            rapport.prochaine_action_echeance
              ? t('rapport.echeanceLe', { date: dateCourte(rapport.prochaine_action_echeance) })
              : '',
            rapport.visite_proposee ? t('rapport.visiteProposeeLue') : '',
          ]
            .filter((x) => x && x !== '—')
            .join('\n') || '—'
        }
      />
      {rapport.definitions.map((d) => (
        <Bloc key={d.code} libelle={d.libelle} valeur={valeur(d)} />
      ))}
    </View>
  );
}

export function FormulaireRapport({
  id,
  surGarde,
}: {
  id: string;
  /** État d'enregistrement en une ligne, pour l'en-tête toujours visible de l'écran. */
  surGarde?: (texte: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const { programme, visite } = useVisiteDuProgramme(id);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<'soumettre' | null>(null);
  const [message, setMessage] = useState<{ texte: string; ton: 'erreur' | 'succes' } | null>(null);

  const [tentative, setTentative] = useState(0);
  // RPT-009 : où la saisie est gardée, et depuis quand.
  const [garde, setGarde] = useState<{ ou: 'telephone' | 'serveur'; le: Date } | null>(null);
  const [repris, setRepris] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  // RPT-010 : soumis sur le téléphone sans réseau, à cette heure ; en attente d'envoi.
  const [soumisLocal, setSoumisLocal] = useState<string | null>(null);
  const modifie = useRef(false);
  // L'heure d'ouverture de l'écran suffit pour dire si l'échéance est passée.
  const [ouvertLe] = useState(() => Date.now());

  useEffect(() => {
    surGarde?.(
      soumisLocal
        ? t('rapport.soumissionEnAttente')
        : garde
          ? t(
              garde.ou === 'serveur' ? 'rapport.gardeServeurCourt' : 'rapport.gardeTelephoneCourt',
              {
                heure: garde.le.toTimeString().slice(0, 5),
              },
            )
          : undefined,
    );
  }, [garde, soumisLocal, surGarde, t]);

  useEffect(() => {
    let actif = true;
    void (async () => {
      const local = await lireBrouillonRapport(id);
      // La fin de visite restée dans la file part d'abord : le serveur doit la connaître.
      await envoyerAttente(client).catch(() => 0);
      try {
        const r = await client.visites.rapport(id);
        await garderRapport(id, r);
        if (!actif) return;
        // Une saisie faite sur le téléphone, pas encore reçue par le serveur, l'emporte.
        const enCours = local?.saisie && !local.envoye && MODIFIABLES.has(r.statut);
        setRapport(r);
        setSaisie(enCours ? local.saisie : saisieDe(r));
        setRepris(!!enCours);
        setHorsLigne(false);
        setSoumisLocal(local?.soumis_le && MODIFIABLES.has(r.statut) ? local.soumis_le : null);
        // Repris : il sera renvoyé à la prochaine saisie ou depuis la file.
        if (enCours && local.modifie_le)
          setGarde({ ou: 'telephone', le: new Date(local.modifie_le) });
      } catch (e) {
        if (!actif) return;
        if (estTransitoire(e) && local) {
          // Sans réseau : le rapport déjà ouvert une fois se complète sur le téléphone.
          setRapport(local.rapport);
          setSaisie(local.saisie ?? saisieDe(local.rapport));
          setHorsLigne(true);
          setSoumisLocal(local.soumis_le ?? null);
          if (local.saisie && !local.envoye && local.modifie_le)
            setGarde({ ou: 'telephone', le: new Date(local.modifie_le) });
          return;
        }
        setErreurChargement(
          estTransitoire(e) ? t('rapport.horsLigne') : messageErreur(e, t('erreurs.reseau')),
        );
      }
    })();
    return () => {
      actif = false;
    };
  }, [client, id, t, tentative]);

  // Enregistrement automatique : sur le téléphone aussitôt, puis au serveur quand la saisie
  // se pose ; sans réseau, l'envoi attend dans la file.
  useEffect(() => {
    if (!rapport || !saisie || !modifie.current || !MODIFIABLES.has(rapport.statut)) return;
    if (soumisLocal) return;
    const minuteur = setTimeout(() => {
      void (async () => {
        await garderSaisie(id, rapport, saisie);
        try {
          const r = await client.visites.enregistrerRapport(id, saisie);
          await marquerEnvoye(id, r);
          modifie.current = false;
          setRapport((avant) => (avant ? { ...r, pieces_jointes: avant.pieces_jointes } : r));
          setGarde({ ou: 'serveur', le: new Date() });
          setHorsLigne(false);
          await changerVisite(id, { rapport_statut: r.statut });
        } catch (e) {
          if (!estTransitoire(e)) {
            setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
            return;
          }
          setGarde({ ou: 'telephone', le: new Date() });
          const file = await lireAttente().catch(() => []);
          if (!file.some((x) => x.type === 'brouillon_rapport' && x.visite === id))
            await mettreEnAttente({
              id: nouvelIdentifiant(),
              type: 'brouillon_rapport',
              visite: id,
              resume: t('rapport.titre'),
            });
        }
      })();
    }, 800);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la saisie déclenche l'envoi
  }, [saisie]);

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

  if (soumisLocal)
    return (
      <View style={{ gap: 12 }}>
        <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
        <Alerte type="info">
          {t('rapport.soumisTelephone', {
            heure: new Date(soumisLocal).toTimeString().slice(0, 5),
          })}
        </Alerte>
        <RapportLu rapport={{ ...rapport, ...saisie }} />
      </View>
    );

  if (!MODIFIABLES.has(rapport.statut))
    return (
      <View style={{ gap: 12 }}>
        <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
        {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
        {!message && (
          <Alerte type={rapport.en_retard ? 'attention' : 'succes'}>
            {t(rapport.en_retard ? 'rapport.soumisEnRetard' : 'rapport.soumisLe')}
          </Alerte>
        )}
        <RapportLu rapport={rapport} />
        <PiecesJointes
          rapport={rapport}
          visite={id}
          modifiable={false}
          surRapport={(pieces_jointes) => setRapport({ ...rapport, pieces_jointes })}
        />
      </View>
    );

  const manquants = manquantsDe(saisie, rapport.definitions);
  // RG-032 : attendu avant minuit, heure du pays, le jour de la visite.
  // Déjà soumis une fois (correction demandée) : seul le retard de la première soumission compte.
  const enRetard =
    rapport.en_retard ||
    (!rapport.soumis_le && !!rapport.echeance && ouvertLe >= Date.parse(rapport.echeance));
  const libelleManquant = (code: string) =>
    (SOCLE as readonly string[]).includes(code)
      ? t(`rapport.socle.${code}`)
      : (rapport.definitions.find((d) => d.code === code)?.libelle ?? code);
  const changer = (champs: Partial<Saisie>) => {
    setMessage(null);
    modifie.current = true;
    setSaisie({ ...saisie, ...champs });
  };
  async function agir(action: 'soumettre') {
    if (!saisie) return;
    setEnvoi(action);
    setMessage(null);
    // RPT-010 CA1 : l'heure du geste, sur le téléphone, fait foi même si l'envoi attend.
    const soumisLe = new Date().toISOString();
    try {
      await client.visites.enregistrerRapport(id, saisie);
      const r = await client.visites.soumettreRapport(id, soumisLe);
      modifie.current = false;
      setRapport(r);
      setSaisie(saisieDe(r));
      await oublierBrouillon(id);
      await changerVisite(id, { rapport_statut: r.statut });
      setMessage({ texte: t('rapport.soumis'), ton: 'succes' });
    } catch (e) {
      if (!estTransitoire(e) || !rapport) {
        setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
        return;
      }
      // Sans réseau : la soumission attend dans la file et partira seule (RPT-010).
      modifie.current = false;
      await garderSoumission(id, rapport, saisie, soumisLe);
      await mettreEnAttente({
        id: nouvelIdentifiant(),
        type: 'soumission_rapport',
        visite: id,
        soumis_le: soumisLe,
        resume: t('rapport.titre'),
      });
      await changerVisite(id, { rapport_statut: 'soumis' });
      setSoumisLocal(soumisLe);
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <EnteteVisite visite={visite} fuseau={programme?.fuseau} />
        {!enRetard && !rapport.soumis_le && <Texte variante="discret">{t('rapport.delai')}</Texte>}
      </View>
      {rapport.statut === 'a_corriger' && (
        <Alerte type="attention">
          {rapport.correction
            ? texteCorrection(rapport.correction, rapport.definitions, t, i18n.language)
            : t('rapport.aCorriger')}
        </Alerte>
      )}
      {enRetard && <Alerte type="attention">{t('rapport.retard')}</Alerte>}
      {horsLigne && <Alerte type="attention">{t('rapport.horsLigneLocal')}</Alerte>}
      {repris && !horsLigne && <Alerte type="info">{t('rapport.repris')}</Alerte>}

      <ObjectifPrevu rapport={rapport} />
      <ActionPrecedente action={rapport.action_precedente} />
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
      <ProchaineAction
        rapport={rapport}
        saisie={saisie}
        jourVisite={visite?.date ?? new Date().toISOString().slice(0, 10)}
        surChangement={changer}
      />

      <Remises
        rapport={rapport}
        presentations={saisie.presentations}
        remises={saisie.remises}
        surChangement={(remises) => changer({ remises })}
      />

      <PiecesJointes
        rapport={rapport}
        visite={id}
        modifiable
        surRapport={(pieces_jointes) => setRapport({ ...rapport, pieces_jointes })}
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
        {garde && (
          <Texte variante="discret" accessibilityLiveRegion="polite">
            {t(garde.ou === 'serveur' ? 'rapport.gardeServeur' : 'rapport.gardeTelephone', {
              heure: garde.le.toTimeString().slice(0, 5),
            })}
          </Texte>
        )}
      </View>
    </View>
  );
}

/** RPT-014 : qui demande quoi, quand, et les parties à revoir. */
function texteCorrection(
  c: Correction,
  definitions: Rapport['definitions'],
  t: ReturnType<typeof useTranslation>['t'],
  langue: string,
): string {
  const le = new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(c.le));
  const parties = c.champs.map((code) =>
    PARTIES_SOCLE.includes(code)
      ? t(`correction.parties.${code}`)
      : (definitions.find((d) => d.code === code)?.libelle ?? code),
  );
  return [
    t('correction.demandee', { date: le, par: c.par }),
    `« ${c.commentaire} »`,
    parties.length ? t('correction.aRevoir', { champs: parties.join(', ') }) : null,
  ]
    .filter(Boolean)
    .join('\n');
}

const PARTIES_SOCLE = [
  'presentations',
  'remises',
  'resultat',
  'resume',
  'prochaine_action',
  'pieces_jointes',
];
