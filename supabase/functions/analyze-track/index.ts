// Sentify musicologist: extracts genre/mood/explicit/golden-minute + estimates
// BPM/key/instruments from title + artist (+ optional lyrics) using Lovable AI.
// Returns generic error messages; full detail stays in server logs.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  trackId?: string;
  title?: string;
  artist?: string;
  lyrics?: string;
  durationSec?: number;
}

const MOODS = ["happy", "chill", "focus", "workout", "sad", "party", "romance", "sleep"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // Auth — guards paid AI credits from anonymous abuse.
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

    const body = (await req.json()) as Body;
    const title = (body.title ?? "").toString().slice(0, 200).trim();
    const artist = (body.artist ?? "").toString().slice(0, 200).trim();
    const lyrics = (body.lyrics ?? "").toString().slice(0, 6000);
    const durationSec = Number.isFinite(body.durationSec)
      ? Math.max(0, Math.min(3600, Number(body.durationSec)))
      : 0;

    if (!title || !artist) {
      return new Response(
        JSON.stringify({ error: "Missing 'title' or 'artist'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI gateway not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sys = `You are an expert musicologist. Analyze the given song using its title, artist, and lyrics (if provided).
Return ONLY a strict JSON object with these exact fields and types — no markdown, no commentary:
{
  "genre": string,
  "subgenre": string,
  "mood": ${JSON.stringify([...MOODS])},
  "bpmEstimate": number,
  "keyEstimate": string,
  "instruments": string[],
  "explicit": boolean,
  "explicitReasons": string[],
  "goldenStartSec": number,
  "goldenEndSec": number,
  "confidence": number,
  "credits": [ { "role": string, "name": string } ],   // main artist, composer, lyricist, producer, featured — infer from title/artist string when possible
  "canvasPrompt": string                                // 1 sentence describing a looping visual backdrop that matches the song's mood (e.g. "slow orange sunset waves rippling behind neon calligraphy")
}
The golden section should be 20-45 seconds long and fit within the duration ${durationSec || "unknown"}.
If duration is unknown, use 45-90 for goldenStartSec and 75-130 for goldenEndSec.`;

    const userMsg = `Title: ${title}
Artist: ${artist}
Duration (sec): ${durationSec || "unknown"}
${lyrics ? `Lyrics:\n${lyrics}` : "Lyrics: (not available)"}`;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userMsg },
          ],
        }),
      },
    );

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Try again shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (resp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("analyze-track gateway error", resp.status, errText);
      return new Response(JSON.stringify({ error: "Analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // strip code fences and retry
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
    }

    // Coerce / sanitize fields
    const mood = MOODS.includes(parsed.mood as typeof MOODS[number])
      ? (parsed.mood as typeof MOODS[number])
      : undefined;
    const bpm = Math.max(40, Math.min(220, Math.round(Number(parsed.bpmEstimate) || 0))) || undefined;
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const goldStart = Math.max(0, Math.round(Number(parsed.goldenStartSec) || 0));
    const goldEnd = Math.max(goldStart + 10, Math.round(Number(parsed.goldenEndSec) || goldStart + 30));

    const result = {
      genre: typeof parsed.genre === "string" ? parsed.genre.slice(0, 60) : undefined,
      subgenre: typeof parsed.subgenre === "string" ? parsed.subgenre.slice(0, 80) : undefined,
      mood,
      moodLabel: !mood && typeof parsed.mood === "string" ? parsed.mood.slice(0, 30) : undefined,
      bpm,
      key: typeof parsed.keyEstimate === "string" ? parsed.keyEstimate.slice(0, 20) : undefined,
      instruments: Array.isArray(parsed.instruments)
        ? (parsed.instruments as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 40)).slice(0, 8)
        : [],
      explicit: !!parsed.explicit,
      explicitReasons: Array.isArray(parsed.explicitReasons)
        ? (parsed.explicitReasons as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 80)).slice(0, 6)
        : [],
      goldenStartSec: goldStart,
      goldenEndSec: goldEnd,
      confidence: conf,
      credits: Array.isArray(parsed.credits)
        ? (parsed.credits as unknown[])
            .filter((c): c is { role: unknown; name: unknown } => !!c && typeof c === "object")
            .map((c) => ({
              role: typeof c.role === "string" ? c.role.slice(0, 40) : "",
              name: typeof c.name === "string" ? c.name.slice(0, 80) : "",
            }))
            .filter((c) => c.role && c.name)
            .slice(0, 10)
        : [],
      canvasPrompt: typeof parsed.canvasPrompt === "string" ? parsed.canvasPrompt.slice(0, 240) : undefined,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-track error", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
