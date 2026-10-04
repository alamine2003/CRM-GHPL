import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { messageErreur, useSession } from '../contexteSession';
import ChampCode from './ChampCode';

const ETAPES = ['installer', 'scanner', 'confirmer', 'codes'] as const;

/** Activation de la double authentification en quatre étapes (SEC-003). */
export default function AssistantDoubleAuth({ surTermine }: { surTermine: () => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [etape, setEtape] = useState(0);
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [notes, setNotes] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (etape !== 1 || secret) return;
    let actif = true;
    client.doubleAuth
      .initialiser()
      .then(async ({ secret: s, uri }) => {
        if (!actif) return;
        setSecret(s);
        // Chargé seulement pendant l'activation : inutile au reste du portail.
        const QRCode = (await import('qrcode')).default;
        setQr(await QRCode.toDataURL(uri, { margin: 1, width: 220 }));
      })
      .catch((e: unknown) => actif && setErreur(messageErreur(e, t('erreurs.reseau'))));
    return () => {
      actif = false;
    };
  }, [etape, secret, client, t]);

  async function confirmer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      setCodes((await client.doubleAuth.activer(code)).codes_secours);
      setEtape(3);
    } catch (err) {
      setErreur(messageErreur(err, t('erreurs.reseau')));
      setCode('');
    } finally {
      setEnvoi(false);
    }
  }

  const texteCodes = codes.join('\n');
  return (
    <Stack spacing={3}>
      <Stepper activeStep={etape} alternativeLabel>
        {ETAPES.map((cle) => (
          <Step key={cle}>
            <StepLabel>{t(`doubleAuth.etapes.${cle}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {erreur && (
        <Alert severity="error" role="alert">
          {erreur}
        </Alert>
      )}
      {etape === 0 && (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography sx={{ color: 'text.secondary' }}>{t('doubleAuth.installerTexte')}</Typography>
          <Button variant="contained" onClick={() => setEtape(1)}>
            {t('doubleAuth.suivant')}
          </Button>
        </Stack>
      )}
      {etape === 1 && (
        <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>{t('doubleAuth.scannerTexte')}</Typography>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#FFFFFF' }}>
            {qr ? (
              <img src={qr} alt={t('doubleAuth.qrAlt')} width={220} height={220} />
            ) : (
              <Skeleton variant="rectangular" width={220} height={220} />
            )}
          </Paper>
          {secret && (
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('doubleAuth.cleManuelle')}
              </Typography>
              <Typography
                sx={{ fontFamily: 'monospace', letterSpacing: '0.12em', wordBreak: 'break-all' }}
              >
                {secret.match(/.{1,4}/g)?.join(' ')}
              </Typography>
            </Box>
          )}
          <Button variant="contained" disabled={!secret} onClick={() => setEtape(2)}>
            {t('doubleAuth.suivant')}
          </Button>
        </Stack>
      )}
      {etape === 2 && (
        <Stack component="form" onSubmit={confirmer} spacing={2}>
          <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
            {t('doubleAuth.confirmerTexte')}
          </Typography>
          <ChampCode valeur={code} changer={setCode} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
            <Button onClick={() => setEtape(1)}>{t('code.retour')}</Button>
            <Button type="submit" variant="contained" disabled={code.length !== 6 || envoi}>
              {t('code.valider')}
            </Button>
          </Stack>
        </Stack>
      )}
      {etape === 3 && (
        <Stack spacing={2}>
          <Alert severity="success">{t('doubleAuth.activee')}</Alert>
          <Typography sx={{ color: 'text.secondary' }}>{t('doubleAuth.codesTexte')}</Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              p: 2,
              borderRadius: 2,
              bgcolor: 'action.hover',
              fontFamily: 'monospace',
              fontSize: 16,
              textAlign: 'center',
            }}
            aria-label={t('doubleAuth.etapes.codes')}
          >
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => void navigator.clipboard?.writeText(texteCodes)}
            >
              {t('doubleAuth.copier')}
            </Button>
            <Button
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(`INNOV CRM\n\n${texteCodes}\n`)}`}
              download="innov-crm-codes-de-secours.txt"
            >
              {t('doubleAuth.telecharger')}
            </Button>
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={notes} onChange={(e) => setNotes(e.target.checked)} />}
            label={t('doubleAuth.notes')}
          />
          <Button variant="contained" disabled={!notes} onClick={surTermine}>
            {t('doubleAuth.terminer')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
