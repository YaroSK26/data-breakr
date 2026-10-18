# Dlžníci Sociálnej poisťovne – návrh integrácie

## Odporúčanie

Integrácia je realizovateľná, ale zoznam Sociálnej poisťovne treba viesť ako
samostatný zdroj. Nemá sa sčítavať s daňovými dlžníkmi Finančnej správy:
ide o iný druh dlhu, inú periodicitu a čiastočne inú množinu osôb.

## Navrhovaný postup

1. Po každom zverejnení stiahnuť hromadný súbor zo Sociálnej poisťovne (zdroj
   uvádza aktualizáciu štyrikrát mesačne) a uložiť dátum publikovania aj
   technický čas synchronizácie.
2. Právnické osoby a SZČO párovať s RPO primárne cez IČO. Záznamy bez IČO
   nepárovať iba podľa mena – riziko zámeny fyzických osôb je príliš vysoké.
3. Na verejnom webe ukladať a zobrazovať iba okresné agregáty: počet dlžníkov,
   sumu dlhu, podiel na 1 000 aktívnych subjektov a mieru úspešného spárovania.
4. V štatistikách pridať samostatné prepínače „Daňoví dlžníci“ a „Dlžníci
   Sociálnej poisťovne“, s jasným názvom zdroja a dátumom aktualizácie.
5. Pred nasadením overiť stabilitu formátu, licenčné podmienky, minimálnu výšku
   dlhu pre zaradenie a pravidlá opätovného použitia osobných údajov.

Zdroj upozorňuje, že jedna osoba môže byť v zozname viackrát pre rôzne druhy
registrácie. Ingest preto musí záznamy najprv zoskupiť podľa IČO a nesmie
prezentovať počet riadkov ako počet unikátnych dlžníkov. Zoznam je iba
informatívny a nie je použiteľný na právne úkony; táto poznámka má byť aj v UI.

## Čo má používateľ vidieť

- počet spárovaných dlžníkov podľa okresu,
- dlžnú sumu na 1 000 aktívnych subjektov,
- trend oproti predchádzajúcemu zverejneniu,
- upozornenie, že nižší počet oproti Finančnej správe neznamená lepšiu platobnú
  disciplínu – zoznamy majú odlišné pravidlá zaradenia.

## Technické minimum

Nový ingest má používať dočasnú tabuľku a transakčnú výmenu dát, kontrolu
minimálneho počtu záznamov a alarm pri prudkej zmene miery párovania. Verejné
API má vracať agregáty, nie mená alebo adresy fyzických osôb.
