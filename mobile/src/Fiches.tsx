/**
 * Fiches consultées par le délégué sur le terrain : tout ce qu'il cherche sur un prospect ou un
 * établissement, sur un seul écran, avec l'appel et l'itinéraire en un toucher.
 *
 * En ligne, la fiche vient du serveur (PRP-002, PRP-003) avec ses lieux d'exercice (PRP-004).
 * Sans réseau, le prospect de sa liste cible enregistrée sur le téléphone suffit à l'appeler et
 * à retrouver son lieu principal (PRP-011 CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type {
  Etablissement,
  Exercice,
  ListeCible,
  Prospect,
  ProspectCible,
} from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { lire } from './baseLocale';
import { Alerte, Carte, Etiquette, Ligne, MarquePotentiel, Texte, usePalette } from './composants';
import { VisitesPrecedentes } from './Chronologie';
import { ProposerCorrection } from './Proposition';
import { useSession } from './session';

type Traduire = (cle: string, options?: Record<string, unknown>) => string;

export function nomProspect(
  p: { civilite?: string; prenom?: string; nom: string },
  t: Traduire,
): string {
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

/** Cible de la liste enregistrée sur le téléphone, pour la fréquence et le mode hors ligne. */
async function cibleEnregistree(id: string) {
  const memoire = await lire<ListeCible[]>('ciblage.moi').catch(() => null);
  for (const liste of memoire?.valeur ?? []) {
    const cible = liste.cibles.find((c) => c.prospect.id === id);
    if (cible) return cible;
  }
  return null;
}

function itineraire(destination: string) {
  const adresse = encodeURIComponent(destination);
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?daddr=${adresse}`
    : `https://www.google.com/maps/dir/?api=1&destination=${adresse}`;
}

