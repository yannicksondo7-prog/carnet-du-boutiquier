import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Carnet" },
      { name: "description", content: "Connectez-vous à votre carnet du boutiquier." },
      { property: "og:title", content: "Connexion — Carnet" },
      { property: "og:description", content: "Connectez-vous à votre carnet du boutiquier." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/carnet" }); });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error("Email ou mot de passe incorrect"); return; }
      nav({ to: "/carnet" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/carnet` },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Vérifiez votre boîte mail pour confirmer votre compte.");
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error("Connexion Google impossible"); return; }
    if (r.redirected) return;
    nav({ to: "/carnet" });
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold text-primary">Carnet</h1>
        <p className="mt-1 text-muted-foreground">
          {mode === "in" ? "Bon retour dans votre boutique." : "14 jours gratuits, sans engagement."}
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={google}>
          Continuer avec Google
        </Button>
        <div className="my-4 text-center text-xs text-muted-foreground">ou</div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pw">Mot de passe</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy}>
            {mode === "in" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>
        <button className="mt-4 w-full text-sm text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Pas de compte ? Inscrivez-vous" : "Déjà inscrit ? Connectez-vous"}
        </button>
      </div>
    </main>
  );
}
