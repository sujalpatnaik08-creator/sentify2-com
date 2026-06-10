// Translate lyrics via Lovable AI Gateway.
// Requires an authenticated Sentify user (verify_jwt = true + getUser check)
// so paid AI credits can't be drained by anonymous callers.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  text?: string;
  targetLanguage?: string;
  romanize?: boolean;
}

const MAX_CHARS = 8000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // Require an authenticated user — guards the paid Lovable AI Gateway
    // credits from anonymous abuse.
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

    const { text, targetLanguage, romanize } = (await req.json()) as Body;

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'text'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
      return new Response(JSON.stringify({ error: "Missing 'text'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'targetLanguage'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const trimmed = text.slice(0, MAX_CHARS);

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

    const isHinglish = /^hinglish$/i.test(targetLanguage);
    const langInstruction = isHinglish
      ? "Translate the user's lyrics into Hinglish — that is, Hindi written in the Latin/Roman alphabet (NOT Devanagari). Use natural, conversational spelling that Hindi speakers commonly use online (e.g. 'tum mere paas ho')."
      : `Translate the user's lyrics into ${targetLanguage}.`;
    const sys =
      `You are a professional song-lyrics translator. ${langInstruction}` +
      (romanize && !isHinglish
        ? " Also include a romanized (latin script) transliteration on the line below each translated line, prefixed with '~ '."
        : "") +
      " Preserve line breaks. Do NOT add explanations, intros, notes, asterisks, or markdown. Output ONLY the translated lyrics line-by-line.";

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
          messages: [
            { role: "system", content: sys },
            { role: "user", content: trimmed },
          ],
        }),
      },
    );

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Try again shortly." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (resp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted." }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error", resp.status, errText);
      return new Response(JSON.stringify({ error: "Translation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const translated: string =
      data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-lyrics error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
