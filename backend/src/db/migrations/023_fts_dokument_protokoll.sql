-- Step 23: FTS5-Trigger für Dokumente und Protokolle.
-- Damit findet die globale Suche auch Dateinamen, Protokoll-Nummern,
-- Übergabe/Schlüssel-Protokolle inkl. Kunde + Objekt.

-- =============================================================================
-- DOKUMENT → suche_idx
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS dokument_ai AFTER INSERT ON dokumente
WHEN NEW.geloescht_am IS NULL
BEGIN
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'dokument',
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.titel),''), NEW.dateiname),
    'Dokument · ' || COALESCE(
      (SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),
      (SELECT name FROM objekt WHERE id = NEW.objekt_id),
      NEW.typ
    ),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.beschreibung,'') || ' ' ||
    COALESCE(NEW.dateiname,'') || ' ' || COALESCE(NEW.typ,''),
    '/dokumente',
    NEW.id
  );
END;

CREATE TRIGGER IF NOT EXISTS dokument_ad AFTER DELETE ON dokumente BEGIN
  DELETE FROM suche_idx WHERE entity_typ='dokument' AND entity_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS dokument_au AFTER UPDATE ON dokumente BEGIN
  DELETE FROM suche_idx WHERE entity_typ='dokument' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  SELECT
    'dokument',
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.titel),''), NEW.dateiname),
    'Dokument · ' || COALESCE(
      (SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),
      (SELECT name FROM objekt WHERE id = NEW.objekt_id),
      NEW.typ
    ),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.beschreibung,'') || ' ' ||
    COALESCE(NEW.dateiname,'') || ' ' || COALESCE(NEW.typ,''),
    '/dokumente',
    NEW.id
  WHERE NEW.geloescht_am IS NULL;
END;

-- =============================================================================
-- PROTOKOLL → suche_idx
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS protokoll_ai AFTER INSERT ON protokolle BEGIN
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'protokoll',
    NEW.id,
    NEW.nummer || ' · ' || CASE NEW.kind WHEN 'schluessel' THEN 'Schlüsselübergabe' ELSE 'Übergabe-/Abnahmeprotokoll' END,
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),'') ||
    ' · ' || COALESCE((SELECT name FROM objekt WHERE id = NEW.objekt_id),''),
    COALESCE(NEW.vertreter_ag,'') || ' ' || COALESCE(NEW.vertreter_an,'') || ' ' || COALESCE(NEW.daten_json,'') || ' ' || COALESCE(NEW.datum,''),
    '/protokolle/$id',
    NEW.id
  );
END;

CREATE TRIGGER IF NOT EXISTS protokoll_ad AFTER DELETE ON protokolle BEGIN
  DELETE FROM suche_idx WHERE entity_typ='protokoll' AND entity_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS protokoll_au AFTER UPDATE ON protokolle BEGIN
  DELETE FROM suche_idx WHERE entity_typ='protokoll' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'protokoll',
    NEW.id,
    NEW.nummer || ' · ' || CASE NEW.kind WHEN 'schluessel' THEN 'Schlüsselübergabe' ELSE 'Übergabe-/Abnahmeprotokoll' END,
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),'') ||
    ' · ' || COALESCE((SELECT name FROM objekt WHERE id = NEW.objekt_id),''),
    COALESCE(NEW.vertreter_ag,'') || ' ' || COALESCE(NEW.vertreter_an,'') || ' ' || COALESCE(NEW.daten_json,'') || ' ' || COALESCE(NEW.datum,''),
    '/protokolle/$id',
    NEW.id
  );
END;

-- =============================================================================
-- Re-Index bestehender Datensätze
-- =============================================================================
DELETE FROM suche_idx WHERE entity_typ IN ('dokument','protokoll');

INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
SELECT
  'dokument',
  d.id,
  COALESCE(NULLIF(TRIM(d.titel),''), d.dateiname),
  'Dokument · ' || COALESCE(
    (SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = d.kunde_id),
    (SELECT name FROM objekt WHERE id = d.objekt_id),
    d.typ
  ),
  COALESCE(d.titel,'') || ' ' || COALESCE(d.beschreibung,'') || ' ' || COALESCE(d.dateiname,'') || ' ' || COALESCE(d.typ,''),
  '/dokumente',
  d.id
FROM dokumente d
WHERE d.geloescht_am IS NULL;

INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
SELECT
  'protokoll',
  p.id,
  p.nummer || ' · ' || CASE p.kind WHEN 'schluessel' THEN 'Schlüsselübergabe' ELSE 'Übergabe-/Abnahmeprotokoll' END,
  COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = p.kunde_id),'') ||
  ' · ' || COALESCE((SELECT name FROM objekt WHERE id = p.objekt_id),''),
  COALESCE(p.vertreter_ag,'') || ' ' || COALESCE(p.vertreter_an,'') || ' ' || COALESCE(p.daten_json,'') || ' ' || COALESCE(p.datum,''),
  '/protokolle/$id',
  p.id
FROM protokolle p;
