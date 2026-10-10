import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { clientUrl, fcfa, stamp } from "@/lib/carnet";

export const Route = createFileRoute("/_authenticated/client/$id")({
  head: () => ({ meta: [{ title: "Historique client — Carnet" }, { name: "description", content: "Historique horodaté du client." }] }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [{ data: c }, { data: es }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("entries").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
      ]);
      return { c, es: es ?? [] };
    },
  });
  if (!data?.c) return <AppShell><p className="text-muted-foreground">Chargement…</p></AppShell>;
  const balance = data.es.reduce((s, e) => s + (e.kind === "credit" ? e.amount : -e.amount), 0);
  return (
    <AppShell>
      <Link to="/carnet" className="text-sm text-primary">← Clients</Link>
      <h1 className="mt-2 text-3xl font-extrabold">{data.c.name}</h1>
      <p className="text-muted-foreground">{data.c.phone} · solde <b className={balance > 0 ? "text-destructive" : "text-success"}>{fcfa(balance)}</b></p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => { navigator.clipboard.writeText(clientUrl(data.c!.share_token)); toast.success("Lien copié"); }}>
        Copier le lien du carnet client
      </Button>
      <ul className="mt-5 divide-y rounded-2xl border bg-card">
        {data.es.map((e) => (
          <li key={e.id} className="flex items-start justify-between px-4 py-3">
            <div>
              <div className="font-medium">{e.kind === "credit" ? e.products || "Crédit" : "Paiement reçu"}</div>
              <div className="text-xs text-muted-foreground">
                {stamp(e.created_at)}
                {e.notified_at && ` · prévenu ${stamp(e.notified_at)}`}
                {e.reminded_at && ` · rappel ${stamp(e.reminded_at)}`}
              </div>
            </div>
            <div className={e.kind === "credit" ? "font-bold text-destructive" : "font-bold text-success"}>
              {e.kind === "credit" ? "+" : "−"} {fcfa(e.amount)}
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
