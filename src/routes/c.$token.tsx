import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fcfa, stamp } from "@/lib/carnet";

type Ledger = {
  customer: { name: string };
  shop: { name: string; phone: string | null };
  entries: { kind: "credit" | "payment"; amount: number; products: string | null; created_at: string }[];
};

const getLedger = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: res } = await sb.rpc("client_ledger", { _token: data.token });
    return (res as Ledger | null) ?? null;
  });

export const Route = createFileRoute("/c/$token")({
  loader: async ({ params }) => {
    const l = await getLedger({ data: { token: params.token } });
    if (!l) throw notFound();
    return l;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Mon carnet chez ${loaderData?.shop.name ?? "la boutique"}` },
      { name: "description", content: "Historique horodaté de vos crédits et paiements." },
      { property: "og:title", content: `Mon carnet chez ${loaderData?.shop.name ?? "la boutique"}` },
      { property: "og:description", content: "Historique horodaté de vos crédits et paiements." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientLedger,
});

function ClientLedger() {
  const l = Route.useLoaderData();
  const balance = l.entries.reduce((s, e) => s + (e.kind === "credit" ? e.amount : -e.amount), 0);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-sm text-muted-foreground">Carnet de {l.customer.name}</p>
      <h1 className="text-3xl font-extrabold">{l.shop.name}</h1>
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Solde à régler</div>
        <div className={`text-4xl font-extrabold ${balance > 0 ? "text-destructive" : "text-success"}`}>{fcfa(balance)}</div>
      </div>
      <ul className="mt-5 divide-y rounded-2xl border bg-card">
        {l.entries.map((e, i) => (
          <li key={i} className="flex justify-between px-4 py-3">
            <div>
              <div className="font-medium">{e.kind === "credit" ? e.products || "Crédit" : "Paiement"}</div>
              <div className="text-xs text-muted-foreground">{stamp(e.created_at)}</div>
            </div>
            <div className={e.kind === "credit" ? "font-bold text-destructive" : "font-bold text-success"}>
              {e.kind === "credit" ? "+" : "−"} {fcfa(e.amount)}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-xs text-muted-foreground">Chaque ligne est horodatée et ne peut pas être modifiée.</p>
    </main>
  );
}
