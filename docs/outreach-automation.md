# Týždenný outreach report

Automatizácia každú nedeľu o 18:00 UTC:

1. pridá čerstvo vzniknuté aktívne firmy z Košického kraja do frontu,
2. overí ich cez Google Places,
3. ako `prospect` označí iba zhodný aktívny business profil, ktorý má telefón
   a nemá uvedený web,
4. odošle HTML e-mail a až po úspešnom SMTP označí konkrétne firmy ako odoslané.

Firmy s webom (`ma_web`), zatvorené firmy (`neaktivna`) a výsledky, pri ktorých
nesedí názov alebo mesto, sa do e-mailu nedostanú. `bez_info` a `bez_kontaktu`
sa kontrolujú znova v ďalších behoch; poradie uprednostňuje najdlhšie
nekontrolované firmy, aby sa fronta nezasekla na stále rovnakých záznamoch.

## GitHub secrets

Workflow `.github/workflows/outreach-weekly.yml` potrebuje:

- `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
- `GOOGLE_PLACES_API_KEY` s povoleným Places API (New),
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_TO`.

Pre Gmail použite App Password, nie bežné heslo. `SMTP_HOST` je
`smtp.gmail.com` a `SMTP_PORT` je `587`. Hodnoty patria iba do GitHub Secrets
alebo lokálneho `.env.local`, nikdy do repozitára.

## Ručné spustenie

```powershell
npm run outreach:sync
npm run outreach:check
npm run outreach:report
```

Pred prvým ostrým behom aplikujte migráciu:

```powershell
npx prisma migrate deploy
```

Workflow sa dá otestovať aj cez **Actions → Data Breakr - týždenný outreach
report → Run workflow**. Aj prázdny report sa odošle, takže je vidieť, že
plánovač a SMTP fungujú.
