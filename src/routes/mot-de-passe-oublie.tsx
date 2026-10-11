import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestReset, checkReset, completeReset } from "@/lib/reset.functions";

export const Route = createFileRoute("/mot-de-passe-oublie")({
  head: () => ({
    meta: [
      { title: "Mot de passe oublié — Carnet" },
      { name: "description", content: "Demandez un nouveau mot de passe, validé par l'administrateur." },
      { property: "og:title", content: "Mot de passe oublié — Carnet" },
      { property: "og:description", content: "Demandez un nouveau mot de passe pour votre carnet." },
    ],
  }),
  component: ResetPage,
});

const KEY = "carnet-reset";

function ResetPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [req, setReq] = useState<{ email: string; token: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem(KEY);
    if (s) setReq(JSON.parse(s));
  }, []);

  async function refresh(r = req) {
    if (!r) return;
    const res = await checkReset({ data: r });
    setStatus(res.status);
  }
  useEffect(() => { refresh(); }, [req]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await requestReset({ data: { email } });
      const r = { email: email.trim().toLowerCase(), token };
      localStorage.setItem(KEY, JSON.stringify(r));
      setReq(r);
      toast.success("Demande envoyée à l'administrateur");
    } catch { toast.error("Demande impossible"); }
    setBusy(false);
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!req) return;
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/.test(pw)) {
      toast.error("Lettres et chiffres uniquement, au moins un de chaque (6 caractères minimum).");
      return;
    }
    setBusy(true);
    try {
      await completeReset({ data: { ...req, password: pw } });
      localStorage.removeItem(KEY);
      toast.success("Nouveau mot de passe enregistré. Connectez-vous.");
      nav({ to: "/auth" });
    } catch { toast.error("Échec"); }
    setBusy(false);
  }

  function restart() { localStorage.removeItem(KEY); setReq(null); setStatus(null); }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-primary">Mot de passe oublié</h1>
        {!req ? (
          <form onSubmit={ask} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Indiquez votre email. L'administrateur doit approuver votre demande avant que vous puissiez choisir un nouveau mot de passe.</p>
            <div><Label htmlFor="em">Email</Label><Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Button className="w-full" disabled={busy}>Envoyer la demande</Button>
          </form>
        ) : status === "approved" ? (
          <form onSubmit={finish} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Demande approuvée pour {req.email}. Choisissez votre nouveau mot de passe.</p>
            <div>
              <Label htmlFor="np">Nouveau mot de passe</Label>
              <Input id="np" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Lettres et chiffres uniquement (ex : boutik26).</p>
            </div>
            <Button className="w-full" disabled={busy}>Enregistrer</Button>
          </form>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <p>Demande pour <b>{req.email}</b> :{" "}
              <b>{status === "pending" ? "en attente de l'administrateur" : status === "rejected" ? "refusée" : status === "used" ? "déjà utilisée" : status ? "introuvable" : "…"}</b>
            </p>
            <p className="text-muted-foreground">Revenez sur cette page depuis le même téléphone une fois la demande approuvée.</p>
            <Button className="w-full" variant="outline" onClick={() => refresh()}>Actualiser</Button>
            <button className="w-full text-primary underline" onClick={restart}>Faire une nouvelle demande</button>
          </div>
        )}
        <Link to="/auth" className="mt-4 block text-center text-sm text-primary underline">Retour à la connexion</Link>
      </div>
    </main>
  );
}
