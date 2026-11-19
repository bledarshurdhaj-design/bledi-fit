# BLEDI FIT + BLEDI AI COACH

Aplikacion PWA për humbje peshe dhe disiplinë: Next.js 15 + TypeScript + Supabase (databaza dhe hyrja në llogari) + Web Push (VAPID) + AI Coach në server.

## Çfarë përmban

| Moduli | Faqja |
|---|---|
| Faqja kryesore: pesha, objektivi, kg që mbeten, shiriti i progresit, kcal dhe proteina e sotme, 4 butona të mëdhenj, lista ditore | `/` |
| Pesha: regjistrim me 1 prekje, data dhe ora automatike, historiku, krahasimi javor, grafiku | `/pesha` |
| Ushqimi: 11 ushqime nga USDA, gramët, llogaritja automatike, ushqime personale, vlerësim me foto ose përshkrim nga AI (shënohet si "≈ vlerësim") | `/ushqimi` |
| Stërvitja: programi 4-ditor, kutitë e kontrollit, butoni "U krye", biçikleta e mëngjesit | `/stervitja` |
| MOS U DORËZO – VAZHDO TANI: kohëmatësi 2 minuta, uji, uri apo dëshirë, alternativat, këshilla nga AI | `/dua-te-ha` |
| BLEDI AI COACH: bisedë, check-in ditor, analiza javore, propozime për planin (Prano/Refuzo) | `/coach` |
| Progresi: raporti javor, grafiku, sugjerimi për kaloritë | `/progresi` |
| Cilësimet: profili, njoftimet, eksportimi i të dhënave, dalja | `/cilesimet` |

### Rregullat e sigurisë së AI (të zbatuara në kod, jo vetëm në prompt)
- AI merr **vetëm të dhënat reale** të përdoruesit (të llogaritura në server, `src/lib/coachContext.ts`). Kur mungojnë të dhënat, kjo i thuhet AI-së në mënyrë të qartë.
- Vlerat e matura dallohen nga vlerësimet e AI (`source = ai_estimate`).
- Pesha vlerësohet sipas mesatareve 7-ditore, jo sipas një peshimi të vetëm.
- AI **nuk mund ta ndryshojë planin**. Ai vetëm krijon një propozim. Serveri e kontrollon brenda kufijve: kaloritë 1900–3500 dhe ±250 në një hap; proteina ±20 g; kardio 0–45 min. Plani ndryshon vetëm pasi ti shtyp "Prano".
- Çelësi i AI dhe çelësat e tjerë sekretë qëndrojnë vetëm në server. Ka një limit ditor kërkesash (`AI_DAILY_LIMIT`).

---

## 1. Krijo databazën (Supabase)

1. Hap [supabase.com](https://supabase.com) dhe krijo një projekt. Zgjidh rajonin **Frankfurt (eu-central-1)**.
2. Shko te **SQL Editor → New query**, ngjit të gjithë përmbajtjen e `supabase/schema.sql` dhe shtyp **Run**.
   Kjo krijon tabelat, sigurinë RLS (çdo përdorues sheh vetëm të dhënat e veta), 11 ushqimet USDA dhe krijimin automatik të profilit me vlerat tuaja: 101.75 kg, 90 kg, 2300 kcal, 180–190 g proteinë etj.
3. Te **Authentication → Providers → Email** lëre të aktivizuar. Pasi të krijosh llogarinë tënde, mund të çaktivizosh regjistrimet e reja te **Authentication → Sign In / Providers → "Allow new users to sign up"**, që askush tjetër të mos regjistrohet.
4. Te **Authentication → URL Configuration → Site URL** vendos domain-in e aplikacionit, p.sh. `https://bledi-fit.vercel.app`.
5. Te **Project Settings → API** kopjo:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**sekret**)

### Backup
- **Supabase Pro** bën backup automatik çdo ditë. Plani Free nuk ka backup të shkarkueshëm.
- Te projekti ka një GitHub Action, `.github/workflows/backup.yml`, që bën `pg_dump` çdo natë. Te GitHub → Settings → Secrets → Actions shto `SUPABASE_DB_URL`. Këtë e merr te Supabase → **Connect → Session pooler URI**, me fjalëkalimin e databazës.
- Përveç kësaj, te **Cilësimet → Eksporto të dhënat** shkarkon çdo gjë në JSON.

## 2. Çelësat e shërbimeve të jashtme

