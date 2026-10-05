import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { creerClientMobile } from './client';
import { Bouton, Texte, useLien, usePalette } from './composants';
import { VERSION_APP } from './version';

/** Signalement des plantages au serveur (architecture §19), sans donnée saisie. */
const rapporteur = creerClientMobile();
const dejaSignales = new Set<string>();

export function signalerErreur(erreur: unknown, reference?: string, ecran?: string): void {
  const message = erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur);
  if (dejaSignales.has(message) || dejaSignales.size >= 5) return;
  dejaSignales.add(message);
  void rapporteur.signalerErreur({
    message,
    version: VERSION_APP,
    pile: erreur instanceof Error ? erreur.stack : undefined,
    ecran,
    reference,
  });
}

function EcranErreur({ reference, reessayer }: { reference: string; reessayer: () => void }) {
  const { t } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  return (
    <View style={[styles.ecran, { backgroundColor: p.fond }]}>
      <Texte variante="sousTitre" style={{ textAlign: 'center' }}>
        {t('erreurs.titre')}
      </Texte>
      <Texte variante="discret" style={{ textAlign: 'center' }}>
        {t('erreurs.texte')}
      </Texte>
      <Texte variante="discret" style={{ fontFamily: 'monospace', color: lien }}>
        {t('erreurs.reference', { reference })}
      </Texte>
      <View style={{ alignSelf: 'stretch' }}>
        <Bouton libelle={t('erreurs.reessayer')} onPress={reessayer} />
      </View>
    </View>
  );
}

/** Attrape les erreurs de rendu : l'application ne se ferme pas, l'erreur est signalée. */
export class LimiteErreur extends Component<{ children: ReactNode }, { reference?: string }> {
  state: { reference?: string } = {};

  static getDerivedStateFromError(): { reference: string } {
    return { reference: Math.random().toString(16).slice(2, 12) };
  }

  componentDidCatch(erreur: Error, _info: ErrorInfo) {
    signalerErreur(erreur, this.state.reference);
  }

  render() {
    if (this.state.reference) {
      return (
        <EcranErreur
          reference={this.state.reference}
          reessayer={() => this.setState({ reference: undefined })}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  ecran: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
});
