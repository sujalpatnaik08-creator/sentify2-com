import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Music2, ShieldCheck } from "lucide-react";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace so we can
// call the three methods without grepping SDK internals.
type OAuthResult = {
  data?: {
    client?: { name?: string; client_id?: string; redirect_uris?: string[] };
    scope?: string;
    redirect_url?: string;
    redirect_to?: string;
  } | null;
  error?: { message: string } | null;
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

function getOAuthApi(): OAuthApi | null {
  const api = (supabase.auth as unknown as { oauth?: OAuthApi }).oauth;
  return api ?? null;
}

function isSameOriginPath(next: string | null): string | null {
  if (!next) return null;
  try {
    if (next.startsWith("/") && !next.startsWith("//")) return next;
  } catch { /* ignore */ }
  return null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthResult["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in URL.");
        setChecking(false);
        return;
      }
      const oauth = getOAuthApi();
      if (!oauth) {
        setError("This app's auth SDK is missing OAuth support. Please try again later.");
        setChecking(false);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: err } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) {
        setError(err.message);
        setChecking(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data ?? null);
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuthApi();
    if (!oauth) return;
    setBusy(true);
    setError(null);
    const res = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (res.error) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    const target = res.data?.redirect_url ?? res.data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const scopeString = details?.scope ?? "openid email profile";
  const scopes = scopeString.split(/\s+/).filter(Boolean);
  const redirectUri = details?.client?.redirect_uris?.[0];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="w-full max-w-md rounded-2xl bg-neutral-950/90 border border-white/5 p-8 shadow-2xl text-white">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center">
            <Music2 className="w-5 h-5" />
          </div>
          <div className="text-lg font-bold">Sentify</div>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading authorization request…
          </div>
        ) : error ? (
          <>
            <h1 className="text-xl font-bold mb-2">Could not load this authorization</h1>
            <p className="text-sm text-neutral-400 mb-4">{error}</p>
            <Button variant="secondary" onClick={() => window.location.assign("/")}>Back to Sentify</Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">
              Connect {clientName} to your Sentify account
            </h1>
            <p className="text-sm text-neutral-400 mb-6">
              This lets {clientName} use Sentify as you. It can call this app's enabled tools
              (search music, read your account identity, list your devices) while you are signed in.
              This does not bypass Sentify's permissions or backend policies.
            </p>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4 mb-6 space-y-3">
              {redirectUri && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Redirect URI</div>
                  <div className="text-xs text-neutral-300 break-all">{redirectUri}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Requested access</div>
                <ul className="text-sm space-y-1">
                  {scopes.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#1DB954]" />
                      <span>
                        {s === "openid" || s === "profile"
                          ? "Share your basic profile"
                          : s === "email"
                            ? "Share your email address"
                            : `Additional permission: ${s}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 h-11 rounded-full font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
              </Button>
              <Button
                onClick={() => decide(false)}
                disabled={busy}
                variant="outline"
                className="flex-1 h-11 rounded-full font-bold bg-transparent border-neutral-700 text-white hover:bg-neutral-900 hover:text-white"
              >
                Cancel connection
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { isSameOriginPath };
