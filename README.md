# BLEDI FIT + BLEDI AI COACH

Aplikacion PWA për humbje peshe dhe disiplinë: Next.js 15 + TypeScript + **PostgreSQL** (Railway) + hyrje me email/fjalëkalim + Web Push (VAPID) + AI Coach në server.

**Live:** https://bledi-fit-production.up.railway.app

## Çfarë përmban

| Moduli | Faqja |
|---|---|
| Faqja kryesore: pesha, objektivi, kg që mbeten, progresi, kcal/proteina sot, 4 butona, lista ditore | `/` |
| Pesha: regjistrim i shpejtë, historiku, krahasimi javor, grafiku | `/pesha` |
| Ushqimi: 11 ushqime USDA, gram → kcal/makro, ushqime personale, vlerësim me foto/përshkrim nga AI | `/ushqimi` |
| Stërvitja: programi 4-ditor, kutitë e kontrollit, biçikleta e mëngjesit | `/stervitja` |
| MOS U DORËZO – VAZHDO TANI (dua të ha) | `/dua-te-ha` |
| BLEDI AI COACH: bisedë, check-in ditor, analizë javore, propozime (Prano/Refuzo) | `/coach` |
| Progresi dhe raporti javor | `/progresi` |
| Cilësimet, njoftimet, eksporti i të dhënave | `/cilesimet` |

## Arkitektura dhe siguria

- **Databaza:** PostgreSQL. Tabelat krijohen **automatikisht** në nisjen e parë të serverit (`src/lib/schema.ts`), pa hapa manualë.
- **Hyrja:** email + fjalëkalim (scrypt), sesion me cookie `HttpOnly; Secure; SameSite=Lax`, 60 ditë. Kufizim i përpjekjeve të hyrjes.
- **Regjistrimi:** lejohet vetëm **llogaria e parë** (aplikacion personal). Për llogari të tjera: `ALLOW_SIGNUP=true`.
- **Të dhënat:** shfletuesi nuk lidhet kurrë direkt me databazën. Çdo kërkesë kalon nga `/api/db`, ku serveri lejon vetëm tabelat/kolonat e listuara dhe shton gjithmonë `user_id = përdoruesi`.
- **AI:** çelësi qëndron vetëm në server; AI merr vetëm të dhënat reale; ndryshimet e planit vetëm me miratimin tënd dhe brenda kufijve (kaloritë 1900–3500, ±250).

## 1. Publikimi në Railway

Projekti `bledi-fit` në Railway ka dy shërbime:
- **Postgres** – databaza.
- **bledi-fit** – aplikacioni, i lidhur me repon GitHub (çdo `git push` në `main` e rindërton).

Variablat te shërbimi **bledi-fit → Variables**:

| Variabla | Vlera | Sekret? |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencë – vendoset automatikisht) | **PO** |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | **PO** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | të vendosura | privati **PO** |
| `CRON_SECRET` | i vendosur (për kontroll manual) | **PO** |
| `ALLOW_SIGNUP` | bosh/`false` (vetëm llogaria e parë) | jo |

## 2. Databaza dhe backup

- Asgjë për të ekzekutuar – skema krijohet vetë.
- **Backup:** Railway → Postgres → **Backups** (planet me pagesë) ose GitHub Action `.github/workflows/backup.yml` (pg_dump çdo natë): shto sekretin `DATABASE_URL` me vlerën `DATABASE_PUBLIC_URL` nga Railway → Postgres → Variables.
- Edhe nga aplikacioni: **Cilësimet → Eksporto të gjitha të dhënat (JSON)**.

## 3. Hyrja e parë

1. Hap linkun – faqja e parë është **Krijo llogarinë**.
2. Shkruaj email-in dhe fjalëkalimin (min. 8 karaktere). Profili krijohet me vlerat tuaja: 101.75 kg → 90 kg, 2300 kcal, 180–190 g proteinë.
3. Pas kësaj, regjistrimet e reja mbyllen automatikisht.

## 4. Instalimi në iPhone (PWA)

1. Hape linkun në **Safari**.
2. **Share** → **Add to Home Screen** → **Add**.
3. Hape **BLEDI FIT** nga Home Screen dhe hyr.

## 5. Njoftimet push

**iPhone:** iOS 16.4+ dhe aplikacioni i hapur **nga Home Screen**.

1. **Cilësimet → AKTIVIZO NJOFTIMET → Allow**.
2. **Dërgo provë** – duhet të vijë njoftimi menjëherë (provoje edhe me aplikacionin të mbyllur).
3. Kujtuesit 08:00 / 15:00 / 19:00 (ora e Kosovës) dërgohen **automatikisht nga serveri** (kontroll çdo 5 minuta, `src/instrumentation.ts`), një herë në ditë secili. Asnjë cron i jashtëm nuk nevojitet.
4. Kontroll manual:
   ```bash
   curl -X POST https://bledi-fit-production.up.railway.app/api/cron/reminders -H "Authorization: Bearer CRON_SECRET"
   ```
5. Rezervë: kur push s'është aktiv, kujtuesi shfaqet në faqen kryesore.

## Zhvillimi lokal

```bash
npm install
cp .env.example .env.local   # vendos DATABASE_URL të një Postgres lokal
npm run dev
```

## Struktura

```
src/lib/schema.ts            tabelat (krijohen automatikisht)
src/lib/db.ts                lidhja me Postgres + ekzekutuesi i sigurt i pyetjeve
src/lib/server.ts            fjalëkalimet, sesionet, mbrojtja CSRF
src/app/api/auth/*           regjistrim, hyrje, dalje, përdoruesi aktual
src/app/api/db               pika e vetme e të dhënave për aplikacionin
src/app/api/coach/*          AI Coach, vlerësimi i ushqimit, propozimet
src/app/api/push/*           abonimi dhe njoftimi provë
src/lib/reminders.ts         kujtuesit 08/15/19
public/sw.js                 Service Worker (offline + push)
```

## Shënim shëndetësor
2,300 kcal dhe 180–190 g proteinë janë vlerësime fillestare, jo recetë mjekësore. Për çdo problem shëndetësor konsultohu me mjekun.