/** Action de contact : une ligne de 56 px, le geste principal du terrain. */
function Action({
  icone,
  libelle,
  detail,
  lien,
  derniere,
}: {
  icone: 'call' | 'mail' | 'directions';
  libelle: string;
  detail: string;
  lien: string;
  derniere?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${libelle} ${detail}`}
      onPress={() => void Linking.openURL(lien)}
      style={({ pressed }) => [
        styles.action,
        derniere && { borderBottomWidth: 0 },
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : 'transparent' },
      ]}
    >
      <MaterialIcons name={icone} size={22} color={p.texte} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="fort">{libelle}</Texte>
        <Texte variante="discret" numberOfLines={1}>
          {detail}
        </Texte>
      </View>
    </Pressable>
  );
}

/** Ligne touchable menant à une autre fiche. */
function Lien({
  titre,
  detail,
  marque,
  onPress,
  derniere,
}: {
  titre: string;
  detail?: string;
  marque?: React.ReactNode;
  onPress: () => void;
  derniere?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.lien,
        derniere && { borderBottomWidth: 0 },
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : 'transparent' },
      ]}
    >
      {marque}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="fort">{titre}</Texte>
        {detail ? <Texte variante="discret">{detail}</Texte> : null}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={p.texteDiscret} />
    </Pressable>
  );
}

export function FicheProspect({ id }: { id: string }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { client } = useSession();
  const [fiche, setFiche] = useState<Prospect | null>(null);
  const [lieux, setLieux] = useState<Exercice[] | null>(null);
  const [cible, setCible] = useState<Awaited<ReturnType<typeof cibleEnregistree>>>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    let actif = true;
    void cibleEnregistree(id).then((c) => actif && setCible(c));
    Promise.all([client.prospects.detail(id), client.exercices.duProspect(id)])
      .then(([p, e]) => {
        if (!actif) return;
        setFiche(p);
        setLieux(e.filter((x) => x.actif));
      })
      .catch(async () => {
        const c = await cibleEnregistree(id);
        if (!actif) return;
        if (c) setHorsLigne(true);
        else setIntrouvable(true);
      });
    return () => {
      actif = false;
    };
  }, [client, id]);

  if (introuvable) return <Alerte type="erreur">{t('fiche.introuvable')}</Alerte>;
  // Hors ligne : la fiche de la liste enregistrée (nom, métier, lieu principal, téléphones).
  const base: ProspectCible | null = fiche
    ? { ...fiche, secteur: fiche.secteur?.libelle ?? null }
    : (cible?.prospect ?? null);
  if (!base) return <Texte variante="discret">{t('session.chargement')}</Texte>;

  const metier = [base.specialite_libelle ?? base.type_libelle, fiche?.grade_libelle]
    .filter(Boolean)
    .join(' · ');
  const telephones = [
    { numero: base.telephone_mobile, libelle: t('fiche.appelerMobile') },
    { numero: base.telephone_pro, libelle: t('fiche.appelerPro') },
  ].filter((x): x is { numero: string; libelle: string } => Boolean(x.numero));

  const informations = (
    fiche
      ? [
          [t('prospect.champs.numeroOrdre'), fiche.numero_ordre],
          [t('lieu.exercice'), fiche.activite ? t(`lieu.exercices.${fiche.activite}`) : ''],
          [t('etablissement.champs.secteur'), fiche.secteur?.libelle],
          [t('etablissement.champs.localite'), fiche.localite?.libelle],
        ]
      : []
  ).filter((x): x is [string, string] => Boolean(x[1]));

  return (
    <>
      {horsLigne && <Alerte type="attention">{t('fiche.horsLigne')}</Alerte>}
      <View style={styles.entete}>
        <MarquePotentiel
          valeur={base.potentiel}
          libelle={t(`prospect.potentiels.${base.potentiel}`)}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="titre">{nomProspect(base, t)}</Texte>
          {metier ? <Texte variante="discret">{metier}</Texte> : null}
          <Texte variante="discret">
            {cible ? t('fiche.dansMaListe', { count: cible.frequence }) : t('fiche.horsMaListe')}
          </Texte>
        </View>
        {base.statut === 'a_valider' && <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>}
      </View>

      <Carte style={styles.bloc}>
        {telephones.length === 0 && !fiche?.courriel ? (
          <Texte variante="discret" style={{ paddingVertical: 8 }}>
            {t('fiche.aucunContact')}
          </Texte>
        ) : (
          <>
            {telephones.map((x, i) => (
              <Action
                key={x.numero}
                derniere={i === telephones.length - 1 && !fiche?.courriel}
                icone="call"
                libelle={x.libelle}
                detail={x.numero}
                lien={`tel:${x.numero.replace(/\s/g, '')}`}
              />
            ))}
            {fiche?.courriel ? (
              <Action
                icone="mail"
                libelle={t('fiche.ecrire')}
                detail={fiche.courriel}
                lien={`mailto:${fiche.courriel}`}
                derniere
              />
            ) : null}
          </>
        )}
      </Carte>

      {fiche?.statut === 'actif' && (
        <ProposerCorrection
          objet="prospect"
          id={fiche.id}
          actuels={{
            telephone_mobile: fiche.telephone_mobile,
            telephone_pro: fiche.telephone_pro,
            courriel: fiche.courriel,
            numero_ordre: fiche.numero_ordre,
          }}
        />
      )}

      <Carte style={styles.bloc}>
        <Texte variante="libelle">{t('fiche.lieux')}</Texte>
        {lieux === null ? (
          base.lieu_principal ? (
            <Lien
              titre={base.lieu_principal.libelle}
              derniere
              onPress={() => routeur.push(`/lieu/${base.lieu_principal!.id}`)}
            />
          ) : (
            <Texte variante="discret">{t('fiche.aucunLieu')}</Texte>
          )
        ) : lieux.length === 0 ? (
          <Texte variante="discret" style={{ paddingVertical: 8 }}>
            {t('fiche.aucunLieu')}
          </Texte>
        ) : (
          lieux.map((e, i) => (
            <Lien
              key={e.id}
              derniere={i === lieux.length - 1}
              titre={e.etablissement.nom}
              detail={[
                e.etablissement.type_libelle,
                e.etablissement.localite ?? e.etablissement.secteur,
                e.principal ? t('fiche.principal') : '',
                e.presence ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => routeur.push(`/lieu/${e.etablissement.id}`)}
            />
          ))
        )}
      </Carte>

      <VisitesPrecedentes prospect={id} />

      {informations.length > 0 && (
        <Carte style={styles.bloc}>
          <Texte variante="libelle">{t('fiche.informations')}</Texte>
          {informations.map(([libelle, valeur], k) => (
            <Ligne
              key={libelle}
              libelle={libelle}
              valeur={valeur}
              derniere={k === informations.length - 1}
            />
          ))}
        </Carte>
      )}
    </>
  );
}

export function FicheEtablissement({ id }: { id: string }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { client } = useSession();
  const [fiche, setFiche] = useState<Etablissement | null>(null);
  const [exercent, setExercent] = useState<Exercice[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;
    Promise.all([client.etablissements.detail(id), client.exercices.deLEtablissement(id)])
      .then(([e, x]) => {
        if (!actif) return;
        setFiche(e);
        setExercent(x.filter((y) => y.actif));
      })
      .catch(() => actif && setErreur(true));
    return () => {
      actif = false;
    };
  }, [client, id]);

  if (erreur) return <Alerte type="attention">{t('fiche.lieuHorsLigne')}</Alerte>;
  if (!fiche) return <Texte variante="discret">{t('session.chargement')}</Texte>;

  const ou = [fiche.adresse, fiche.localite?.libelle, fiche.secteur.libelle]
    .filter(Boolean)
    .join(', ');
  const destination =
    fiche.latitude !== null && fiche.longitude !== null
      ? `${fiche.latitude},${fiche.longitude}`
      : [fiche.nom, ou].join(', ');

  return (
    <>
      <View style={styles.entete}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="titre">{fiche.nom}</Texte>
          <Texte variante="discret">{[fiche.type_libelle, ou].filter(Boolean).join(' · ')}</Texte>
        </View>
        {fiche.statut === 'a_valider' && <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>}
      </View>

      <Carte style={styles.bloc}>
        {fiche.telephone ? (
          <Action
            icone="call"
            libelle={t('fiche.appeler')}
            detail={fiche.telephone}
            lien={`tel:${fiche.telephone.replace(/\s/g, '')}`}
          />
        ) : null}
        <Action
          icone="directions"
          libelle={t('fiche.itineraire')}
          detail={fiche.latitude !== null ? t('fiche.positionGps') : ou || fiche.nom}
          lien={itineraire(destination)}
          derniere
        />
      </Carte>

      {fiche.statut === 'actif' && (
        <ProposerCorrection
          objet="etablissement"
          id={fiche.id}
          actuels={{ adresse: fiche.adresse, telephone: fiche.telephone }}
        />
      )}

      <Carte style={styles.bloc}>
        <Texte variante="libelle">{t('fiche.quiExerceIci')}</Texte>
        {exercent === null || exercent.length === 0 ? (
          <Texte variante="discret" style={{ paddingVertical: 8 }}>
            {t('fiche.personne')}
          </Texte>
        ) : (
          exercent.map((x, i) => (
            <Lien
              key={x.id}
              derniere={i === exercent.length - 1}
              marque={
                <MarquePotentiel
                  valeur={x.prospect.potentiel}
                  libelle={t(`prospect.potentiels.${x.prospect.potentiel}`)}
                />
              }
              titre={nomProspect(x.prospect, t)}
              detail={[x.prospect.specialite_libelle, x.presence ?? ''].filter(Boolean).join(' · ')}
              onPress={() => routeur.push(`/fiche/${x.prospect.id}`)}
            />
          ))
        )}
      </Carte>
    </>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bloc: { paddingVertical: 4, gap: 0 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lien: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
