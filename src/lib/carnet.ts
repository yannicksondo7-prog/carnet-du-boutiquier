export function fcfa(n: number, currency = "FCFA") {
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${currency}`;
}

export function stamp(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Normalise un numéro burkinabè en chiffres internationaux (226XXXXXXXX). */
export function waDigits(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "226" + d;
  return d;
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export function clientUrl(token: string) {
  return `${window.location.origin}/c/${token}`;
}

export function entryMessage(opts: {
  shop: string;
  name: string;
  kind: "credit" | "payment";
  amount: number;
  products?: string | null;
  at: string;
  balance: number;
  token: string;
}) {
  const what =
    opts.kind === "credit"
      ? `un crédit de ${fcfa(opts.amount)}${opts.products ? ` (${opts.products})` : ""}`
      : `un paiement de ${fcfa(opts.amount)}`;
  return `Bonjour ${opts.name}, ${opts.shop} a enregistré ${what} le ${stamp(opts.at)}.\nVotre solde : ${fcfa(opts.balance)}.\nVotre carnet : ${clientUrl(opts.token)}`;
}

export function reminderMessage(opts: { shop: string; name: string; balance: number; token: string }) {
  return `Bonjour ${opts.name} 🙂 petit rappel amical de ${opts.shop} : il reste ${fcfa(opts.balance)} sur votre carnet. Passez quand vous pouvez, merci pour votre fidélité !\nDétails : ${clientUrl(opts.token)}`;
}
