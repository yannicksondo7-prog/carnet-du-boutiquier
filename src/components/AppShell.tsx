import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const [{ data: profile }, { data: roles }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).single(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("app_settings").select("*").single(),
      ]);
      const active = !!profile?.subscription_until && new Date(profile.subscription_until) > new Date();
      return { id, email: u.user!.email, profile: profile!, settings: settings!, active, isAdmin: !!roles?.some((r) => r.role === "admin") };
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const nav = useNavigate();
  const link = "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary [&.active]:bg-secondary [&.active]:text-foreground";
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/carnet" className="mr-2 font-display text-xl font-extrabold text-primary">Carnet</Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            <Link to="/carnet" className={link}>Clients</Link>
            <Link to="/abonnement" className={link}>Abonnement</Link>
            {me?.isAdmin && <Link to="/admin" className={link}>Admin</Link>}
          </nav>
          <Button size="sm" variant="ghost" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}>
            Sortir
          </Button>
        </div>
      </header>
      {me && !me.active && (
        <div className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
          Votre abonnement a expiré. <Link to="/abonnement" className="underline font-bold">Renouveler</Link> pour continuer à noter.
        </div>
      )}
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
