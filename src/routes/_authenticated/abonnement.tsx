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
  const { data: refData } = useQuery({
    queryKey: ["my-referrals", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const [{ count }, { data: earnings }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", me!.id),
        supabase.from("referral_earnings").select("amount, paid_at").eq("referrer_id", me!.id),
      ]);
      return { count: count ?? 0, earnings: earnings ?? [] };
    },
  });
  if (!me) return <AppShell><p>Chargement…</p></AppShell>;
  const s = me.settings;
  const methods = (["orange", "moov", "card"] as const).filter((m) => s[`${m}_enabled`]);
  const numberFor = (m: string) => (m === "orange" ? s.orange_number : m === "moov" ? s.moov_number : "");
  const refLink = `${typeof window !== "undefined" ? window.location.origin : ""}/auth?ref=${me.profile.referral_code}`;
  const earnedTotal = (refData?.earnings ?? []).reduce((t, e) => t + e.amount, 0);
  const earnedDue = (refData?.earnings ?? []).filter((e) => !e.paid_at).reduce((t, e) => t + e.amount, 0);

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

      <h2 className="mt-8 text-xl font-bold">Parrainage</h2>
      <div className="mt-2 space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <p>Gagnez <b>{s.referral_percent} %</b> de chaque abonnement payé par les boutiquiers qui s'inscrivent avec votre lien.</p>
        <div className="flex gap-2">
          <Input readOnly value={refLink} />
          <Button type="button" variant="secondary" onClick={() => { navigator.clipboard.writeText(refLink); toast.success("Lien copié"); }}>Copier</Button>
        </div>
        <Button type="button" variant="outline" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(`J'utilise Carnet pour noter les crédits de ma boutique. Essaie 14 jours gratuits : ${refLink}`)}`} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
        </Button>
        <div className="grid grid-cols-3 gap-2 pt-2 text-center">
          <div><div className="text-xl font-extrabold">{refData?.count ?? 0}</div><div className="text-muted-foreground">Filleuls</div></div>
          <div><div className="text-xl font-extrabold">{fcfa(earnedTotal, s.currency)}</div><div className="text-muted-foreground">Gagné</div></div>
          <div><div className="text-xl font-extrabold">{fcfa(earnedDue, s.currency)}</div><div className="text-muted-foreground">À recevoir</div></div>
        </div>
      </div>

      <h2 className="mt-8 text-xl font-bold">Ma boutique</h2>
      <div className="mt-2 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><Label>Nom affiché aux clients</Label><Input defaultValue={me.profile.shop_name} onChange={(e) => setShop(e.target.value)} /></div>
        <div><Label>Téléphone</Label><Input defaultValue={me.profile.phone ?? ""} onChange={(e) => setShopPhone(e.target.value)} /></div>
        <Button type="button" variant="secondary" onClick={saveProfile}>Enregistrer</Button>
      </div>
    </AppShell>
  );
}
