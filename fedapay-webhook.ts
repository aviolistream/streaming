// ============================================================
// AvioliStream — Webhook FedaPay
// Confirme les paiements côté serveur (source de vérité), met à
// jour la commande correspondante dans Supabase, attribue
// automatiquement un profil (Netflix/Prime) libre avec un PIN,
// et envoie un email récap au vendeur avec un lien WhatsApp
// pré-rempli pour prévenir le client.
//
// Règles d'attribution :
//   - Offres "Standard" (Netflix Standard, Prime Video Standard) :
//     jusqu'à 2 clients peuvent partager le même profil, avec le
//     même code PIN.
//   - Autres offres (ex: Premium 4K UHD) : 1 client exclusif par
//     profil, comme avant.
//
// Secrets requis :
//   FEDAPAY_WEBHOOK_SECRET -> clé secrète du endpoint webhook (dashboard FedaPay)
//   RESEND_API_KEY         -> clé API Resend (resend.com -> API Keys)
//
// Limite connue : le PIN est généré et enregistré côté base, mais
// doit être saisi manuellement par le vendeur sur le vrai profil
// Netflix/Prime Video (aucun accès direct à ces plateformes ici).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:fedapay@1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEBHOOK_SECRET = Deno.env.get("FEDAPAY_WEBHOOK_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_EMAIL = "aviolistream@gmail.com";
const BRAND = "AvioliStream";
const SITE_BASE_URL = "https://aviolistream.github.io/streaming/";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

