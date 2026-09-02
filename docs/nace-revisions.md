# NACE v tejto aplikácii: dve revízie naraz

Aplikácia pracuje s dvoma revíziami štatistickej klasifikácie ekonomických
činností súčasne, lebo dva zdroje dát prešli na novú revíziu v rôznom čase.

| Tabuľka / stĺpec               | Zdroj | Revízia                        | Formát        |
| ------------------------------ | ----- | ------------------------------ | ------------- |
| `business_entities.nace_kod4`  | RPO   | **NACE Rev. 2.1** (od 2025)    | `4712`        |
| `firms.nace_kod5`              | RÚZ   | **SK NACE Rev. 2** (2008)      | `47110`       |
| `nace21_codes`                 | ŠÚ SR | NACE Rev. 2.1, celá hierarchia | `G`/`47`/`471`/`4712` |
| `nace_codes`                   | RÚZ   | SK NACE Rev. 2, podtriedy      | `47110`       |
| `nace_rev2_to_rev21`           | ŠÚ SR | prevodník Rev. 2 → Rev. 2.1    | `47190 → 4712` |

## Čo bolo zle

Filter kategórií aj graf najväčších odvetví brali názvy z `nace_codes`, teda
zo SK NACE Rev. 2 od RÚZ. RPO ale už publikuje Rev. 2.1:

- **35 % aktívnych subjektov** (cca 379 tis.) malo kód, ktorý v ponuke
  filtra vôbec nebol - `4712`, `4335`, `7020`, `4100`, `8210`, `6210`, `5611`,
  `9531`, `9621`-`9623` ...
- Naopak filter ponúkal zrušené kódy Rev. 2 (`4711`, `6201`, `7022`), na
  ktoré sa nenašla ani jedna firma.
- Rebríček TOP 12 odvetví na homepage vynechával nepomenované kódy, čiže
  reálne zobrazoval 7. až 18. miesto ako prvú dvanástku.

## Zdroje

Oba súbory sťahuje `npm run ingest:nace` (týždenne aj cez
`.github/workflows/ingest-nace.yml`) priamo z metadátového portálu ŠÚ SR:

- Klasifikácie: <https://zber.statistics.sk/metaudaje/klasifikacie> -
  "Štatistická klasifikácia ekonomických činností NACE Rev. 2.1" (HR010146),
  CSV export.
- Prevodníky: <https://zber.statistics.sk/metaudaje/korespondencie> -
  "SKNACE5 - NACE_2.1_L4", CSV export.

Endpointy sú tie isté portletové URL, ktoré volajú tlačidlá "XML / CSV" na
tých stránkach; nepotrebujú prihlásenie. Ingest odmietne zapísať dáta, ak
príde podozrivo krátky súbor, aby chybová stránka nevymazala funkčný
číselník.

## Prevodník nie je 1:1

176 zo 646 podtried SK NACE Rev. 2 sa v Rev. 2.1 rozpadá na viac tried
(napr. `47.19.0` → `47.11`, `47.12`, `47.13`). Preto:

- `nace_rev2_to_rev21` je zoznam kandidátov, nie prepisovacie pravidlo,
- `resolveNaceFilter()` v [`lib/nace.ts`](../lib/nace.ts) preloží starý kód
  (z uloženého odkazu alebo z RÚZ dát) na **množinu** tried Rev. 2.1 a
  filtruje cez `IN (...)`,
- používateľ je na túto neistotu upozornený banerom nad mapou (pravidlo o
  transparentnosti dát v `CLAUDE.md`).

ŠÚ SR udržiava obe revízie paralelne do 31. 12. 2028, takže tento dvojkoľajný
stav tu ostane - nejde o dočasnú barličku počas migrácie.
