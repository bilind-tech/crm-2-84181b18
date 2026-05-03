-- Migration 021: Mahnstufe pro Versand-Zeile mitprotokollieren.
-- Optional, NULL für Nicht-Mahn-Mails. Wird ausschließlich vom manuell
-- ausgelösten EmailVersandDialog gesetzt — nie automatisch.
ALTER TABLE email_versand ADD COLUMN mahn_stufe INTEGER NULL;
