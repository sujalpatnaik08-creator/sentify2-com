// Translate lyrics via Lovable AI Gateway.
// Public function (no JWT) so it works for guest playback too.
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
    const { text, targetLanguage, romanize } = (await req.json()) as Body;

    if (!text || typeof text !== "string") {
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

    const sys =
      `You are a professional song-lyrics translator. Translate the user's lyrics into ${targetLanguage}.` +
      (romanize
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
