# Slå på brukerkontoer (Google og Apple)

Koden ligger klar. Kontoer slås på når tre ting er gjort:

## 1. Supabase-prosjekt (gratis, data i EU)
1. Lag konto på https://supabase.com og trykk **New project**.
2. Velg region **Central EU (Frankfurt)**. Velg et sterkt databasepassord (trengs ikke senere).
3. Åpne **SQL Editor**, lim inn hele `supabase/schema.sql` og trykk **Run**.
4. **Authentication → URL Configuration**: Site URL `https://tobiasskorstad.github.io/eye/`, og legg samme adresse i **Redirect URLs**.
5. **Project Settings → API Keys**: kopier **Project URL** og **publishable/anon key**.

## 2. GitHub
Repo → **Settings → Secrets and variables → Actions → Variables**:
- `SUPABASE_URL` = Project URL (f.eks. `https://abcd….supabase.co`)
- `SUPABASE_ANON_KEY` = publishable/anon key

Kjør **Actions → publiser → Run workflow**. Da dukker «Logg inn» opp på siden.
Bruk aldri `secret`/`service_role`-nøkkelen her – bygget stopper hvis du prøver.

## 3. Innloggingsmåter
**Google:** I https://console.cloud.google.com → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
Authorized redirect URI: `https://<prosjekt>.supabase.co/auth/v1/callback`. Lim Client ID og Client secret inn i
Supabase → Authentication → Sign In / Providers → Google.

**Apple:** Krever Apple Developer Program (99 USD/år). Lag en Services ID og nøkkel, og legg dem inn under Providers → Apple.
Knappen vises automatisk når Apple er slått på i Supabase.

## 4. E-postvarsler (valgfritt)
Krever eget domene (f.eks. eye.no) verifisert hos https://resend.com.
- Secrets: `SUPABASE_SECRET_KEY` (Supabase secret key), `RESEND_API_KEY`
- Variable: `EPOST_FRA` (f.eks. `EYE <varsler@eye.no>`)

Uten dette fungerer «Følg» og «Nytt siden sist» på Min side, men det sendes ingen e-post.
