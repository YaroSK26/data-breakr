import nodemailer from 'nodemailer'
import { markSent } from './mark-sent'
import { supabase } from './supabase-client'

type Prospect = {
  ico: string
  nazov: string | null
  datum_vzniku: string | null
  kontakt_email: string | null
  kontakt_telefon: string | null
  profil_url: string | null
  overenie_poznamka: string | null
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be set`)
  return value
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]!)
}

export function renderReport(prospects: Prospect[]) {
  const rows = prospects.map((firm) => `<tr>
    <td>${escapeHtml(firm.nazov || 'Bez názvu')}</td>
    <td>${escapeHtml(firm.ico)}</td>
    <td>${escapeHtml(firm.datum_vzniku ? new Date(firm.datum_vzniku).toLocaleDateString('sk-SK') : '')}</td>
    <td>${escapeHtml(firm.kontakt_email || firm.kontakt_telefon || '')}</td>
    <td>${firm.profil_url ? `<a href="${escapeHtml(firm.profil_url)}">Google profil</a>` : ''}</td>
    <td>${escapeHtml(firm.overenie_poznamka || '')}</td>
  </tr>`).join('')
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033">
    <h1>Nové firmy vhodné na oslovenie</h1>
    <p>Počet nových overených prospectov: <strong>${prospects.length}</strong>.</p>
    <p>V reporte sú iba aktívne firmy s Google business profilom, telefónom alebo e-mailom a bez uvedeného webu.</p>
    ${prospects.length ? `<table cellspacing="0" cellpadding="8" border="1" style="border-collapse:collapse">
      <thead><tr><th>Firma</th><th>IČO</th><th>Vznik</th><th>Kontakt</th><th>Profil</th><th>Overenie</th></tr></thead>
      <tbody>${rows}</tbody></table>` : '<p>Tento týždeň sa nenašiel žiadny nový kvalifikovaný prospect.</p>'}
  </body></html>`
}

async function loadProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase
    .from('outreach_firm')
    .select('ico,nazov,datum_vzniku,kontakt_email,kontakt_telefon,profil_url,overenie_poznamka')
    .eq('stav', 'prospect')
    .is('poslane_v_briefe', null)
    .order('datum_vzniku', { ascending: false })
  if (error) throw error
  if (!data?.length) return []

  const { data: active, error: activeError } = await supabase
    .from('business_entities')
    .select('ico')
    .in('ico', data.map((firm) => firm.ico))
    .is('datum_zaniku', null)
  if (activeError) throw activeError
  const activeIcos = new Set((active ?? []).map((firm) => firm.ico))
  return data.filter((firm) => activeIcos.has(firm.ico)) as Prospect[]
}

export async function sendWeeklyReport() {
  const smtpPort = Number(process.env.SMTP_PORT || 587)
  const smtpUser = required('SMTP_USER')
  const prospects = await loadProspects()
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: { user: smtpUser, pass: required('SMTP_PASSWORD').replace(/\s+/g, '') },
  })
  await transporter.sendMail({
    from: process.env.EMAIL_FROM?.trim() || smtpUser,
    to: required('EMAIL_TO'),
    subject: `Data Breakr: ${prospects.length} nových prospectov bez webu`,
    text: prospects.length
      ? prospects.map((firm) => `${firm.nazov} | IČO ${firm.ico} | ${firm.kontakt_email || firm.kontakt_telefon} | ${firm.profil_url}`).join('\n')
      : 'Tento týždeň sa nenašiel žiadny nový kvalifikovaný prospect.',
    html: renderReport(prospects),
  })
  await markSent(prospects.map((firm) => firm.ico))
  return { sent: prospects.length }
}

sendWeeklyReport().then(({ sent }) => console.log(`Email odoslaný, prospectov: ${sent}.`)).catch((error) => {
  console.error(error)
  process.exit(1)
})
