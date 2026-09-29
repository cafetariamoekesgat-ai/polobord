# Polobord

Digitaal waterpolo-tactiekbord voor de iPad (landscape, vinger + Apple Pencil). Werkt offline als app op het beginscherm.

## Voor de trainer

1. **Schuif** caps met je vinger (meerdere tegelijk kan); de Pencil tekent altijd.
2. **Lang indrukken** op een cap: nummer, naam, rol, bal geven, uitsluiten, verwijderen. **Tik op een medespeler** van de balbezitter = pass.
3. **Opstellen** (rechts): één tik zet 3-3, 4-2, 6 tegen 5, strafworp enz. neer; kies eerst wie aanvalt.
4. **+ Stap** legt posities vast; teken zwemlijnen vanaf spelers en passes vanaf de bal, tik weer **+ Stap** en druk op afspelen.
5. **Presentatie** (knop rechtsonder): alleen veld en afspeelknoppen, dikke lijnen, scherm blijft aan. Het slotje vergrendelt; ontgrendelen = slotje vasthouden.

## Op de iPad zetten

Safari → open de URL → Deel-knop → *Zet op beginscherm* → *Voeg toe*. Open de app daarna één keer met wifi; vanaf dan werkt hij ook zonder internet.

## Ontwikkelen

```bash
npm install
npm run dev      # lokaal, http://localhost:5173/polobord/
npm test         # geometrie-tests (Vitest)
npm run build
```

Alle spelregelwaarden staan in `src/rules.ts`.

## Updates publiceren

Commit en push naar `main`: GitHub Actions test, bouwt en zet de site online (± 1 minuut). De app op de iPad haalt de nieuwe versie vanzelf op bij de volgende keer openen met internet.