| Variabla | Ku e merr | Sekret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API | jo (mbrohen nga RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | **PO** |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys (kërkon kredi në llogari) | **PO** |
| `ANTHROPIC_MODEL` | opsional, parazgjedhja `claude-sonnet-5-5` | jo |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | gjenero me `npx web-push generate-vapid-keys` | privati **PO** |
| `VAPID_SUBJECT` | `mailto:emaili-yt` | jo |
| `CRON_SECRET` | çdo varg i gjatë, p.sh. `openssl rand -hex 32` | **PO** |

Kopjo `.env.example` si `.env.local` për testim në kompjuter.

## 3. Instalimi dhe publikimi (Vercel)

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # kontrollo që ndërtimi kalon pa gabime
```

Publikimi:
1. Ngarko projektin në një repo GitHub (private).
2. Te [vercel.com](https://vercel.com) zgjidh **Add New → Project** dhe importo repon.
3. Te **Settings → Environment Variables** shto të gjitha variablat e tabelës më sipër.
4. Shtyp **Deploy**. Pas çdo ndryshimi të variablave `NEXT_PUBLIC_*` duhet bërë **Redeploy**.
5. Hap domain-in, krijo llogarinë dhe hyr.

> AI Coach, push dhe cron kërkojnë një server Node.js (Vercel, Railway etj.). Hostimi statik nuk mjafton.

## 4. Instalimi në iPhone (PWA)

1. Hape aplikacionin në **Safari**, jo në Chrome.
2. Shtyp **Share** (katrori me shigjetë) → **Add to Home Screen** → **Add**.
3. Hape **BLEDI FIT** nga ikona në Home Screen. Do të hapet në ekran të plotë, pa shiritin e Safari-t.
4. Hyr me email dhe fjalëkalim.

## 5. Njoftimet push: konfigurimi dhe testimi

**Kërkesat në iPhone:** iOS 16.4 ose më i ri, dhe aplikacioni duhet hapur **nga Home Screen**. Në Safari të zakonshëm iOS nuk i lejon njoftimet push.

1. Sigurohu që `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` dhe `CRON_SECRET` janë vendosur në Vercel dhe që ke bërë Redeploy.
2. Në aplikacion shko te **Cilësimet → AKTIVIZO NJOFTIMET → Allow**.
3. Shtyp **Dërgo provë**. Duhet të marrësh menjëherë një njoftim të vërtetë. Provoje edhe me aplikacionin të mbyllur.
4. **Kujtuesit automatikë (08:00, 15:00, 19:00).** Vercel Hobby nuk lejon cron çdo orë, prandaj përdoret Supabase:
   - Supabase → **Database → Extensions**: aktivizo `pg_cron` dhe `pg_net`.
   - Hap `supabase/cron.sql`, zëvendëso domain-in dhe `CRON_SECRET`, pastaj **Run** te SQL Editor.
   - Serveri thirret çdo orë dhe dërgon kujtuesin vetëm kur ora lokale (`Europe/Belgrade`) është 08, 15 ose 19. Secili kujtues dërgohet vetëm një herë në ditë.
   - Kontrolli manual i cron-it:
     ```bash
     curl -X POST https://DOMAIN/api/cron/reminders -H "Authorization: Bearer CRON_SECRET"
     ```
     Përgjigjja `{"ok":true,"sent":0,...}` jashtë orëve 08/15/19 është normale.
   - Ekzekutimet i sheh me `select * from cron.job_run_details order by start_time desc limit 10;`
5. Secilin kujtues mund ta aktivizosh ose çaktivizosh veç e veç te Cilësimet.
6. **Rezerva:** nëse push nuk është aktiv, kujtuesi shfaqet në faqen kryesore në orarin përkatës (08–12, 15–18, 19–23).

Nëse push nuk është konfiguruar, aplikacioni e thotë hapur dhe nuk bën sikur funksionon.

## Struktura

```
supabase/schema.sql          tabelat + RLS + ushqimet USDA
supabase/cron.sql            thirrja çdo orë për kujtuesit
public/sw.js                 Service Worker (offline + push)
src/app/api/coach            AI Coach (bisedë, uri/dëshirë, check-in, analizë javore)
src/app/api/coach/estimate   vlerësimi i ushqimit nga foto ose përshkrimi
src/app/api/coach/proposal   pranimi ose refuzimi i ndryshimeve të planit
src/app/api/push/*           abonimi dhe njoftimi provë
src/app/api/cron/reminders   kujtuesit 08/15/19
src/lib/coachContext.ts      të dhënat reale → konteksti për AI
src/lib/stats.ts             trendi i peshës, mesataret, sugjerimi i kalorive
```

## Shënim shëndetësor
2,300 kcal dhe 180–190 g proteinë janë vlerësime fillestare, jo recetë mjekësore. Për çdo problem shëndetësor konsultohu me mjekun.
