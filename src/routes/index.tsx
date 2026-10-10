import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carnet — le carnet du boutiquier, sur votre téléphone" },
      { name: "description", content: "Notez un crédit en 3 secondes, le client est prévenu sur WhatsApp et reçoit un rappel doux. Tout est horodaté." },
      { property: "og:title", content: "Carnet — le carnet du boutiquier" },
      { property: "og:description", content: "Crédits clients notés en 3 secondes, notifiés sur WhatsApp, horodatés des deux côtés." },
    ],
  }),
  component: Index,
});

function Index() {
  const [price, setPrice] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.from("app_settings").select("monthly_price").single().then(({ data }) => setPrice(data?.monthly_price ?? null));
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="font-display text-2xl font-extrabold text-primary">Carnet</span>
        <Button asChild variant={signedIn ? "default" : "outline"}>
          <Link to={signedIn ? "/carnet" : "/auth"}>{signedIn ? "Mon carnet" : "Se connecter"}</Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-5xl gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <p className="inline-block rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">Fini le cahier qui se perd</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] md:text-6xl">
            Le carnet du boutiquier, <span className="text-primary">dans votre poche.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Notez un crédit en 3 secondes. Votre client reçoit le détail sur WhatsApp, puis un rappel doux. Tout est écrit et horodaté, chez vous comme chez lui.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Essayer 14 jours gratuits</Link></Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Ensuite {price ? new Intl.NumberFormat("fr-FR").format(price) : "…"} FCFA / mois · Orange Money, Moov Money ou carte
          </p>
        </div>

        <div className="rotate-1 rounded-2xl border bg-card p-5 shadow-lg">
          <div className="border-b border-dashed pb-2 text-sm text-muted-foreground">Mme Ouédraogo · solde 4 500 FCFA</div>
          {[
            ["12 oct · 08:14", "Riz 5 kg, huile 1 L", "+ 6 000"],
            ["15 oct · 18:02", "Paiement Orange Money", "− 3 000"],
            ["18 oct · 07:41", "Savon x3, sucre", "+ 1 500"],
          ].map(([d, p, a]) => (
            <div key={d} className="flex items-center justify-between border-b border-dashed py-3 last:border-0">
              <div>
                <div className="font-medium">{p}</div>
                <div className="text-xs text-muted-foreground">{d}</div>
              </div>
              <div className={a.startsWith("+") ? "font-bold text-destructive" : "font-bold text-success"}>{a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-card/60">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 py-14 md:grid-cols-3">
          {[
            ["3 secondes", "Choisissez le client, tapez le montant et les produits. C'est noté, avec la date et l'heure."],
            ["Le client est prévenu", "Un message WhatsApp part avec le détail et le lien vers son carnet."],
            ["Rappel doux", "Les clients qui tardent apparaissent tout seuls. Un geste et le rappel aimable est envoyé."],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="text-xl font-bold">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
