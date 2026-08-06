import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase places the recovery session in the URL hash and signs the user in.
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === "PASSWORD_RECOVERY" || s) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be 6+ characters."); return; }
    if (password !== confirm) { toast.error("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated. You can now sign in.");
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-background overflow-hidden">
      <Helmet>
        <title>Reset Password — Sentify</title>
        <meta name="description" content="Reset your Sentify password securely. Enter your new password to regain access to your music library and account." />
        <link rel="canonical" href="/reset-password" />
        <meta property="og:title" content="Reset Password — Sentify" />
        <meta property="og:description" content="Securely reset your Sentify password and regain access to your account." />
        <meta property="og:url" content="/reset-password" />
        <meta property="og:type" content="website" />
      </Helmet>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-background/60 backdrop-blur-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground flex items-center justify-center mb-4 shadow-xl shadow-primary/40">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose something you'll remember.</p>
        </div>
        {!ready ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="new-password" className="block text-xs font-medium">New password</label>
            <Input id="new-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-11 rounded-xl" autoComplete="new-password" />
            <label htmlFor="confirm-password" className="block text-xs font-medium">Confirm new password</label>
            <Input id="confirm-password" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className="h-11 rounded-xl" autoComplete="new-password" />
            <Button type="submit" disabled={busy} className="w-full h-11 font-medium rounded-xl">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;