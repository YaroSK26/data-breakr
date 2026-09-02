// scripts/ingest/nace/client.ts
//
// Downloads the two things RÚZ's own /api/sk-nace classifier cannot give
// us:
//
//   1. NACE Rev. 2.1 - the revision RPO switched to, and the one 35% of
//      our business_entities rows are coded in. RÚZ still publishes only
//      SK NACE Rev. 2, so those codes had no name at all before this.
//   2. The ŠÚ SR "prevodník" (correspondence table) SK NACE Rev. 2 ->
//      NACE Rev. 2.1, which is what lets RÚZ-sourced financial data
//      (firms.nace_kod5, Rev. 2) sit in the same category space as
//      RPO-sourced entity data (business_entities.nace_kod4, Rev. 2.1).
//
// Both come from ŠÚ SR's public metadata portal at zber.statistics.sk.
// The portal is a Liferay page whose tables are fed by portlet resource
// URLs; those URLs are stable public endpoints (the same ones its own
// "XML / CSV" download links call) and need no auth or session.
import { fetchText } from '../http'

const CLASSIFICATION_PORTLET =
  'sk_susr_isis_pub_classification_portlet_ClassificationPortlet_INSTANCE_iogq'
const CORRESPONDENCE_PORTLET =
  'sk_susr_isis_pub_correspondence_portlet_CorrespondencePortlet_INSTANCE_ibvo'

export const CLASSIFICATIONS_PAGE = 'https://zber.statistics.sk/metaudaje/klasifikacie'
export const CORRESPONDENCES_PAGE = 'https://zber.statistics.sk/metaudaje/korespondencie'

// Internal ids of the two classifications on the portal. They are stable
// per classification version; if ŠÚ SR ever republishes under a new id the
// download 404s loudly rather than returning stale data.
const NACE21_HIER_ID = 1363924515 // HR010146 "Štatistická klasifikácia ekonomických činností NACE Rev. 2.1"

// Two variants of the same prevodník are published: one with dotted codes
// ("01.11.0" -> "01.11") and this one with the plain digit codes that both
// RÚZ and RPO actually use ("01110" -> "0111"). Take the plain one so no
// re-formatting guesswork is needed.
const CORRESPONDENCE_ACRONYM = 'SKNACE5 - NACE_2.1_L4'

function classificationUrl(hierId: number): string {
  const params = new URLSearchParams({
    p_p_id: CLASSIFICATION_PORTLET,
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'generateFile',
    p_p_cacheability: 'cacheLevelPage',
    hierId: String(hierId),
    fileType: 'CSV',
  })
  return `${CLASSIFICATIONS_PAGE}?${params}`
}

function correspondenceUrl(acronym: string): string {
  const params = new URLSearchParams({
    p_p_id: CORRESPONDENCE_PORTLET,
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'generateFile',
    p_p_cacheability: 'cacheLevelPage',
    acronym,
    fileType: 'CSV',
  })
  return `${CORRESPONDENCES_PAGE}?${params}`
}

export class SusrClassificationClient {
  /** NACE Rev. 2.1 hierarchy, Slovak + English, as CSV. */
  async getNace21Csv(): Promise<string> {
    return fetchText(classificationUrl(NACE21_HIER_ID))
  }

  /** Prevodník: SK NACE Rev. 2 subclass -> NACE Rev. 2.1 class. */
  async getRev2ToRev21Csv(): Promise<string> {
    return fetchText(correspondenceUrl(CORRESPONDENCE_ACRONYM))
  }
}
