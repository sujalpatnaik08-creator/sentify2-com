import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Music2, Mail, Phone, ArrowLeft } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { cn } from "@/lib/utils";

// Only allow same-origin relative paths as the post-auth redirect target.
function safeNext(next: string | null): string {
  if (!next) return "/";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}


type Mode = "signin" | "signup" | "forgot";
type Method = "email" | "phone";

const Auth = () => {
  const { session, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#1DB954]" />
      </div>
    );
  }
  if (session) return <Navigate to={nextPath} replace />;


  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "forgot") {
      if (!email.trim()) return toast.error("Enter your email.");
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (error) toast.error(error.message);
      else { toast.success("Password reset link sent."); setMode("signin"); }
      return;
    }
    if (!email.trim() || password.length < 6) {
      return toast.error("Enter your email and a password (6+ characters).");
    }
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${nextPath}`,
          data: { username: email.split("@")[0] },
        },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Account created. Verify your email, then sign in.");
      setMode("signin");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back");
  };

  const sendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = phone.trim();
    if (!/^\+\d{6,15}$/.test(p)) {
      return toast.error("Enter your phone in E.164 format, e.g. +15558675309");
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: p });
    setBusy(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      const code = (error as { code?: string }).code?.toLowerCase() ?? "";
      const status = (error as { status?: number }).status ?? 0;

      // Precise detection: Supabase returns 422 + "provider is not enabled" / "sms_provider_disabled"
      // when no SMS provider is wired up in the project's auth config.
      const providerDisabled =
        code.includes("sms_provider_disabled") ||
        code.includes("provider_disabled") ||
        msg.includes("provider is not enabled") ||
        msg.includes("sms provider") ||
        msg.includes("phone provider") ||
        (status === 422 && msg.includes("provider"));

      if (providerDisabled) {
        toast.error(
          "Phone sign-in isn't enabled yet. Enable an SMS provider in Cloud → Users → Auth Settings → Phone, then try again.",
          { duration: 8000 },
        );
      } else if (code.includes("over_email_send_rate_limit") || code.includes("over_sms_send_rate_limit") || msg.includes("rate limit")) {
        toast.error("Too many code requests. Wait a minute before trying again.");
      } else if (msg.includes("invalid") && msg.includes("phone")) {
        toast.error("That phone number isn't valid. Use E.164 format, e.g. +15558675309.");
      } else {
        toast.error(error.message || "Couldn't send the code. Please try again.");
      }
      return;
    }
    setOtpSent(true);
    toast.success("OTP sent. Check your texts.");
  };

  const verifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 4) return toast.error("Enter the code we sent.");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: otp.trim(),
      type: "sms",
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Signed in");
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${nextPath}`,
    });
    if (result.error) toast.error(result.error.message);
  };


  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-black overflow-hidden">
      <Helmet>
        <title>{mode === "signup" ? "Sign Up" : "Log In"} — Sentify</title>
        <meta name="description" content="Log in or sign up to Sentify for ad-free music streaming, synced lyrics, and your personal library." />
        <link rel="canonical" href="/auth" />
        <meta property="og:title" content={`${mode === "signup" ? "Sign Up" : "Log In"} — Sentify`} />
        <meta property="og:description" content="Log in or sign up to Sentify for ad-free music streaming, synced lyrics, and your personal library." />
        <meta property="og:url" content="/auth" />
      </Helmet>

      {/* Spotify-flavored ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-[#1DB954]/15 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div
        className="relative w-full max-w-md rounded-2xl bg-neutral-950/90 backdrop-blur-2xl border border-white/5 p-8 md:p-10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] [perspective:1200px]"
      >
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8 [transform-style:preserve-3d]">
          <div className="w-14 h-14 rounded-full bg-[#1DB954] text-black flex items-center justify-center mb-5 shadow-[0_10px_40px_-5px_#1DB95466] [transform:translateZ(20px)]">
            <Music2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white text-center">
            {mode === "forgot"
              ? "Reset your password"
              : mode === "signup"
                ? "Sign up to start listening"
                : "Log in to Sentify"}
          </h1>
        </div>

        {/* OAuth */}
        {mode !== "forgot" && (
          <>
            <Button
              onClick={googleSignIn}
              variant="outline"
              type="button"
              className="w-full h-12 rounded-full font-semibold bg-transparent border-neutral-700 text-white hover:bg-neutral-900 hover:text-white hover:border-white transition-all"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-800" /></div>
              <div className="relative flex justify-center">
                <span className="bg-neutral-950 px-3 text-xs text-neutral-500 uppercase tracking-wider">or</span>
              </div>
            </div>

            {/* Method toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-full bg-neutral-900 border border-neutral-800">
              {(["email", "phone"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMethod(m); setOtpSent(false); }}
                  className={cn(
                    "h-9 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all",
                    method === m
                      ? "bg-[#1DB954] text-black shadow-md"
                      : "text-neutral-400 hover:text-white",
                  )}
                >
                  {m === "email" ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                  {m === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Sliding form container — sign in ↔ sign up */}
        <div className="relative overflow-hidden">
          <div
            className="flex w-[200%] transition-transform duration-500 ease-out"
            style={{ transform: mode === "signup" ? "translateX(-50%)" : "translateX(0%)" }}
          >
            {/* SIGN IN / FORGOT pane */}
            <div className="w-1/2 pr-3">
              {mode === "forgot" ? (
                <form onSubmit={submitEmail} className="space-y-3">
                  <label htmlFor="forgot-email" className="block text-xs font-bold text-white">Email</label>
                  <Input
                    id="forgot-email"
                    aria-label="Email"
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                  />
                  <Button type="submit" disabled={busy} className="w-full h-12 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
                  </Button>
                </form>
              ) : method === "email" ? (
                <form onSubmit={submitEmail} className="space-y-3">
                  <label htmlFor="signin-email" className="block text-xs font-bold text-white">Email</label>
                  <Input
                    id="signin-email"
                    aria-label="Email"
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                    autoComplete="email"
                  />
                  <label htmlFor="signin-password" className="block text-xs font-bold text-white pt-1">Password</label>
                  <Input
                    id="signin-password"
                    aria-label="Password"
                    type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                    autoComplete="current-password"
                  />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-neutral-400 hover:text-white underline underline-offset-2"
                    >
                      Forgot your password?
                    </button>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full h-12 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black transition-transform hover:scale-[1.02]">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log in"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={otpSent ? verifyPhoneOtp : sendPhoneOtp} className="space-y-3">
                  <label htmlFor="signin-phone" className="block text-xs font-bold text-white">Phone (E.164)</label>
                  <Input
                    id="signin-phone"
                    aria-label="Phone number"
                    type="tel" required value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={otpSent}
                    placeholder="+15558675309"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                  />
                  {otpSent && (
                    <>
                      <label htmlFor="signin-otp" className="block text-xs font-bold text-white pt-1">Verification code</label>
                      <Input
                    id="signin-otp"
                    aria-label="Verification code"
                        inputMode="numeric" required value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="6-digit code"
                        className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40 tracking-[0.5em] text-center"
                      />
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtp(""); }}
                        className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3 h-3" /> Use a different number
                      </button>
                    </>
                  )}
                  <Button type="submit" disabled={busy} className="w-full h-12 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black transition-transform hover:scale-[1.02]">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : otpSent ? "Verify & log in" : "Send code"}
                  </Button>
                </form>
              )}
            </div>

            {/* SIGN UP pane */}
            <div className="w-1/2 pl-3">
              {method === "email" ? (
                <form onSubmit={submitEmail} className="space-y-3">
                  <label htmlFor="signup-email" className="block text-xs font-bold text-white">Email</label>
                  <Input
                    id="signup-email"
                    aria-label="Email"
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                    autoComplete="email"
                  />
                  <label htmlFor="signup-password" className="block text-xs font-bold text-white pt-1">Password</label>
                  <Input
                    id="signup-password"
                    aria-label="Password"
                    type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password (6+ chars)"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                    autoComplete="new-password"
                  />
                  <Button type="submit" disabled={busy} className="w-full h-12 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black transition-transform hover:scale-[1.02]">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign up"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={otpSent ? verifyPhoneOtp : sendPhoneOtp} className="space-y-3">
                  <label htmlFor="signup-phone" className="block text-xs font-bold text-white">Phone (E.164)</label>
                  <Input
                    id="signup-phone"
                    aria-label="Phone number"
                    type="tel" required value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={otpSent}
                    placeholder="+15558675309"
                    className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40"
                  />
                  {otpSent && (
                    <Input
                      id="signup-otp"
                      aria-label="Verification code"
                      inputMode="numeric" required value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="6-digit code"
                      className="h-12 rounded-md bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:ring-[#1DB954]/40 tracking-[0.5em] text-center"
                    />
                  )}
                  <Button type="submit" disabled={busy} className="w-full h-12 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black transition-transform hover:scale-[1.02]">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : otpSent ? "Verify & sign up" : "Send code"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-neutral-400 mt-8 pt-6 border-t border-neutral-800">
          {mode === "forgot" ? (
            <button type="button" className="text-white font-semibold hover:underline" onClick={() => setMode("signin")}>
              Back to log in
            </button>
          ) : (
            <>
              {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="text-white font-semibold hover:underline"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setOtpSent(false); }}
              >
                {mode === "signin" ? "Sign up for Sentify" : "Log in"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
