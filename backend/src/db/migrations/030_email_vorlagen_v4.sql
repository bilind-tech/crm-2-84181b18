-- Migration 030: v4-Defaults — Grußformel und Kontaktangebot raus.
-- Diese Floskeln gehören in die E-Mail-Signatur, nicht in den Body.
-- User-eigene Vorlagen (seed_key IS NULL) bleiben UNANGETASTET.
DELETE FROM email_vorlage WHERE seed_key LIKE '%.v3';