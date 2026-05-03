# Steuer-Jahre dynamisch ab 2026

**Datei:** `src/routes/steuern.tsx`, Zeilen 73–75.

**Heute:** Hartcodiert `[aktuellesJahr-2, aktuellesJahr-1, aktuellesJahr]` → zeigt 2024, 2025, 2026.

**Neu:** Erfassung startet **2026** (= Startjahr der GmbH-Nutzung). Jahres-Wechsler zeigt automatisch alle Jahre **von 2026 bis zum aktuellen Jahr**. Sobald 2027 anbricht, erscheint 2027 automatisch — und so weiter. Alte Jahre (2026, 2027, …) bleiben jederzeit anklickbar, damit man rückblickend reinschauen kann.

```ts
const aktuellesJahr = new Date().getFullYear();
const STEUER_STARTJAHR = 2026;
const [jahr, setJahr] = useState(aktuellesJahr);
const jahreOptionen = useMemo(() => {
  const bis = Math.max(aktuellesJahr, STEUER_STARTJAHR);
  const arr: number[] = [];
  for (let j = STEUER_STARTJAHR; j <= bis; j++) arr.push(j);
  return arr;
}, [aktuellesJahr]);
```

Sonst keine Änderungen — Daten/Posten/Kennzahlen werden ohnehin schon nach `jahr` gefiltert, also funktioniert der Rückblick auf Vorjahre automatisch.
