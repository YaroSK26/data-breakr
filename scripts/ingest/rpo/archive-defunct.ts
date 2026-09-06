// scripts/ingest/rpo/archive-defunct.ts
//
// Spočíta zaniknuté (a vzniknuté) subjekty do agregátov, aby sa riadky
// zaniknutých firiem dali z business_entities zmazať bez straty analýz.
//
// Prečo vôbec: zaniknuté subjekty tvorili 54 % tabuľky (1,24 M z 2,27 M
// riadkov) a appka ich nikde nezobrazuje - každý dotaz má
// `datum_zaniku IS NULL`. Po tejto výmene ostáva ~21 tis. riadkov agregátov
// namiesto 1,24 M riadkov detailu.
//
// Prepočítava sa vždy celé (DELETE + INSERT ... SELECT), nie prírastkovo -
// je to pár desiatok tisíc riadkov a idempotentný prepočet sa nemôže
// rozísť so zdrojom tak, ako by sa mohol postupný súčet.
//
// Použitie: npx tsx scripts/ingest/rpo/archive-defunct.ts
import type { PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from '../../../lib/prisma'

export async function archiveDefunct(prisma: PrismaClient) {
  // Po prune-defunct-entities.ts už zaniknuté riadky v tabuľke nie sú a
  // agregáty sú jediný nositeľ tých čísel - prepočet "od nuly" by ich
  // vynuloval. Preto sa prepočítava len vtedy, keď je z čoho: zdroj musí
  // pokrývať aspoň toľko subjektov, koľko už agregát drží.
  const [vTabulke, vAgregate] = await Promise.all([
    prisma.businessEntity.count({ where: { datumZaniku: { not: null } } }),
    prisma.zaniknuteAgg.aggregate({ _sum: { pocet: true } }),
  ])
  const uzUlozene = vAgregate._sum.pocet ?? 0

  if (vTabulke < uzUlozene) {
    throw new Error(
      `Prepočet by zahodil dáta: v business_entities je ${vTabulke} zaniknutých, ` +
        `ale zaniknute_agg ich už eviduje ${uzUlozene}. ` +
        `Po prune-defunct-entities.ts sa agregáty udržiavajú prírastkovo (upsert-entity.ts), neprepočítavajú.`
    )
  }

  // Jedna transakcia: buď sú prepočítané všetky tri agregáty, alebo žiadny.
  // Polovične prepočítaný stav by sa tváril ako platný podklad na mazanie.
  // Timeout hore z 5 s - tri GROUP BY cez 2,3 M riadkov trvajú ~15 s.
  await prisma.$transaction(
    [
    prisma.$executeRaw`DELETE FROM zaniknute_agg`,
    prisma.$executeRaw`
      INSERT INTO zaniknute_agg (okres_kod, nace_kod4, pravna_forma_kod, rok_zaniku, pocet)
      SELECT okres_kod, nace_kod4, pravna_forma_kod,
             EXTRACT(YEAR FROM datum_zaniku)::int, COUNT(*)
      FROM business_entities
      WHERE datum_zaniku IS NOT NULL
      GROUP BY okres_kod, nace_kod4, pravna_forma_kod, EXTRACT(YEAR FROM datum_zaniku)
    `,
    prisma.$executeRaw`DELETE FROM prezitie_agg`,
    prisma.$executeRaw`
      INSERT INTO prezitie_agg (rok_vzniku, rok_zaniku, pocet)
      SELECT EXTRACT(YEAR FROM datum_vzniku)::int, EXTRACT(YEAR FROM datum_zaniku)::int, COUNT(*)
      FROM business_entities
      WHERE datum_zaniku IS NOT NULL AND datum_vzniku IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM datum_vzniku), EXTRACT(YEAR FROM datum_zaniku)
    `,
    // vznik_agg drží vznik LEN tých subjektov, ktoré už v business_entities
    // nie sú (čiže zaniknutých). Živé sa rátajú priamo z tabuľky. Graf
    // "nové firmy po rokoch" je súčet oboch - inak by po zmazaní zaniknutých
    // spadol na polovicu. Táto deliaca čiara je zámerná: keby tu boli všetky
    // vzniky, po zmazaní by sa už nedali prepočítať a dvojité rátanie by
    // hrozilo pri každom ďalšom behu.
    prisma.$executeRaw`DELETE FROM vznik_agg`,
    prisma.$executeRaw`
      INSERT INTO vznik_agg (okres_kod, rok_vzniku, pocet)
      SELECT okres_kod, EXTRACT(YEAR FROM datum_vzniku)::int, COUNT(*)
      FROM business_entities
      WHERE datum_vzniku IS NOT NULL AND datum_zaniku IS NOT NULL
      GROUP BY okres_kod, EXTRACT(YEAR FROM datum_vzniku)
    `,
    ],
    { timeout: 180000 }
  )

  const [zaniknute, prezitie, vznik] = await Promise.all([
    prisma.zaniknuteAgg.aggregate({ _sum: { pocet: true }, _count: true }),
    prisma.prezitieAgg.aggregate({ _sum: { pocet: true }, _count: true }),
    prisma.vznikAgg.aggregate({ _sum: { pocet: true }, _count: true }),
  ])

  return {
    zaniknute: { riadkov: zaniknute._count, subjektov: zaniknute._sum.pocet ?? 0 },
    prezitie: { riadkov: prezitie._count, subjektov: prezitie._sum.pocet ?? 0 },
    vznik: { riadkov: vznik._count, subjektov: vznik._sum.pocet ?? 0 },
  }
}

async function main() {
  const result = await archiveDefunct(defaultPrisma)

  // Kontrola proti zdroju: agregát musí sedieť na počet riadkov v tabuľke.
  // Ak nesedí, mazať sa nesmie - preto to skript vypíše ako verdikt, nie
  // ako poznámku pod čiarou.
  const [zaniknutychVDb, sVznikomAZanikom] = await Promise.all([
    defaultPrisma.businessEntity.count({ where: { datumZaniku: { not: null } } }),
    defaultPrisma.businessEntity.count({
      where: { datumZaniku: { not: null }, datumVzniku: { not: null } },
    }),
  ])
  // vznik_agg aj prezitie_agg pokrývajú tú istú množinu (zaniknuté so
  // známym dátumom vzniku), len iným rezom.
  const vzniknutychVDb = sVznikomAZanikom

  console.log('\nzaniknute_agg:', result.zaniknute.riadkov, 'riadkov =', result.zaniknute.subjektov, 'subjektov')
  console.log('  v business_entities:', zaniknutychVDb, result.zaniknute.subjektov === zaniknutychVDb ? '- SEDÍ' : '- NESEDÍ')
  console.log('prezitie_agg:', result.prezitie.riadkov, 'riadkov =', result.prezitie.subjektov, 'subjektov')
  console.log('  v business_entities:', sVznikomAZanikom, result.prezitie.subjektov === sVznikomAZanikom ? '- SEDÍ' : '- NESEDÍ')
  console.log('vznik_agg:', result.vznik.riadkov, 'riadkov =', result.vznik.subjektov, 'subjektov')
  console.log('  v business_entities:', vzniknutychVDb, result.vznik.subjektov === vzniknutychVDb ? '- SEDÍ' : '- NESEDÍ')

  const vsetkoSedi =
    result.zaniknute.subjektov === zaniknutychVDb &&
    result.prezitie.subjektov === sVznikomAZanikom &&
    result.vznik.subjektov === vzniknutychVDb

  console.log(vsetkoSedi ? '\nAgregáty sedia so zdrojom.' : '\nPOZOR: agregáty nesedia - nemazať zaniknuté riadky.')
  if (!vsetkoSedi) process.exitCode = 1
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => defaultPrisma.$disconnect())
}
