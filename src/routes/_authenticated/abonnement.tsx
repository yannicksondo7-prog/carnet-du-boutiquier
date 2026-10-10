import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fcfa, stamp } from "@/lib/carnet";

export const Route = createFileRoute("/_authenticated/abonnement")({
  head: () => ({ meta: [{ title: "Abonnement — Carnet" }, { name: "description", content: "Gérer votre abonnement." }] }),
  component: SubPage,
});

const labels = { orange: "Orange Money", moov: "Moov Money", card: "Carte bancaire" } as const;

function SubPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [method, setMethod] = useState<"orange" | "moov" | "card" | "">("");
  const [months, setMonths] = useState(1);
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [shop, setShop] = useState<string | null>(null);
  const [shopPhone, setShopPhone] = useState<string | null>(null);
  const { data: payments = [] } = useQuery({
    queryKey: ["my-payments"],
    queryFn: async () => (await supabase.from("payments").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  if (!me) return <AppShell><p>Chargement…</p></AppShell>;
  const s = me.settings;
  const methods = (["orange", "moov", "card"] as const).filter((m) => s[`${m}_enabled`]);
  const numberFor = (m: string) => (m === "orange" ? s.orange_number : m === "moov" ? s.moov_number : "");

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!method || !ref.trim()) { toast.error("Choisissez un moyen et saisissez la référence"); return; }
    const { error } = await supabase.from("payments").insert({
      user_id: me!.id, method, months, amount: s.monthly_price * months, reference: ref.trim(), payer_phone: phone.trim() || null,
    });
    if (error) { toast.error("Envoi impossible"); return; }
    toast.success("Paiement envoyé, validation sous peu.");
    setRef(""); setPhone("");
    qc.invalidateQueries({ queryKey: ["my-payments"] });
  }

  async function saveProfile() {
    await supabase.from("profiles").update({ shop_name: shop ?? me!.profile.shop_name, phone: shopPhone ?? me!.profile.phone }).eq("id", me!.id);
    toast.success("Boutique mise à jour");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold">Abonnement</h1>
      <p className="mt-1 text-muted-foreground">
        {me.active ? `Actif jusqu'au ${stamp(me.profile.subscription_until!)}` : "Expiré"} · {fcfa(s.monthly_price, s.currency)} / mois
      </p>

      <form onSubmit={pay} className="mt-5 space-y-4 rounded-2xl border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {methods.map((m) => (
            <Button key={m} type="button" variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>{labels[m]}</Button>
          ))}
        </div>
        {method && method !== "card" && (
          <p className="rounded-lg bg-secondary p-3 text-sm">
            Envoyez <b>{fcfa(s.monthly_price * months, s.currency)}</b> au <b>{numberFor(method) || "numéro communiqué par l'administrateur"}</b> via {labels[method]}, puis saisissez la référence de transaction reçue par SMS.
          </p>
        )}
        {method === "card" && (
          <p className="rounded-lg bg-secondary p-3 text-sm">Le paiement par carte en ligne arrive bientôt. En attendant, indiquez la référence de votre paiement.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Mois</Label>
            <Input type="number" min={1} max={12} value={months} onChange={(e) => setMonths(Math.min(12, Math.max(1, +e.target.value || 1)))} />
          </div>
          <div>
            <Label>Référence</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PP2410.1234.A5678" />
          </div>
          <div>
            <Label>Numéro payeur</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
        </div>
        <Button disabled={!method}>Envoyer le paiement</Button>
      </form>

      <h2 className="mt-8 text-xl font-bold">Mes paiements</h2>
      <ul className="mt-2 divide-y rounded-2xl border bg-card">
        {payments.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucun paiement.</li>}
        {payments.map((p) => (
          <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
            <span>{stamp(p.created_at)} · {labels[p.method as keyof typeof labels]} · {p.months} mois</span>
            <span className="font-bold">{{ pending: "En attente", approved: "Validé", rejected: "Refusé" }[p.status]}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-bold">Ma boutique</h2>
      <div className="mt-2 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><Label>Nom affiché aux clients</Label><Input defaultValue={me.profile.shop_name} onChange={(e) => setShop(e.target.value)} /></div>
        <div><Label>Téléphone</Label><Input defaultValue={me.profile.phone ?? ""} onChange={(e) => setShopPhone(e.target.value)} /></div>
        <Button type="button" variant="secondary" onClick={saveProfile}>Enregistrer</Button>
      </div>
    </AppShell>
  );
}
