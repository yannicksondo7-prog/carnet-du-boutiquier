import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entryMessage, fcfa, reminderMessage, stamp, waLink } from "@/lib/carnet";

export const Route = createFileRoute("/_authenticated/carnet")({
  head: () => ({ meta: [{ title: "Mes clients — Carnet" }, { name: "description", content: "Vos crédits clients." }] }),
  component: CarnetPage,
});

type Row = { id: string; name: string; phone: string; share_token: string; balance: number; last: string | null; lastReminder: string | null };

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: cs }, { data: es }] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("entries").select("customer_id,kind,amount,created_at,reminded_at"),
      ]);
      return (cs ?? []).map((c) => {
        const mine = (es ?? []).filter((e) => e.customer_id === c.id);
        const balance = mine.reduce((s, e) => s + (e.kind === "credit" ? e.amount : -e.amount), 0);
        const last = mine.map((e) => e.created_at).sort().at(-1) ?? null;
        const lastReminder = mine.map((e) => e.reminded_at).filter(Boolean).sort().at(-1) ?? null;
        return { ...c, balance, last, lastReminder };
      });
    },
  });
}

function CarnetPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: customers = [] } = useCustomers();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [kind, setKind] = useState<"credit" | "payment">("credit");
  const [amount, setAmount] = useState("");
  const [products, setProducts] = useState("");
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)),
    [customers, search],
  );
  const total = customers.reduce((s, c) => s + Math.max(c.balance, 0), 0);
  const reminderDays = me?.settings.reminder_days ?? 7;
  const due = customers.filter((c) => {
    if (c.balance <= 0 || !c.last) return false;
    const ref = c.lastReminder && c.lastReminder > c.last ? c.lastReminder : c.last;
    return Date.now() - new Date(ref).getTime() > reminderDays * 86400000;
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    const value = parseInt(amount.replace(/\D/g, ""), 10);
    if (!value) return toast.error("Montant manquant");
    setBusy(true);
    let cust = customers.find((c) => c.id === customerId);
    if (customerId === "new") {
      if (!newName.trim() || newPhone.replace(/\D/g, "").length < 8) {
        setBusy(false);
        return toast.error("Nom et numéro WhatsApp du client requis");
      }
      const { data, error } = await supabase
        .from("customers")
        .insert({ shop_id: me.id, name: newName.trim(), phone: newPhone.trim() })
        .select()
        .single();
      if (error || !data) { setBusy(false); return toast.error("Client non créé"); }
      cust = { ...data, balance: 0, last: null, lastReminder: null };
    }
    if (!cust) { setBusy(false); return toast.error("Choisissez un client"); }
    const { data: entry, error } = await supabase
      .from("entries")
      .insert({ shop_id: me.id, customer_id: cust.id, kind, amount: value, products: products.trim() || null })
      .select()
      .single();
    setBusy(false);
    if (error || !entry) return toast.error(me.active ? "Enregistrement impossible" : "Abonnement expiré");
    const balance = cust.balance + (kind === "credit" ? value : -value);
    const msg = entryMessage({ shop: me.profile.shop_name, name: cust.name, kind, amount: value, products: entry.products, at: entry.created_at, balance, token: cust.share_token });
    window.open(waLink(cust.phone, msg), "_blank");
    await supabase.from("entries").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
    toast.success(`Noté à ${stamp(entry.created_at)}`);
    setAmount(""); setProducts(""); setNewName(""); setNewPhone(""); setCustomerId(cust.id);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function remind(c: Row) {
    if (!me) return;
    window.open(waLink(c.phone, reminderMessage({ shop: me.profile.shop_name, name: c.name, balance: c.balance, token: c.share_token })), "_blank");
    const { data: last } = await supabase.from("entries").select("id").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(1).single();
    if (last) await supabase.from("entries").update({ reminded_at: new Date().toISOString() }).eq("id", last.id);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <AppShell>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{me?.profile.shop_name}</p>
          <h1 className="text-3xl font-extrabold">On vous doit {fcfa(total)}</h1>
        </div>
      </div>

      <form onSubmit={save} className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3">
          <select
            className="h-11 rounded-md border bg-background px-3 text-base"
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setTimeout(() => amountRef.current?.focus(), 0); }}
          >
            <option value="">— Choisir un client —</option>
            <option value="new">+ Nouveau client</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({fcfa(c.balance)})</option>)}
          </select>
          {customerId === "new" && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="WhatsApp (70 00 00 00)" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={kind === "credit" ? "destructive" : "outline"} onClick={() => setKind("credit")}>Crédit</Button>
            <Button type="button" variant={kind === "payment" ? "default" : "outline"} onClick={() => setKind("payment")}>Paiement</Button>
          </div>
          <Input ref={amountRef} inputMode="numeric" placeholder="Montant (FCFA)" className="h-12 text-xl font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {kind === "credit" && <Input placeholder="Produits (riz 5 kg, huile…)" value={products} onChange={(e) => setProducts(e.target.value)} />}
          <Button size="lg" disabled={busy || !me?.active}>Enregistrer et prévenir sur WhatsApp</Button>
        </div>
      </form>

      {due.length > 0 && (
        <section className="mt-6 rounded-2xl border border-accent bg-accent/20 p-4">
          <h2 className="text-lg font-bold">Rappels doux à envoyer ({due.length})</h2>
          <p className="text-sm text-muted-foreground">Aucun mouvement depuis plus de {reminderDays} jours.</p>
          <div className="mt-3 space-y-2">
            {due.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
                <span>{c.name} · <b>{fcfa(c.balance)}</b></span>
                <Button size="sm" variant="secondary" onClick={() => remind(c)}>Envoyer le rappel</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <Label htmlFor="q" className="sr-only">Rechercher</Label>
        <Input id="q" placeholder="Rechercher un client" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ul className="mt-3 divide-y rounded-2xl border bg-card">
          {filtered.length === 0 && <li className="p-6 text-center text-muted-foreground">Aucun client pour l'instant.</li>}
          {filtered.map((c) => (
            <li key={c.id}>
              <Link to="/client/$id" params={{ id: c.id }} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.last ? `Dernier mouvement ${stamp(c.last)}` : c.phone}</div>
                </div>
                <div className={c.balance > 0 ? "font-bold text-destructive" : "font-bold text-success"}>{fcfa(c.balance)}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
