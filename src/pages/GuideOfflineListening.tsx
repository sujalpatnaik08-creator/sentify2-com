import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Download, WifiOff, Music2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const GuideOfflineListening = () => {
  const canonical = "https://sentify2-com.lovable.app/guide/offline-listening";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Listen to Music Offline for Free on Sentify",
    description:
      "Step-by-step guide to downloading full-length songs on Sentify and playing them offline for free, ad-free, without using mobile data.",
    totalTime: "PT2M",
    step: [
      { "@type": "HowToStep", name: "Sign in to Sentify", text: "Create a free Sentify account or sign in — no credit card required." },
      { "@type": "HowToStep", name: "Find a song", text: "Search for any track, album, or artist you want to listen to offline." },
      { "@type": "HowToStep", name: "Tap the download button", text: "Press the download icon on the player bar or track card to save the full-length song to your device." },
      { "@type": "HowToStep", name: "Open the Downloads page", text: "All saved tracks live under Library → Downloads, ready to play without an internet connection." },
      { "@type": "HowToStep", name: "Enable airplane mode and play", text: "Turn off Wi-Fi or mobile data — your downloaded music keeps playing, ad-free." },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is offline listening on Sentify really free?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Sentify is free and ad-free. Downloading songs for offline playback does not require a subscription or a credit card." },
      },
      {
        "@type": "Question",
        name: "Are these full songs or 30-second previews?",
        acceptedAnswer: { "@type": "Answer", text: "Full-length tracks. Unlike apps that only serve 30-second previews on the free tier, Sentify plays and downloads complete songs." },
      },
      {
        "@type": "Question",
        name: "Does offline mode use my mobile data?",
        acceptedAnswer: { "@type": "Answer", text: "No. Once a track is downloaded, playback runs from local storage — perfect for flights, subways, road trips, or capped data plans." },
      },
      {
        "@type": "Question",
        name: "How many songs can I download?",
        acceptedAnswer: { "@type": "Answer", text: "There is no artificial limit imposed by Sentify — you are only bounded by the free space on your device." },
      },
    ],
  };
  return (
    <>
      <Helmet>
        <title>Listen to Music Offline for Free — Sentify Guide</title>
        <meta
          name="description"
          content="Learn how to listen to music offline for free on Sentify. Download full-length songs, ad-free, and play them without Wi-Fi or mobile data."
        />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="Listen to Music Offline for Free — Sentify Guide" />
        <meta
          property="og:description"
          content="Step-by-step guide to downloading full songs on Sentify and playing them offline for free."
        />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
      </Helmet>

      <article className="px-6 md:px-10 py-10 max-w-3xl mx-auto">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Guide</span>
          <span className="mx-2">/</span>
          <span className="text-foreground">Offline Listening</span>
        </nav>

        <header className="mb-10">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">Sentify Guide</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight mb-4">
            How to Listen to Music Offline for Free on Sentify
          </h1>
          <p className="text-lg text-muted-foreground">
            No subscription, no ads, no 30-second previews. Download full-length songs on Sentify and play
            them anywhere — even with Wi-Fi off and mobile data disabled.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/downloads"><Download className="w-4 h-4 mr-2" />Open Downloads</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full">
              <Link to="/search">Find a song to save</Link>
            </Button>
          </div>
        </header>

        <section className="grid sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Music2, title: "Full-length tracks", body: "Complete songs, not 30-second previews." },
            { icon: ShieldCheck, title: "100% ad-free", body: "No audio ads, no banners — ever." },
            { icon: WifiOff, title: "Works offline", body: "Play saved music without an internet connection." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border p-5 bg-card">
              <f.icon className="w-6 h-6 text-primary mb-3" />
              <h2 className="font-bold mb-1">{f.title}</h2>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <h2 className="text-2xl md:text-3xl font-black mb-6">Why download music for offline listening?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Streaming eats data, drains battery, and stutters the moment your signal dips. Downloading songs
            for offline playback fixes all three: you save your mobile data plan, extend battery life on long
            trips, and get gapless playback in tunnels, on planes, and in basements. Most "free" music apps
            either lock offline mode behind a paid tier, cap you to 30-second previews, or interrupt every
            few tracks with ads. Sentify does none of that.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If you want to <strong>listen to music offline for free</strong> without those trade-offs, the
            steps below take about a minute.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl md:text-3xl font-black mb-6">Step-by-step: download songs on Sentify</h2>
          <ol className="space-y-6">
            {[
              { t: "Sign in to your free Sentify account", d: "Head to the sign-in page. No credit card, no trial timer — offline downloads are part of the free tier." },
              { t: "Search for a song, album, or artist", d: "Use the search bar at the top. Sentify indexes full catalogues, so anything you'd find on a major streaming app is here." },
              { t: "Tap the download icon", d: "On the player bar (bottom of the screen) or on any track card, tap the download button. The full-length song is saved to your device." },
              { t: "Open the Downloads page", d: "Every saved track lives under Library → Downloads. You can play, reorder, or remove them from there." },
              { t: "Switch off Wi-Fi and hit play", d: "Enable airplane mode as a proof: your music keeps playing, ad-free, straight from local storage." },
            ].map((step, i) => (
              <li key={step.t} className="flex gap-4">
                <div className="shrink-0 w-9 h-9 rounded-full bg-primary/15 text-primary font-black flex items-center justify-center">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-bold mb-1">{step.t}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl md:text-3xl font-black mb-6">Sentify vs other "free" music apps</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left">
                  <th className="p-3 font-semibold">Feature</th>
                  <th className="p-3 font-semibold">Sentify (free)</th>
                  <th className="p-3 font-semibold">Typical free apps</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:p-3 [&>tr]:border-t [&>tr]:border-border">
                <tr><td>Full-length songs</td><td className="text-primary font-semibold">Yes</td><td>30-second previews</td></tr>
                <tr><td>Offline downloads</td><td className="text-primary font-semibold">Free</td><td>Paid tier only</td></tr>
                <tr><td>Audio ads</td><td className="text-primary font-semibold">None</td><td>Every 2–3 tracks</td></tr>
                <tr><td>Account required</td><td>Free, no card</td><td>Free, no card</td></tr>
                <tr><td>Skips per hour</td><td className="text-primary font-semibold">Unlimited</td><td>~6</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl md:text-3xl font-black mb-6">Frequently asked questions</h2>
          <dl className="space-y-5">
            {faqLd.mainEntity.map((q: any) => (
              <div key={q.name} className="rounded-xl border border-border p-5 bg-card">
                <dt className="font-bold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  {q.name}
                </dt>
                <dd className="text-sm text-muted-foreground leading-relaxed">{q.acceptedAnswer.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 p-8 text-center">
          <h2 className="text-2xl font-black mb-2">Ready to build your offline library?</h2>
          <p className="text-muted-foreground mb-5">
            Start saving full-length songs for free — play them anywhere, anytime, with no ads.
          </p>
          <Button asChild size="lg" className="rounded-full">
            <Link to="/search"><Download className="w-4 h-4 mr-2" />Find your first download</Link>
          </Button>
        </aside>
      </article>
    </>
  );
};

export default GuideOfflineListening;
