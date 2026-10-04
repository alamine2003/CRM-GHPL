import { Box, Card, CardContent, Container, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** Carte centrée des pages publiques (connexion, récupération d'accès). */
export default function Cadre({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Container maxWidth="xs" sx={{ py: { xs: 3, sm: 8 } }}>
      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
            {titre}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
        </CardContent>
      </Card>
    </Container>
  );
}
