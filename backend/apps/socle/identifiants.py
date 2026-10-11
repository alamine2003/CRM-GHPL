"""Identifiants UUID v7 (RFC 9562), générés par le créateur de l'objet (ADR-006).

Triables dans le temps et sans collision, ils permettent au téléphone de créer
des objets hors connexion. Python 3.12 n'a pas encore ``uuid.uuid7`` : cette
implémentation suit la RFC (48 bits de millisecondes, version, variante, aléa)
et garantit un ordre strictement croissant au sein d'un même processus.
"""

import os
import threading
import time
import uuid

_verrou = threading.Lock()
_dernier = 0


def uuid7() -> uuid.UUID:
    global _dernier
    with _verrou:
        ms = time.time_ns() // 1_000_000
        aleatoire = int.from_bytes(os.urandom(10), "big")
        # 48 bits de temps | 4 bits de version | 12 bits | 2 bits de variante | 62 bits
        valeur = (ms & 0xFFFF_FFFF_FFFF) << 80
        valeur |= 0x7 << 76
        valeur |= ((aleatoire >> 68) & 0xFFF) << 64
        valeur |= 0b10 << 62
        valeur |= aleatoire & 0x3FFF_FFFF_FFFF_FFFF
        # Même milliseconde ou horloge reculée : on incrémente pour rester croissant.
        if valeur <= _dernier:
            valeur = _dernier + 1
        _dernier = valeur
        return uuid.UUID(int=valeur)