// Netflix utilise un PIN à 4 chiffres, Prime Video à 5 chiffres.
function generatePin(platform: string): string {
  const digits = platform === "Prime Video" ? 5 : 4;
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function isFilled(v: string | null | undefined): boolean {
  return !!v && v.trim() !== "";
}

function isExpired(dateStr: string | null | undefined, now: Date): boolean {
  return !!dateStr && new Date(dateStr) < now;
}

// Convertit "1 mois", "3 mois", "1 an" etc. en nombre de jours à ajouter
function parseDurationDays(duration: string): number {
  const match = duration.match(/(\d+)/);
  const n = match ? parseInt(match[1], 10) : 1;
  if (/an/i.test(duration)) return n * 365;
  return n * 30; // mois par défaut
}

function platformLabel(rawPlatform: string): string {
  const p = rawPlatform.toLowerCase();
  if (p.includes("netflix")) return "Netflix";
  if (p.includes("prime")) return "Prime Video";
  return rawPlatform;
}

// "Netflix Standard" / "Prime Video Standard" -> capacité 2, sinon 1 (Premium, etc.)
function planCapacity(service: string): number {
  return /standard/i.test(service) ? 2 : 1;
}

// Nom du service tel qu'affiché au client (on retire "4K UHD" du libellé).
function displayServiceName(service: string): string {
  return service.replace(/4K\s*UHD/i, "").replace(/\s+/g, " ").trim();
}

// Convertit un nom de service ("Netflix Standard") en nom de page produit
// sur le nouveau site GitHub Pages ("netflix-standard").
function serviceSlug(service: string): string {
  return displayServiceName(service)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Libellé du profil affiché au client : le profil exclusif (capacité 1,
// ex. Premium) est nommé au nom du client ; le profil partagé (capacité 2,
// ex. Standard) reste générique ("Invité N").
function profileDisplayLabel(capacity: number, profileIndex: number, clientName: string): string {
  return capacity === 1 ? clientName : `Invité ${profileIndex}`;
}

async function sendResendEmail(to: string, subject: string, html: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AvioliStream <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Erreur envoi email Resend:", await res.text());
    }
  } catch (err) {
    console.error("Erreur réseau envoi email:", err);
  }
}

// ------------------------------------------------------------
// Attribution automatique de profil
// ------------------------------------------------------------

interface ProfileSlot {
  phone: string | null;
  expiry: string | null;
  clientName: string | null;
  phone2?: string | null;
  expiry2?: string | null;
  clientName2?: string | null;
  pin?: string | null;
  capacity?: number; // 1 = exclusif, 2 = partageable (Standard)
}

interface Account {
  id: string;
  brand: string;
  label: string;
  platform: string;
  email?: string | null; // login du compte, affiché au client dans le message WhatsApp
  password?: string | null; // mot de passe du compte (affiché au client pour Prime Video)
  profiles: ProfileSlot[];
}

interface Assignment {
  accountLabel: string;
  accountEmail: string | null;
  accountPassword: string | null;
  platform: string;
  profileIndex: number; // 1-based, pour affichage humain ("Invité N")
  role: "primary" | "secondary";
  pin: string;
  expiry: string;
  service: string;
  isRenewal: boolean;
  capacity: number; // 1 = exclusif (profil au nom du client), 2 = partagé ("Invité N")
}

// Cherche un slot compatible dans un compte donné.
// Retourne l'index du profil + le rôle (primary/secondary) + le PIN à utiliser,
// ou null si aucun slot compatible.
function findSlot(
  profiles: ProfileSlot[],
  capacity: number,
  now: Date,
): { idx: number; role: "primary" | "secondary" } | null {
  // Priorité 1 (uniquement si on demande une place partagée) : rejoindre
  // un profil déjà partagé (capacité 2) dont la place "secondaire" est libre.
  // NB : un profil expiré mais pas encore vidé manuellement par le vendeur
  // reste considéré comme occupé — seul un nom de client effacé libère la place.
  if (capacity === 2) {
    for (let idx = 0; idx < profiles.length; idx++) {
      const slot = profiles[idx];
      const primaryActive = isFilled(slot.clientName);
      const secondaryFree = !isFilled(slot.clientName2);
      if (slot.capacity === 2 && primaryActive && secondaryFree) {
        return { idx, role: "secondary" };
      }
    }
  }

  // Priorité 2 : prendre la place "primaire" d'un profil dont elle est libre.
  // Si la demande est exclusive (capacité 1), on refuse un profil dont la
  // place secondaire est encore occupée par quelqu'un d'autre.
  for (let idx = 0; idx < profiles.length; idx++) {
    const slot = profiles[idx];
    const primaryFree = !isFilled(slot.clientName);
    if (!primaryFree) continue;

    const secondaryActive = isFilled(slot.clientName2);
    if (capacity === 1 && secondaryActive) continue; // pas d'exclusivité garantie

    return { idx, role: "primary" };
  }

  return null;
}

// Cherche si ce client (même numéro de téléphone) a déjà un profil sur
// une plateforme correspondante — dans ce cas il s'agit d'un
// renouvellement : on garde le même profil et le même PIN, on prolonge
// juste la date d'expiration. Si aucun téléphone ne correspond (client
// historique jamais enregistré avec ce système), on retente par nom :
// si le profil est toujours sous son nom (pas encore réattribué à
// quelqu'un d'autre), c'est bien lui.
function findRenewalSlot(
  accounts: Account[],
  wantedPlatform: string,
  phone: string,
  customerName: string,
): { account: Account; idx: number; role: "primary" | "secondary" } | null {
  const normalizedName = customerName.trim().toLowerCase();

  for (const account of accounts) {
    if (account.brand !== BRAND) continue;
    if (account.platform !== wantedPlatform) continue;

    for (let idx = 0; idx < account.profiles.length; idx++) {
      const slot = account.profiles[idx];

      if (isFilled(phone) && isFilled(slot.phone) && slot.phone === phone) {
        return { account, idx, role: "primary" };
      }
      if (isFilled(phone) && isFilled(slot.phone2) && slot.phone2 === phone) {
        return { account, idx, role: "secondary" };
      }

      // Secours par nom : le profil est toujours sous son nom, donc
      // il n'a pas encore été réattribué à un autre client.
      if (
        !isFilled(slot.phone) &&
        isFilled(slot.clientName) &&
        slot.clientName!.trim().toLowerCase() === normalizedName
      ) {
        return { account, idx, role: "primary" };
      }
      if (
        !isFilled(slot.phone2) &&
        isFilled(slot.clientName2) &&
        slot.clientName2!.trim().toLowerCase() === normalizedName
      ) {
        return { account, idx, role: "secondary" };
      }
    }
  }

  return null;
}

async function assignProfilesForOrder(order: Record<string, unknown>): Promise<{
  assignments: Assignment[];
  shortages: string[];
}> {
  const items = (order.items as Array<Record<string, unknown>>) || [];
  const assignments: Assignment[] = [];
  const shortages: string[] = [];

  const { data: accountsRow, error: accountsErr } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", "gs_accounts")
    .single();

  const { data: ordersRow, error: ordersErr } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", "gs_orders")
    .single();

  if (accountsErr || !accountsRow) {
    console.error("Impossible de lire gs_accounts:", accountsErr);
    return { assignments, shortages: ["Erreur lecture des comptes"] };
  }

  const accounts = accountsRow.value as Account[];
  const gsOrders = (ordersErr || !ordersRow) ? [] : (ordersRow.value as Record<string, unknown>[]);

  const now = new Date();

  for (const item of items) {
    const wantedPlatform = platformLabel(String(item.platform ?? ""));
    const service = String(item.service ?? wantedPlatform);
    const capacity = planCapacity(service);
    const wantedCount = Number(item.profiles ?? 1);
    const durationDays = parseDurationDays(String(item.duration ?? "1 mois"));

    let remaining = wantedCount;
    const phone = String(order.customer_phone ?? "");

    // 1. Le client a-t-il déjà un profil sur cette plateforme (même numéro) ?
    // Si oui, c'est un renouvellement : on garde le même profil/PIN et on
    // prolonge simplement la date d'expiration (à partir de la date actuelle
    // si l'abonnement n'est pas encore expiré, pour ne pas faire perdre de
    // jours déjà payés).
    if (remaining > 0) {
      const customerName = String(order.customer_name ?? "");
      const renewal = findRenewalSlot(accounts, wantedPlatform, phone, customerName);
      if (renewal) {
        const { account, idx, role } = renewal;
        const slot = account.profiles[idx];
        const currentExpiry = role === "primary" ? slot.expiry : slot.expiry2;
        const base = currentExpiry && new Date(currentExpiry) > now ? new Date(currentExpiry) : now;
        const newExpiry = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        const pin = slot.pin ?? generatePin(account.platform);
        slot.pin = pin;
        if (role === "primary") {
          slot.expiry = newExpiry;
          if (!isFilled(slot.phone)) slot.phone = phone; // client historique : on enregistre son numéro
        } else {
          slot.expiry2 = newExpiry;
          if (!isFilled(slot.phone2)) slot.phone2 = phone;
        }

        assignments.push({
          accountLabel: account.label,
          accountEmail: account.email ?? null,
          accountPassword: account.password ?? null,
          platform: account.platform,
          profileIndex: idx + 1,
          role,
          pin,
          expiry: newExpiry,
          service,
          isRenewal: true,
          capacity,
        });

        gsOrders.unshift({
          id: shortId(),
          brand: BRAND,
          phone,
          price: String(item.price ?? ""),
          start: now.toISOString(),
          client: String(order.customer_name ?? ""),
          expiry: newExpiry,
          created: now.toISOString(),
          duration: Math.round(durationDays / 30) || 1,
          platform: account.platform,
          accountLabel: account.label,
          profileIndex: idx + 1,
          role,
          pin,
          service,
          orderReference: String(order.reference ?? ""),
          renewal: true,
        });

        remaining -= 1;
      }
    }

    // 2. Sinon (nouveau client, ou places supplémentaires demandées),
    // attribution normale d'un profil libre.
    for (const account of accounts) {
      if (remaining <= 0) break;
      if (account.brand !== BRAND) continue;
      if (account.platform !== wantedPlatform) continue;

      while (remaining > 0) {
        const found = findSlot(account.profiles, capacity, now);
        if (!found) break;

        const slot = account.profiles[found.idx];
        const expiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

        let pin: string;
        if (found.role === "secondary") {
          // On rejoint un profil déjà partagé : même PIN que le 1er client.
          pin = slot.pin ?? generatePin(account.platform);
          slot.pin = pin;
          slot.clientName2 = String(order.customer_name ?? "");
          slot.phone2 = phone;
          slot.expiry2 = expiry;
        } else {
          // Nouvelle place primaire : nouveau PIN, sauf si une place
          // secondaire active existe déjà (profil partagé toujours en cours,
          // reconnue uniquement si son nom n'a pas été vidé manuellement).
          const secondaryStillActive = isFilled(slot.clientName2);
          pin = secondaryStillActive && slot.pin ? slot.pin : generatePin(account.platform);
          slot.pin = pin;
          slot.clientName = String(order.customer_name ?? "");
          slot.phone = phone;
          slot.expiry = expiry;
          slot.capacity = capacity;
          if (!secondaryStillActive) {
            // Le profil redevient "neuf" : on efface une éventuelle
            // ancienne place secondaire déjà vidée manuellement.
            slot.clientName2 = null;
            slot.phone2 = null;
            slot.expiry2 = null;
          }
        }

        assignments.push({
          accountLabel: account.label,
          accountEmail: account.email ?? null,
          accountPassword: account.password ?? null,
          platform: account.platform,
          profileIndex: found.idx + 1,
          role: found.role,
          pin,
          expiry,
          service,
          isRenewal: false,
          capacity,
        });

        gsOrders.unshift({
          id: shortId(),
          brand: BRAND,
          phone: String(order.customer_phone ?? ""),
          price: String(item.price ?? ""),
          start: now.toISOString(),
          client: String(order.customer_name ?? ""),
          expiry,
          created: now.toISOString(),
          duration: Math.round(durationDays / 30) || 1,
          platform: account.platform,
          accountLabel: account.label,
          profileIndex: found.idx + 1,
          role: found.role,
          pin,
          service,
          orderReference: String(order.reference ?? ""),
        });

        remaining -= 1;
      }
    }

    if (remaining > 0) {
      shortages.push(`${wantedPlatform} (${remaining} profil(s) manquant(s) — aucun slot libre)`);
    }
  }

  if (assignments.length > 0) {
    const { error: updAccErr } = await supabase
      .from("kv_store")
      .update({ value: accounts, updated_at: now.toISOString() })
      .eq("key", "gs_accounts");
    if (updAccErr) console.error("Erreur sauvegarde gs_accounts:", updAccErr);

    const { error: updOrdErr } = await supabase
      .from("kv_store")
      .update({ value: gsOrders, updated_at: now.toISOString() })
      .eq("key", "gs_orders");
    if (updOrdErr) console.error("Erreur sauvegarde gs_orders:", updOrdErr);
  }

  return { assignments, shortages };
}

// ------------------------------------------------------------
// Emails
// ------------------------------------------------------------

async function sendPaymentEmail(
  order: Record<string, unknown>,
  assignments: Assignment[],
  shortages: string[],
) {
  const items = (order.items as Array<Record<string, unknown>>) || [];
  const itemsHtml = items
    .map(
      (i) =>
        `<li>${i.service} — ${i.duration} (${i.profiles} profil(s)) — <b>${fmt(Number(i.price))} FCFA</b></li>`,
    )
    .join("");

  const waNumber = String(order.customer_phone ?? "").replace(/\D/g, "");

  const clientName = String(order.customer_name ?? "");

  const assignmentsHtml = assignments
    .map(
      (a) => `
        <li style="margin-bottom:8px;">
          ${a.isRenewal ? "🔄 <b>Renouvellement</b> — " : ""}<b>${displayServiceName(a.service)}</b> — compte <b>${a.accountLabel}</b> (${a.accountEmail ?? "email non renseigné"}${a.platform === "Prime Video" ? ` / mdp : ${a.accountPassword ?? "non renseigné"}` : ""}), <b>${profileDisplayLabel(a.capacity, a.profileIndex, clientName)}</b>
          ${a.role === "secondary" ? " <i>(profil partagé avec un autre client — même PIN)</i>" : ""}<br>
          ${a.isRenewal ? "PIN inchangé" : "Code PIN à saisir sur le profil"} : <b style="font-size:1.1em;color:#FF3131;">${a.pin}</b><br>
          Expire le : ${new Date(a.expiry).toLocaleDateString("fr-FR")}
        </li>`,
    )
    .join("");

  const allRenewal = assignments.length > 0 && assignments.every((a) => a.isRenewal);
  const anyExclusive = assignments.some((a) => a.capacity === 1);

  const waMessageParts = assignments.map((a) => {
    const dateStr = new Date(a.expiry).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const profileLabel = profileDisplayLabel(a.capacity, a.profileIndex, clientName);
    if (a.isRenewal) {
      return [
        `🎉 Votre abonnement ${displayServiceName(a.service)} a bien été renouvelé !`,
        `👤 Profil : ${profileLabel}`,
        `🔢 PIN : ${a.pin} (inchangé)`,
        `📅 Nouvelle date d'expiration : ${dateStr}`,
      ].join("\n");
    }
    if (a.platform === "Prime Video") {
      return [
        `ℹ️ Vos accès ${displayServiceName(a.service)}`,
        `📧 Login : ${a.accountEmail ?? "—"}`,
        `🔐Mot de passe : ${a.accountPassword ?? "—"}`,
        `👤 Profil : ${profileLabel}`,
        `🔢 PIN : ${a.pin}`,
        `📅 Expire le : ${dateStr}`,
      ].join("\n");
    }
    return [
      `🔐 Vos accès ${displayServiceName(a.service)}`,
      `📧 Login : ${a.accountEmail ?? "—"}`,
      `ℹ️ Cliquez sur "code d'identification" pour recevoir votre code`,
      `👤 Profil : ${profileLabel}`,
      `🔢 PIN : ${a.pin}`,
      `📅 Expire le : ${dateStr}`,
    ].join("\n");
  });

  const waMessage = allRenewal

    ? `Bonjour ${order.customer_name} 👋\n\n` +
      `${waMessageParts.join("\n\n")}\n\n` +
      `Merci de votre fidélité 🙏\n` +
      `L'équipe AvioliStream ✨`
    : `Bonjour ${order.customer_name} 👋 Merci pour votre achat chez AvioliStream ! 🎬\n\n` +
      `${waMessageParts.join("\n\n")}\n\n` +
      `⚠️ Compte non partageable — tout partage ou modification entraîne la fin de la souscription sans remboursement.\n\n` +
      `Bon streaming à vous 🙏\n` +
      `L'équipe AvioliStream ✨`;
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`;

  const shortagesHtml = shortages.length
    ? `<p style="color:#E50914;"><b>⚠️ Attention :</b> ${shortages.join(", ")}. Attribution manuelle nécessaire.</p>`
    : "";

  const html = `
    <div style="font-family:sans-serif;line-height:1.5;">
      <h2 style="color:#FF3131;">Nouveau paiement reçu ✅</h2>
      <p><b>Référence :</b> ${order.reference}</p>
      <p><b>Client :</b> ${order.customer_name}<br>
         <b>Téléphone :</b> ${order.customer_phone}<br>
         <b>Email :</b> ${order.customer_email ?? "—"}</p>
      <p><b>Articles :</b></p>
      <ul>${itemsHtml}</ul>
      <p><b>Total payé : ${fmt(Number(order.total))} FCFA</b></p>

      ${assignments.length ? `<h3>Profils attribués automatiquement</h3><ul>${assignmentsHtml}</ul>` : ""}
      ${shortagesHtml}

      <p style="margin-top:16px;">
        <b>Étapes à faire maintenant :</b><br>
        ${allRenewal
          ? "Rien à changer sur Netflix/Prime (même profil, même PIN). Clique juste sur le bouton ci-dessous pour confirmer le renouvellement au client."
          : `1. Va sur le profil concerné et saisis le PIN indiqué ci-dessus (si un autre client l'utilise déjà avec le même PIN, rien à changer).${anyExclusive ? "<br>2. Renomme ce profil au nom du client (" + clientName + ") — c'est une offre exclusive, pas un profil \"Invité\"." : ""}<br>${anyExclusive ? "3" : "2"}. Clique sur le bouton ci-dessous pour envoyer le message prêt-à-l'emploi au client sur WhatsApp.`}
      </p>
      <p>
        <a href="${waLink}" style="background:#25D366;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Envoyer les accès sur WhatsApp
        </a>
      </p>

      <p style="color:#888;font-size:0.85em;margin-top:20px;">Transaction FedaPay : ${order.fedapay_transaction_id}</p>
    </div>
  `;

  await sendResendEmail(
    NOTIFY_EMAIL,
    `Paiement reçu — ${order.reference} (${fmt(Number(order.total))} FCFA)`,
    html,
  );
}

async function sendFailedOrderAlert(order: Record<string, unknown>, status: string) {
  const label = status === "annulee" ? "annulée" : "échouée";
  const waNumber = String(order.customer_phone ?? "").replace(/\D/g, "");

  const items = (order.items as Array<Record<string, unknown>>) || [];
  const produit = items.map((i) => displayServiceName(String(i.service ?? ""))).join(", ") || "votre abonnement";
  const checkoutURL = items.length > 0
    ? `${SITE_BASE_URL}${serviceSlug(String(items[0].service ?? ""))}.html`
    : SITE_BASE_URL;

  const waMessage =
    `Bonjour ${order.customer_name} 👋\n\n` +
    `Nous avons remarqué que vous n'avez pas finalisé votre commande. Il ne vous reste qu'une étape pour terminer votre achat et pouvoir bénéficier de : ${produit}\n\n` +
    `👉 Finalisez votre paiement ici: ${checkoutURL}\n\n` +
    `Besoin d'aide ? Répondez-moi ici, je suis là 🙏\n\n` +
    `L'équipe AvioliStream ✨`;
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`;

  const html = `
    <div style="font-family:sans-serif;line-height:1.5;">
      <h2 style="color:#E50914;">Commande ${label} ⚠️</h2>
      <p><b>Référence :</b> ${order.reference}</p>
      <p><b>Client :</b> ${order.customer_name}<br>
         <b>Téléphone :</b> ${order.customer_phone}<br>
         <b>Email :</b> ${order.customer_email ?? "—"}</p>
      <p><b>Total :</b> ${fmt(Number(order.total))} FCFA</p>
      <p>Le paiement n'a pas abouti. Message prêt à envoyer :</p>
      <p><a href="${waLink}" style="background:#25D366;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">Envoyer sur WhatsApp</a></p>
    </div>
  `;

  await sendResendEmail(
    NOTIFY_EMAIL,
    `Commande ${label} — ${order.reference} — à relancer`,
    html,
  );
}

async function sendCustomerReminderEmail(order: Record<string, unknown>) {
  const email = order.customer_email as string | null;
  if (!email) return;

  const html = `
    <div style="font-family:sans-serif;line-height:1.5;">
      <h2 style="color:#FF3131;">Ta commande n'a pas pu être finalisée</h2>
      <p>Bonjour ${order.customer_name},</p>
      <p>Le paiement de ta commande <b>${order.reference}</b> (${fmt(Number(order.total))} FCFA) n'a pas abouti.</p>
      <p>Tu peux réessayer directement sur le site AvioliStream quand tu veux.</p>
      <p>Besoin d'aide ? Contacte-nous sur WhatsApp.</p>
    </div>
  `;

  await sendResendEmail(email, `Ta commande ${order.reference} n'a pas été finalisée`, html);
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("X-FEDAPAY-SIGNATURE") ?? "";
  const rawBody = await req.text();

  let event;
  try {
    event = Webhook.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature webhook invalide:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const transaction = event.entity ?? event.data ?? {};
  const reference =
    transaction?.custom_metadata?.order_reference ??
    transaction?.metadata?.order_reference;

  if (!reference) {
    console.warn("Webhook reçu sans order_reference, ignoré:", event.name);
    return new Response("ok (no reference)", { status: 200 });
  }

  let newStatus: string | null = null;
  if (event.name === "transaction.approved") newStatus = "payee";
  else if (event.name === "transaction.declined") newStatus = "echouee";
  else if (event.name === "transaction.canceled") newStatus = "annulee";

  if (!newStatus) {
    return new Response("ok (ignored event)", { status: 200 });
  }

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("reference", reference)
    .single();

  const alreadyPaid = existingOrder?.status === "payee";

  const { data: updatedOrder, error } = await supabase
    .from("orders")
    .update({
      status: newStatus,
      fedapay_transaction_id: String(transaction.id ?? ""),
    })
    .eq("reference", reference)
    .select()
    .single();

  if (error) {
    console.error("Erreur mise à jour commande:", error);
    return new Response("DB error", { status: 500 });
  }

  if (updatedOrder) {
    if (newStatus === "payee") {
      let assignments: Assignment[] = [];
      let shortages: string[] = [];
      if (!alreadyPaid) {
        const result = await assignProfilesForOrder(updatedOrder);
        assignments = result.assignments;
        shortages = result.shortages;
      }
      await sendPaymentEmail(updatedOrder, assignments, shortages);
    } else if (newStatus === "echouee" || newStatus === "annulee") {
      await sendFailedOrderAlert(updatedOrder, newStatus);
      await sendCustomerReminderEmail(updatedOrder);
    }
  }

  return new Response("ok", { status: 200 });
});
