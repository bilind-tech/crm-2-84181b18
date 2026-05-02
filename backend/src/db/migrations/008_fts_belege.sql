-- Step 4: FTS5-Trigger für Angebote + Rechnungen.
-- Body enthält Position-Beschreibungen (per GROUP_CONCAT in Sub-SELECT),
-- damit Suche „Treppenhaus" auch Belege findet.
-- Bei UPDATE eines Belegs reicht es, den Kopf-Eintrag neu zu schreiben.
-- Bei INSERT/DELETE einer Position triggern wir ein Re-Indexieren des Belegs.

-- =============================================================================
-- ANGEBOT → suche_idx
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS angebot_ai AFTER INSERT ON angebot BEGIN
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'angebot',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,''),
    '/angebote/$id',
    NEW.id
  );
END;

CREATE TRIGGER IF NOT EXISTS angebot_ad AFTER DELETE ON angebot BEGIN
  DELETE FROM suche_idx WHERE entity_typ='angebot' AND entity_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS angebot_au AFTER UPDATE ON angebot BEGIN
  DELETE FROM suche_idx WHERE entity_typ='angebot' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'angebot',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,'') || ' ' ||
      COALESCE((SELECT GROUP_CONCAT(beschreibung, ' ') FROM angebot_position WHERE angebot_id = NEW.id),''),
    '/angebote/$id',
    NEW.id
  );
END;

-- Positionen ändern → Beleg-Eintrag neu schreiben (touch-Trigger feuert au)
CREATE TRIGGER IF NOT EXISTS angebot_pos_ai AFTER INSERT ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = NEW.angebot_id;
END;
CREATE TRIGGER IF NOT EXISTS angebot_pos_ad AFTER DELETE ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = OLD.angebot_id;
END;

-- =============================================================================
-- RECHNUNG → suche_idx
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS rechnung_ai AFTER INSERT ON rechnung BEGIN
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'rechnung',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,''),
    '/rechnungen/$id',
    NEW.id
  );
END;

CREATE TRIGGER IF NOT EXISTS rechnung_ad AFTER DELETE ON rechnung BEGIN
  DELETE FROM suche_idx WHERE entity_typ='rechnung' AND entity_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS rechnung_au AFTER UPDATE ON rechnung BEGIN
  DELETE FROM suche_idx WHERE entity_typ='rechnung' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'rechnung',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,'') || ' ' ||
      COALESCE((SELECT GROUP_CONCAT(beschreibung, ' ') FROM rechnung_position WHERE rechnung_id = NEW.id),''),
    '/rechnungen/$id',
    NEW.id
  );
END;

CREATE TRIGGER IF NOT EXISTS rechnung_pos_ai AFTER INSERT ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = NEW.rechnung_id;
END;
CREATE TRIGGER IF NOT EXISTS rechnung_pos_ad AFTER DELETE ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = OLD.rechnung_id;
END;
