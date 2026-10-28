# Emails d'authentification

Les six emails que Supabase Auth envoie, aux couleurs de Gather. Tant qu'ils ne
sont pas collés dans le tableau de bord, Supabase envoie ses modèles par défaut,
en anglais.

## Les installer

**Supabase → Authentication → Emails → Templates.** Pour chaque onglet, colle
l'objet dans *Subject* et le contenu du fichier HTML dans *Message body*, puis
**Save**.

| Onglet Supabase        | Fichier                  | Objet                                  | Utilisé par l'app ?                     |
|------------------------|--------------------------|----------------------------------------|-----------------------------------------|
| Confirm signup         | `confirmation.html`      | Confirme ton adresse pour Gather       | Oui : inscription                       |
| Reset password         | `recovery.html`          | Réinitialise ton mot de passe Gather   | Oui : « Mot de passe oublié »           |
| Magic link             | `magic_link.html`        | Ton lien de connexion à Gather         | Non, prêt si tu l'ajoutes               |
| Invite user            | `invite.html`            | On t'attend sur Gather                 | Seulement si tu invites depuis Supabase |
| Change email address   | `email_change.html`      | Confirme ta nouvelle adresse Gather    | Non, prêt si tu l'ajoutes               |
| Reauthentication       | `reauthentication.html`  | Ton code de vérification Gather        | Non, prêt si tu l'ajoutes               |

## Ce qu'il faut savoir

- **`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}`…** sont remplacés
  par Supabase à l'envoi. Ne les traduis pas et ne retire pas les accolades.
- **Le prénom** vient de `{{ .Data.name }}`, enregistré à l'inscription. Quand il
  manque (invitation), la phrase se tourne sans lui.
- **« expire au bout d'une heure »** dans `recovery.html` et `magic_link.html`
  correspond au réglage par défaut (*Authentication → Providers → Email → Email
  OTP Expiration* = 3600 s). Si tu changes cette durée, change aussi le texte.
- **Le lien du bouton** renvoie vers le *Site URL* (*Authentication → URL
  Configuration*) pour la confirmation d'inscription. Il doit pointer vers le
  site Vercel, pas vers `localhost`.
- **Ces modèles ne règlent pas la délivrabilité.** Sans serveur SMTP à toi
  (*Authentication → Emails → SMTP Settings*), Supabase n'envoie qu'aux membres
  de ton équipe, avec une limite très basse par heure.
- **Le design est sombre** et déclaré comme tel (`color-scheme: dark`), pour que
  Gmail et Apple Mail ne l'inversent pas en mode sombre. Le logo est fait en
  HTML, pas en image : il s'affiche même quand la boîte mail bloque les images.
