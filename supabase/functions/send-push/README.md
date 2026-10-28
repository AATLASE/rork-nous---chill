# Notifications push — déploiement

Trois pièces, dans cet ordre. Tant que la troisième n'est pas faite, l'app
fonctionne normalement : la cloche in-app se remplit, seul le téléphone ne
sonne pas.

## 1. La paire de clés VAPID

Le navigateur s'abonne avec la clé publique, le serveur signe ses envois avec la
privée. C'est ce qui prouve au service de push (FCM, Mozilla, Apple) que les
messages viennent bien de toi.

```bash
npx web-push generate-vapid-keys
```

Garde les deux valeurs sous la main. La privée ne doit jamais partir dans le
bundle web — elle ne vit que dans les secrets Supabase, ci-dessous.

## 2. La fonction

Il s'agit de mettre le fichier `index.ts` de ce dossier en ligne, et de lui
donner 4 secrets. Deux chemins au choix — le résultat est le même.

D'abord, fabrique le secret partagé entre la base et la fonction (PowerShell) :

```powershell
$b = New-Object byte[] 32; ([Security.Cryptography.RNGCryptoServiceProvider]::new()).GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

Garde le résultat : c'est `PUSH_WEBHOOK_SECRET`, il servira aussi à l'étape 3.

### Chemin A — le tableau de bord, sans rien installer

1. **Edge Functions** dans le menu de gauche → **Deploy a new function** → via
   l'éditeur. Nomme-la exactement `send-push` et colle le contenu de
   `index.ts`.
2. Dans les réglages de la fonction, **désactive « Verify JWT »**. Elle est
   appelée par la base, pas par un utilisateur connecté : il n'y a pas de JWT à
   vérifier, et elle contrôle elle-même l'en-tête `x-push-secret`.
3. **Project Settings → Edge Functions → Secrets** : ajoute les 4 valeurs
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:ton@email.fr`)
   et `PUSH_WEBHOOK_SECRET`.

### Chemin B — le CLI

`supabase/config.toml` est déjà dans le dépôt, il n'y a donc pas de
`supabase init` à faire — et le `verify_jwt = false` y est déjà déclaré.
Le `<ton-ref>` est dans l'URL du tableau de bord :
`https://supabase.com/dashboard/project/`**`<ton-ref>`**.

```powershell
cd d:\Projets\rork-nouschill\rork-nous---chill
npx supabase login
npx supabase link --project-ref <ton-ref>
npx supabase secrets set VAPID_PUBLIC_KEY="<clé publique>" VAPID_PRIVATE_KEY="<clé privée>" VAPID_SUBJECT="mailto:ton@email.fr" PUSH_WEBHOOK_SECRET="<le secret généré>"
npx supabase functions deploy send-push
```

> ⚠️ Ne lance **pas** `supabase db push`. Le schéma de ce projet a été construit
> en collant du SQL à la main, la table d'historique des migrations ne
> correspond donc pas aux fichiers locaux : `db push` tenterait de rejouer des
> migrations déjà appliquées. Continue à coller dans l'éditeur SQL.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés par la plateforme,
il n'y a rien à faire pour eux.

Vérifie que la fonction répond, avec le secret que tu viens de générer :

```bash
curl https://<ton-ref>.supabase.co/functions/v1/send-push \
  -H "x-push-secret: <PUSH_WEBHOOK_SECRET>"
# {"ok":true,"vapid":true,"serviceRole":true}
```

Les trois `true` sont la réponse à « est-ce que c'est bien configuré ». Un `401`
signifie que le secret ne correspond pas.

## 3. Le déclencheur côté base

Colle `supabase/migrations/20260802010000_push_delivery.sql` dans l'éditeur SQL,
puis renseigne les deux réglages — le même secret qu'à l'étape 2 :

```sql
insert into public.app_settings (key, value) values
  ('push_function_url', 'https://<ton-ref>.supabase.co/functions/v1/send-push'),
  ('push_webhook_secret', '<PUSH_WEBHOOK_SECRET>')
on conflict (key) do update set value = excluded.value;
```

`app_settings` a RLS activé et aucune policy : personne ne lit ce secret depuis
l'app, seul le trigger le voit.

## 4. Vercel

Ajoute la variable d'environnement du projet :

```
EXPO_PUBLIC_VAPID_PUBLIC_KEY = <clé publique>
```

Puis redéploie — c'est une variable `EXPO_PUBLIC_`, elle est inlinée dans le
bundle au build, pas lue à l'exécution. Sans elle, le bouton « Notifications
push » du profil dira que le navigateur ne les gère pas.

## Comment ça marche

```
insert dans notifications          (triggers de 20260802000000 et 20260803000000,
        │                           relances de 20260806000000 et 20260806010000)
        │
        │  trigger notifications_send_push → pg_net (asynchrone)
        ▼
POST /functions/v1/send-push       en-tête x-push-secret
        │
        ├── endpoint https://…     → Web Push chiffré (RFC 8291) → navigateur
        └── ExponentPushToken[…]   → API Expo Push → build natif
                │
                └── 404 / 410 → l'abonnement est supprimé de push_subscriptions
```

Le service worker (`expo/public/sw.js`) reçoit le push, affiche la notification
et, au clic, ouvre l'épisode concerné dans l'onglet déjà ouvert s'il y en a un.

## Ce qui ne marchera pas, et pourquoi

- **iOS < 16.4** : pas de push web du tout.
- **iOS 16.4+** : uniquement si l'utilisateur a *installé* la PWA sur son écran
  d'accueil (Partager → Sur l'écran d'accueil). Dans Safari en onglet, l'API
  n'existe pas. C'est une limite d'Apple, pas du code.
- **Build natif iOS/Android** : la branche Expo est prête côté serveur, mais
  aucun token ne s'enregistre tant que `app.json` n'a pas de
  `extra.eas.projectId` et que l'app tourne dans Expo Go.
