// Audio fingerprint recognition (Shazam-style) + hum-to-search.
// Uses AudD when AUDD_API_TOKEN is configured. The client sends a short
// recorded audio sample (base64) and we forward it to AudD which returns
// the matched song. If the secret is missing we return a friendly error
// so the UI can prompt the user.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RecognizeBody {
  audioBase64: string;     // raw base64, no data: prefix
  mimeType?: string;       // e.g. audio/webm
  mode?: "recognize" | "hum"; // hum = melody match
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Require an authenticated Sentify user so anonymous callers can't drain
    // the paid AudD API credits.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const { createClient } = await import(
        "https://esm.sh/@supabase/supabase-js@2.45.0"
      );
      const supa = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: `Bearer ${jwt}` } } },
      );
      const { data: { user }, error: authErr } = await supa.auth.getUser(jwt);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RecognizeBody;
    if (!body?.audioBase64 || typeof body.audioBase64 !== "string") {
      return new Response(JSON.stringify({ error: "Missing audioBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.audioBase64.length > 8_000_000) {
      return new Response(JSON.stringify({ error: "Audio sample too large (max ~6MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("AUDD_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          error:
            "Song recognition isn't configured yet. Add an AUDD_API_TOKEN secret to enable Shazam-style identification.",
          configured: false,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Decode base64 → Uint8Array → Blob for multipart upload
    const binary = Uint8Array.from(atob(body.audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: body.mimeType || "audio/webm" });

    const form = new FormData();
    form.append("api_token", token);
    form.append("file", blob, "sample.webm");
    form.append("return", "spotify,apple_music,deezer");

    // AudD endpoint: /  for recognition,  /findHummed for humming
    const endpoint = body.mode === "hum"
      ? "https://api.audd.io/findHummed/"
      : "https://api.audd.io/";

    const resp = await fetch(endpoint, { method: "POST", body: form });
    const data = await resp.json();

    if (data?.status !== "success") {
      return new Response(
        JSON.stringify({ error: data?.error?.error_message || "Recognition failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const r = data.result;
    if (!r) {
      return new Response(JSON.stringify({ match: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        match: {
          title: r.title,
          artist: r.artist,
          album: r.album,
          releaseDate: r.release_date,
          spotify: r.spotify?.external_urls?.spotify || null,
          searchQuery: `${r.artist || ""} ${r.title || ""}`.trim(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
