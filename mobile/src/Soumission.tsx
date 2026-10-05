/**
 * Soumission du planning au superviseur (PLN-008, 0.2.8) : l'échéance du pays (RG-013), le
 * contrôle final côté serveur (PLN-004), puis l'état « Soumis le … », marqué en retard si
 * l'échéance était passée (RG-016). La soumission demande le réseau : rien ne part en file.
 */
import type { Semaine } from '@innov/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Alerte, Bouton, Carte, Etiquette, Texte, usePalette } from './composants';
import { messageErreur, useSession } from './session';

/** « jeudi 8 octobre à 18:00 », dans la langue du délégué. */
export function dateHeure(iso: string, langue: string) {
  return new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Ligne d'état sous le statut : l'échéance tant qu'on prépare, la date de soumission après. */
export function EtatSoumission({
  planning,
  modifiable,
}: {
  planning: NonNullable<Semaine['planning']>;
  modifiable: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (planning.soumis_le && !modifiable) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
        <Texte variante="discret">
          {t('soumission.soumisLe', { date: dateHeure(planning.soumis_le, i18n.language) })}
        </Texte>
        {planning.en_retard && <Etiquette>{t('soumission.enRetard')}</Etiquette>}
      </View>
    );
  }
  if (!modifiable) return null;
  const passee = new Date(planning.echeance) < new Date();
  return (
    <Texte variante="discret">
      {t(passee ? 'soumission.echeancePassee' : 'soumission.echeance', {
        date: dateHeure(planning.echeance, i18n.language),
      })}
    </Texte>
  );
}

/**
 * Fin de la semaine : « Soumettre le planning », avec une confirmation sur place. Tant que des
 * points bloquants restent, le bouton laisse la place à ce qu'il faut corriger.
 */
export function CarteSoumission({
  semaine,
  surSoumis,
  surCorriger,
}: {
  semaine: Semaine;
  surSoumis: (message: string) => void;
  /** Ouvre la visite d'un point bloquant, sans remonter toute la semaine. */
  surCorriger: (visite: string) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const planning = semaine.planning;
  if (!planning) return null;
  const bloquants = semaine.controles?.bloquants.length ?? 0;
  const aCorriger = semaine.controles?.bloquants.find((c) => c.visites[0])?.visites[0];
  const passee = new Date(planning.echeance) < new Date();

  async function soumettre() {
    if (!planning) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const soumis = await client.plannings.soumettre(planning.id);
      setConfirmer(false);
      surSoumis(t(soumis.en_retard ? 'soumission.succesRetard' : 'soumission.succes'));
    } catch (e) {
      // Sans réseau, rien ne part en file : la soumission se refait une fois connecté.
      setErreur(messageErreur(e, t('soumission.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte style={{ gap: 10, borderLeftWidth: 3, borderLeftColor: bloquants ? p.erreur : p.info }}>
      <Texte variante="sousTitre">{t('soumission.titre')}</Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {bloquants > 0 ? (
        <>
          <Texte>{t('soumission.bloquants', { count: bloquants })}</Texte>
          {aCorriger && (
            <Bouton
              secondaire
              libelle={t('soumission.corriger', { count: bloquants })}
              onPress={() => surCorriger(aCorriger)}
            />
          )}
        </>
      ) : confirmer ? (
        <>
          <Texte>{t('soumission.confirmation')}</Texte>
          {passee && <Texte variante="discret">{t('soumission.confirmationRetard')}</Texte>}
          <Bouton
            libelle={t('soumission.confirmer')}
            chargement={envoi}
            onPress={() => void soumettre()}
          />
          <Bouton
            secondaire
            libelle={t('soumission.annuler')}
            onPress={() => setConfirmer(false)}
          />
        </>
      ) : (
        <>
          <Texte variante="discret">{t('soumission.aide')}</Texte>
          <Bouton
            libelle={t('soumission.soumettre')}
            onPress={() => {
              setErreur(null);
              setConfirmer(true);
            }}
          />
        </>
      )}
    </Carte>
  );
}
