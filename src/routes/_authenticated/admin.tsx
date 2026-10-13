import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fcfa, stamp } from "@/lib/carnet";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administration — Carnet" }, { name: "description", content: "Tableau de bord administrateur." }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (me?.settings && !form) setForm(me.settings); }, [me, form]);
  const { data } = useQuery({
    queryKey: ["admin"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [{ data: payments }, { data: profiles }, { data: resets }, { data: earnings }] = await Promise.all([
        supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("password_resets").select("id, email, user_id, status, created_at, used_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("referral_earnings").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      return { payments: payments ?? [], profiles: profiles ?? [], resets: resets ?? [], earnings: earnings ?? [] };
    },
  });

  if (me && !me.isAdmin) return <AppShell><p>Accès réservé à l'administrateur.</p></AppShell>;
  if (!form || !data) return <AppShell><p>Chargement…</p></AppShell>;
  const shopName = (id: string) => data.profiles.find((p) => p.id === id)?.shop_name ?? "—";
  const activeCount = data.profiles.filter((p) => p.subscription_until && new Date(p.subscription_until) > new Date()).length;
  const approved = data.payments.filter((p) => p.status === "approved");
  const paidMonths = (id: string) => approved.filter((p) => p.user_id === id).reduce((s, p) => s + p.months, 0);
  const totalSubscribers = new Set(approved.map((p) => p.user_id)).size;
  const monthsSince = (d: string) => {
    const a = new Date(d), b = new Date();
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() >= a.getDate() ? 1 : 0));
  };

  async function saveSettings() {
    const { error } = await supabase.from("app_settings").update({
      monthly_price: +form.monthly_price, referral_percent: Math.min(100, Math.max(0, +form.referral_percent || 0)), currency: form.currency, reminder_days: +form.reminder_days,
      orange_enabled: form.orange_enabled, orange_number: form.orange_number,
      moov_enabled: form.moov_enabled, moov_number: form.moov_number, card_enabled: form.card_enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) { toast.error("Échec"); return; }
    toast.success("Réglages enregistrés");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc("review_payment", { _id: id, _approve: approve });
    if (error) { toast.error("Échec"); return; }
    toast.success(approve ? "Abonnement prolongé" : "Paiement refusé");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }

  async function reviewReset(id: string, approve: boolean) {
    const { error } = await supabase.from("password_resets").update({ status: approve ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Échec"); return; }
    toast.success(approve ? "Demande approuvée" : "Demande refusée");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }

  async function markPaid(referrer: string) {
    const { error } = await supabase.from("referral_earnings").update({ paid_at: new Date().toISOString() }).eq("referrer_id", referrer).is("paid_at", null);
    if (error) { toast.error("Échec"); return; }
    toast.success("Commission marquée comme versée");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  const dueByReferrer = Object.entries(
    data.earnings.filter((e) => !e.paid_at).reduce<Record<string, number>>((m, e) => ({ ...m, [e.referrer_id]: (m[e.referrer_id] ?? 0) + e.amount }), {}),
  );

  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold">Administration</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Boutiques", data.profiles.length], ["Abonnés au total", totalSubscribers], ["Abonnés actifs", activeCount], ["En attente", data.payments.filter((p) => p.status === "pending").length]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-4"><div className="text-2xl font-extrabold">{v}</div><div className="text-sm text-muted-foreground">{l}</div></div>
        ))}
      </div>

      <section className="mt-6 space-y-4 rounded-2xl border bg-card p-4">
        <h2 className="text-xl font-bold">Abonnement et paiements</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Prix mensuel</Label><Input type="number" value={form.monthly_price} onChange={(e) => set("monthly_price", e.target.value)} /></div>
          <div><Label>Devise</Label><Input value={form.currency} onChange={(e) => set("currency", e.target.value)} /></div>
          <div><Label>Rappel doux après (jours)</Label><Input type="number" value={form.reminder_days} onChange={(e) => set("reminder_days", e.target.value)} /></div>
          <div><Label>Commission parrainage (%)</Label><Input type="number" min={0} max={100} value={form.referral_percent} onChange={(e) => set("referral_percent", e.target.value)} /></div>
        </div>
        {[["orange", "Orange Money"], ["moov", "Moov Money"]].map(([k, l]) => (
          <div key={k} className="flex items-center gap-3">
            <Switch checked={form[`${k}_enabled`]} onCheckedChange={(v) => set(`${k}_enabled`, v)} />
            <span className="w-32 font-medium">{l}</span>
            <Input placeholder="Numéro de réception" value={form[`${k}_number`] ?? ""} onChange={(e) => set(`${k}_number`, e.target.value)} />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Switch checked={form.card_enabled} onCheckedChange={(v) => set("card_enabled", v)} />
          <span className="font-medium">Carte bancaire</span>
        </div>
        <Button onClick={saveSettings}>Enregistrer les réglages</Button>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold">Paiements reçus</h2>
        <ul className="mt-2 divide-y rounded-2xl border bg-card">
          {data.payments.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucun paiement.</li>}
          {data.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{shopName(p.user_id)} · {fcfa(p.amount)} · {p.months} mois</div>
                <div className="text-xs text-muted-foreground">{stamp(p.created_at)} · {p.method} · réf {p.reference}{p.payer_phone && ` · ${p.payer_phone}`}</div>
              </div>
              {p.status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => review(p.id, true)}>Valider</Button>
                  <Button size="sm" variant="outline" onClick={() => review(p.id, false)}>Refuser</Button>
                </div>
              ) : (
                <span className="font-bold">{p.status === "approved" ? "Validé" : "Refusé"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold">Commissions de parrainage à verser</h2>
        <ul className="mt-2 divide-y rounded-2xl border bg-card">
          {dueByReferrer.length === 0 && <li className="p-4 text-sm text-muted-foreground">Rien à verser.</li>}
          {dueByReferrer.map(([id, amt]) => {
            const pr = data.profiles.find((p) => p.id === id);
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{shopName(id)} · {fcfa(amt, form.currency)}</div>
                  <div className="text-xs text-muted-foreground">{pr?.phone || "pas de téléphone"} · {data.profiles.filter((p) => p.referred_by === id).length} filleul(s)</div>
                </div>
                <Button size="sm" onClick={() => markPaid(id)}>Marquer versé</Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold">Mots de passe oubliés</h2>
        <ul className="mt-2 divide-y rounded-2xl border bg-card">
          {data.resets.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucune demande.</li>}
          {data.resets.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{r.email}{r.user_id ? ` · ${shopName(r.user_id)}` : " · compte inconnu"}</div>
                <div className="text-xs text-muted-foreground">{stamp(r.created_at)}</div>
              </div>
              {r.status === "pending" && r.user_id ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => reviewReset(r.id, true)}>Approuver</Button>
                  <Button size="sm" variant="outline" onClick={() => reviewReset(r.id, false)}>Refuser</Button>
                </div>
              ) : (
                <span className="font-bold">{r.used_at ? "Mot de passe changé" : r.status === "approved" ? "Approuvée" : r.status === "rejected" ? "Refusée" : "—"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold">Boutiques</h2>
        <ul className="mt-2 divide-y rounded-2xl border bg-card">
          {data.profiles.map((p) => {
            const used = monthsSince(p.created_at);
            const paid = paidMonths(p.id);
            return (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{p.shop_name}{p.owner_name && ` · ${p.owner_name}`}</div>
                  <div className="text-xs text-muted-foreground">
                    Utilise l'application depuis {used} mois · {paid} mois payés
                  </div>
                </div>
                <span className="text-muted-foreground">{p.subscription_until ? `jusqu'au ${stamp(p.subscription_until)}` : "—"}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
