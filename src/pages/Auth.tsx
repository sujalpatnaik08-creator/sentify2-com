import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Mail, Music2 } from "lucide-react";
import { HeroOrb } from "@/components/HeroOrb";
import { lovable } from "@/integrations/lovable";

const Auth = () => {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Code sent! Check your email.");
      setStep("otp");
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome to Sentify!");
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(result.error.message);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" style={{ background: "var(--gradient-bright)" }}>
      <div className="absolute inset-0">
        <HeroOrb />
      </div>
      <div className="absolute top-10 -left-20 w-72 h-72 rounded-full bg-accent/40 blur-3xl animate-pulse" />
      <div className="absolute bottom-10 -right-20 w-80 h-80 rounded-full bg-primary/40 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-pink-400/30 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      <Card className="relative z-10 w-full max-w-md p-8 glass border-border/50 animate-scale-in">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Music2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Sentify</h1>
        </div>
        <p className="text-center text-muted-foreground mb-8">
          {step === "email" ? "Sign in to start listening" : "Enter the 6-digit code we sent"}
        </p>

        {step === "email" ? (
          <>
            <form onSubmit={sendOtp} className="space-y-3">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12"
                autoComplete="email"
              />
              <Button type="submit" disabled={busy} className="w-full h-12 font-semibold">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-2" />Send code</>}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button onClick={googleSignIn} variant="outline" className="w-full h-12">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
          </>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-3">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="h-14 text-center text-2xl tracking-[0.5em] font-bold"
              autoComplete="one-time-code"
              autoFocus
            />
            <Button type="submit" disabled={busy || otp.length !== 6} className="w-full h-12 font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & Sign in"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("email")} className="w-full">
              Use a different email
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Free. Ad-free. No charges. Ever.
        </p>
      </Card>
    </div>
  );
};

export default Auth;
