import type { ClientVente, LigneVente, TypeClientVente } from '@innov/api-client';
import { Autocomplete, Link, MenuItem, Stack, TextField } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';

const TYPES: TypeClientVente[] = ['pharmacie', 'parapharmacie', 'grossiste'];

/** Un client à choisir parmi ceux du pays (recherche au fil de la frappe). */
export function ChoixClient({
  valeur,
  surChoix,
  libelle,
  requis = true,
}: {
  valeur: ClientVente | null;
  surChoix: (client: ClientVente | null) => void;
  libelle: string;
  requis?: boolean;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [q, setQ] = useState('');
  const clients = useQuery({
    queryKey: ['ventes', 'clients', q],
    queryFn: () => client.ventes.clients(q),
  });
  return (
    <Autocomplete
      options={clients.data ?? []}
      value={valeur}
      loading={clients.isFetching}
      filterOptions={(options) => options}
      getOptionLabel={(c) => c.nom}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      groupBy={(c) => t(`ventes.types.${c.type}`)}
      onChange={(_, c) => surChoix(c)}
      onInputChange={(_, texte, raison) => raison === 'input' && setQ(texte)}
      noOptionsText={t('ventes.saisie.aucunClient')}
      renderInput={(params) => (
        <TextField
          {...params}
          label={libelle}
          required={requis}
          size={requis ? 'medium' : 'small'}
        />
      )}
    />
  );
}

/** Saisie d'une ligne mensuelle (le même mois, délégué, produit et client ne se saisit qu'une
 * fois : ensuite on corrige la ligne). */
export function DialogueSaisieVente({
  ouvert,
  surFermer,
}: {
  ouvert: boolean;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [mois, setMois] = useState('');
  const [delegue, setDelegue] = useState('');
  const [produit, setProduit] = useState('');
  const [acheteur, setAcheteur] = useState<ClientVente | null>(null);
  const [quantite, setQuantite] = useState('');
  const [montantTtc, setMontantTtc] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const [nom, setNom] = useState('');
  const [type, setType] = useState<TypeClientVente>('pharmacie');
  const [zone, setZone] = useState('');
  const personnes = useQuery({
    queryKey: ['ventes', 'delegues'],
    queryFn: client.utilisateurs,
    enabled: ouvert,
  });
  const produits = useQuery({
    queryKey: ['ventes', 'produits'],
    queryFn: client.referentiel.produits,
    enabled: ouvert,
  });
  const zones = useQuery({
    queryKey: ['ventes', 'zones'],
    queryFn: client.organisation.zones,
    enabled: ouvert && nouveau,
  });
  const delegues = (personnes.data ?? []).filter((u) => u.roles.includes('delegue'));
  const complet =
    mois && delegue && produit && quantite && montantTtc && (nouveau ? nom.trim() : acheteur);

  async function valider() {
    const cible = nouveau
      ? await client.ventes.creerClient({ nom, type, zone: zone || null })
      : acheteur!;
    await client.ventes.saisir({
      mois,
      delegue,
      produit,
      client: cible.id,
      quantite,
      montant_ttc: montantTtc,
    });
    await requetes.invalidateQueries({ queryKey: ['ventes'] });
  }

  return (
    <DialogueFormulaire
      ouvert={ouvert}
      titre={t('ventes.saisie.titre')}
      aide={t('ventes.saisie.aide')}
      libelleValider={t('ventes.saisie.enregistrer')}
      surFermer={surFermer}
      surValider={valider}
      invalide={!complet}
    >
      <TextField
        type="month"
        required
        label={t('ventes.saisie.mois')}
        value={mois}
        onChange={(e) => setMois(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        select
        required
        label={t('ventes.filtres.delegue')}
        value={delegue}
        onChange={(e) => setDelegue(e.target.value)}
      >
        {delegues.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.prenom} {u.nom}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        required
        label={t('ventes.filtres.produit')}
        value={produit}
        onChange={(e) => setProduit(e.target.value)}
      >
        {(produits.data ?? [])
          .filter((p) => !p.archive)
          .map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.libelle}
            </MenuItem>
          ))}
      </TextField>
      {nouveau ? (
        <Stack spacing={2}>
          <TextField
            required
            label={t('ventes.saisie.nomClient')}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <TextField
            select
            label={t('ventes.filtres.typeClient')}
            value={type}
            onChange={(e) => setType(e.target.value as TypeClientVente)}
          >
            {TYPES.map((v) => (
              <MenuItem key={v} value={v}>
                {t(`ventes.types.${v}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('ventes.filtres.zone')}
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <MenuItem value="">{t('ventes.saisie.sansZone')}</MenuItem>
            {(zones.data ?? []).map((z) => (
              <MenuItem key={z.id} value={z.id}>
                {z.libelle}
              </MenuItem>
            ))}
          </TextField>
          <Link
            component="button"
            type="button"
            variant="body2"
            onClick={() => setNouveau(false)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('ventes.saisie.choisirClient')}
          </Link>
        </Stack>
      ) : (
        <Stack spacing={1}>
          <ChoixClient
            valeur={acheteur}
            surChoix={setAcheteur}
            libelle={t('ventes.filtres.client')}
          />
          <Link
            component="button"
            type="button"
            variant="body2"
            onClick={() => setNouveau(true)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('ventes.saisie.nouveauClient')}
          </Link>
        </Stack>
      )}
      <TextField
        required
        label={t('ventes.saisie.quantite')}
        value={quantite}
        onChange={(e) => setQuantite(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      />
      <TextField
        required
        label={t('ventes.saisie.montant')}
        value={montantTtc}
        onChange={(e) => setMontantTtc(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
    </DialogueFormulaire>
  );
}

/** Corriger les chiffres d'une ligne : seuls la quantité et le montant changent. */
export function DialogueCorrectionVente({
  ligne,
  surFermer,
}: {
  ligne: LigneVente | null;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [quantite, setQuantite] = useState<string | null>(null);
  const [montantTtc, setMontantTtc] = useState<string | null>(null);
  return (
    <DialogueFormulaire
      ouvert={ligne !== null}
      titre={t('ventes.lignes.corriger')}
      aide={ligne ? `${ligne.delegue.nom} · ${ligne.produit.libelle} · ${ligne.client.nom}` : ''}
      surFermer={() => {
        setQuantite(null);
        setMontantTtc(null);
        surFermer();
      }}
      surValider={async () => {
        if (!ligne) return;
        await client.ventes.corriger(ligne.id, {
          quantite: quantite ?? String(ligne.quantite),
          montant_ttc: montantTtc ?? ligne.montant_ttc,
        });
        await requetes.invalidateQueries({ queryKey: ['ventes'] });
        setQuantite(null);
        setMontantTtc(null);
      }}
    >
      <TextField
        label={t('ventes.saisie.quantite')}
        value={quantite ?? ligne?.quantite ?? ''}
        onChange={(e) => setQuantite(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      />
      <TextField
        label={t('ventes.saisie.montant')}
        value={montantTtc ?? ligne?.montant_ttc ?? ''}
        onChange={(e) => setMontantTtc(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
    </DialogueFormulaire>
  );
}
