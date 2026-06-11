import { useState, useEffect, useRef } from "react";
import { getSaesonKontekst } from "./utils/saeson";
import { normaliserSmsKampagner, normaliserLeveringKampagner } from "./utils/normalize";
import { formatApiError, parseApiResponse } from "./utils/errors";
import { saveDraft, loadDraft, clearDraft, formatDraftTime, restoreKampagneIdCounter } from "./utils/persistence";

const MAX_KAMPAGNER = 4;
const MIN_KAMPAGNER = 1;

// ── Allio Brand Colors ─────────────────────────────────
const C = {
  bg:          "#F0F1F5",
  surface:     "#FFFFFF",
  surfaceAlt:  "#F4F5FA",
  border:      "#E2E4EE",
  borderLight: "#ECEEF6",
  navy:        "#0F172A",
  navyMid:     "#1E2A45",
  blue:        "#4F6EF7",
  blueDim:     "#EEF2FF",
  blueLight:   "#E8ECFC",
  indigo:      "#6366F1",
  text:        "#0F172A",
  textMid:     "#374151",
  textMuted:   "#6B7280",
  textLight:   "#9CA3AF",
  success:     "#22C55E",
  successBg:   "#F0FDF4",
  error:       "#EF4444",
  errorBg:     "#FEF2F2",
  white:       "#FFFFFF",
};

let kampagneId = 0;
function setKampagneIdCounter(n) { kampagneId = n; }
function nyKampagne() {
  return { id: `k${++kampagneId}`, ydelse: "", antal: "", normalpris: "", tilbudspris: "", noter: "" };
}

// ── System Prompts ─────────────────────────────────────
const KAMPAGNE_FLOW_REGLER = `KAMPAGNE-FLOW (GÆLDER ALTID):
- Hver kampagne består af præcis 2 SMS'er: SMS #1 (genaktivering) og SMS #2 (booster)
- SMS #2 (booster) sendes ALTID præcis 48 timer efter SMS #1 — aldrig samme dag, aldrig anden timing
- Booster er en venlig PÅMINDELSE på den første besked — ikke en ny kampagne med nyt tilbud
- Booster refererer til SMS #1 (fx "jeg skrev til dig for et par dage siden...") og gentager ikke hele salgspitchen
- Booster er helst kortere og mere direkte end SMS #1, men ingen fast tegngrænse
- Undgå tidsreferencer i booster der ikke passer til 48 timer efter (fx "i går" eller "i morges")`;

const SEGMENT_REGLER = `SEGMENT (GÆLDER ALTID):
- Modtagerne er tidligere kunder der allerede har købt denne ydelse — ikke nye leads
- De har ikke booket eller behandlet sig i 90+ dage (sovende kunder)
- De kender ydelsen og klinikken — skriv som en genaktivering, ikke en introduktion
- Brug managerens noter til vinkel og tone
- Beskriv segmentet som "tidligere kunder der kender ydelsen"`;

const VINKEL_REGLER = `VINKEL (vælg ÉN ud fra noter og kontekst — bland aldrig flere):
- Sæson/tid på året (fx sommer, vinterpause, ferie)
- Opfølgning/fornyelse (behandlingen trænger til sin tur igen)
- Personlig genaktivering (varm tjek-in, "tænkte på dig")
- Særlig anledning fra noter (event, ny behandling, klinik-jubilæum)
- Eller en helt anden vinkel der passer bedre ud fra noterne
Tilpas SMS #1 til valgt vinkel. Hvis noter er tomme: personlig genaktivering + kampagnepris.`;

const BOOKING_CTA_REGLER = `BOOKING-CTA:
- INGEN "Svar JA", INGEN telefon-opfordring, INGEN STOP-linje eller frameldelsestekst
- CTA skal naturligt henvise til booking via link — linket er den primære handling
- Brug placeholder [Bookinglink] hvor kunden skal booke
- Eksempler: "Book din tid her: [Bookinglink]" / "Du kan booke direkte her: [Bookinglink]"
- Én tydelig booking-handling per SMS`;

const SMS_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

${KAMPAGNE_FLOW_REGLER}

${SEGMENT_REGLER}

${VINKEL_REGLER}

${BOOKING_CTA_REGLER}

REGLER FOR SMS-BESKEDER:
- INGEN emojis
- INGEN specialtegn
- Brug altid korrekte danske bogstaver: æ ø å
- Tone: som om klinikejer skriver personligt til en gammel kunde de kender — varm, direkte og menneskelig
- Beskeden skal føles 100% skrædersyet til modtageren — ALDRIG som en masse-SMS
- Brug altid klinikejerens fornavn og klinikkens navn naturligt i beskeden
- Brug [Fornavn] som placeholder for kundens navn
- Konkret kampagnepris skal med — gør besparelsen synlig og håndgribelig
- Skab naturlig urgency via sæson, anledning eller personlig opfølgning — ikke via ledige tider eller telefonopfølgning
- Aldrig medicinske løfter, sundhedspåstande eller diagnose-referencer
- Aldrig aggressiv eller pushy salgstone

PERSONLIGHED:
- Start altid med "Hej [Fornavn],"
- Klinikkejeren skal lyde som om hun selv skriver — ikke som et system
- Gerne en lille menneskelig observation fx "jeg kiggede lige listen igennem og tænkte på dig"
- Slut med klinikkejers fornavn alene (uden kh, dbh eller lignende)

FORMAT: Returner KUN valid JSON uden markdown, kode-blokke eller forklaringer.
Antallet af objekter i "kampagner" skal matche antallet af kampagner i konteksten — én entry per kampagne, i samme rækkefølge.

{
  "kampagner": [
    { "sms1": "fuld SMS-tekst — genaktivering", "sms2": "fuld booster SMS-tekst — sendes 48 timer efter sms1, kortere og mere direkte" }
  ]
}`;

const REFINED_SMS_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

Du får et redigeret SMS-udkast og skal generere en skarpere, mere poleret version der bevarer den personlige tone og alle rettelser manageren har lavet.

${KAMPAGNE_FLOW_REGLER}

${SEGMENT_REGLER}

${VINKEL_REGLER}

${BOOKING_CTA_REGLER}

REGLER:
- Bevar alle rettelser manageren har lavet — de er intentionelle
- Gør sproget endnu mere naturligt og personligt
- Bevar [Bookinglink] og [Fornavn] placeholders
- INGEN emojis, INGEN specialtegn
- Brug korrekte danske bogstaver: æ ø å
- Start med "Hej [Fornavn],"
- Slut med klinikkejers fornavn alene

FORMAT: Returner KUN valid JSON uden markdown eller forklaringer.
Antallet af objekter i "kampagner" skal matche input — én entry per kampagne, i samme rækkefølge.

{
  "kampagner": [
    { "sms1": "poleret genaktiverings-SMS", "sms2": "poleret booster SMS — sendes 48 timer efter sms1" }
  ]
}`;

const LEVERING_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

Du genererer en komplet kampagneanalyse baseret på godkendte SMS-udkast.

${KAMPAGNE_FLOW_REGLER}

FORMAT: Returner KUN valid JSON uden markdown eller forklaringer.
Antallet af objekter i "kampagner" skal matche antallet af kampagner i konteksten — én entry per kampagne, i samme rækkefølge.

{
  "status_analyse": "2-3 sætninger om klinikkens situation og potentiale",
  "kampagner": [
    {
      "navn": "kampagnenavn",
      "antal": antal som tal,
      "beskrivelse": "1 sætning om hvem disse kunder er",
      "pris_udsendelse": "BEREGNES",
      "forventet_bookinger": "BEREGNES"
    }
  ],
  "samlet_pris": "BEREGNES",
  "samlet_bookinger": "BEREGNES",
  "naeste_skridt": ["punkt 1", "punkt 2", "punkt 3"]
}

BOOKINGFORVENTNING: Skriv forventet_bookinger som BEREGNES — tallet beregnes automatisk af systemet. Inkluder IKKE omsætning eller indtjening.

VIGTIGT OM TAL:
- Brug PRÆCIS de kundetal fra konteksten i "antal" — opfind ALDRIG egne tal
- Nævn ALDRIG samlede kundetal i status_analyse — kun kvalitativ vurdering

SEGMENT-BESKRIVELSE: Beskriv hvem disse kunder er som tidligere købere af ydelsen der ikke er kommet igen.

NÆSTE SKRIDT — KUN kundevendte leveringstrin:
- Godkend SMS-tekster
- Planlæg eller igangsæt udsendelse (SMS #1, derefter booster 48 timer efter)
- Opfølg på kampagneresultater efter udsendelse
Inkluder ALDRIG interne driftstrin: log svar, ring til kunder, foreslå tider, STOP-håndtering eller teknisk opsætning i SMS-platformen.`;

// ── Prisberegning ──────────────────────────────────────
function beregnSmsSegmenter(tekst) {
  if (!tekst) return 0;
  return Math.ceil(tekst.length / 160);
}

function beregnKampagnePris(sms1, sms2, antal) {
  const n = parseInt(antal) || 0;
  const seg1 = beregnSmsSegmenter(sms1);
  const seg2 = beregnSmsSegmenter(sms2);
  const totalSeg = (n * seg1) + (n * seg2);
  const pris = Math.ceil(totalSeg * 0.40);
  return { seg1, seg2, totalSeg, pris };
}

function beregnBookinger(antal) {
  const n = parseInt(antal, 10) || 0;
  const lav = Math.round(n * 0.035);
  const hoj = Math.round(n * 0.055);
  return {
    bookinger: `${lav}-${hoj} bookinger`,
    lav, hoj,
  };
}

function kampagneAntal(k) {
  return parseInt(k?.antal, 10) || 0;
}

function byggLeveringTal(kampagner, smsListe, levMeta = {}) {
  const beregninger = kampagner.map((k, i) => {
    const sms = smsListe[i] || { sms1: "", sms2: "" };
    const pris = beregnKampagnePris(sms.sms1, sms.sms2, k.antal);
    const book = beregnBookinger(k.antal);
    return { pris, book };
  });

  const kampagnerLev = kampagner.map((k, i) => {
    const lev = levMeta.kampagner?.[i] || {};
    const { pris, book } = beregninger[i];
    return {
      navn: lev.navn || k.ydelse,
      antal: kampagneAntal(k),
      beskrivelse: lev.beskrivelse || "",
      pris_udsendelse: `${pris.pris} kr.`,
      forventet_bookinger: book.bookinger,
    };
  });

  const samletPris = beregninger.reduce((s, b) => s + b.pris.pris, 0);
  const samletBookLav = beregninger.reduce((s, b) => s + b.book.lav, 0);
  const samletBookHoj = beregninger.reduce((s, b) => s + b.book.hoj, 0);
  const samletKunder = kampagner.reduce((s, k) => s + kampagneAntal(k), 0);

  return {
    status_analyse: levMeta.status_analyse || "",
    kampagner: kampagnerLev,
    samlet_pris: `${samletPris} kr.`,
    samlet_bookinger: `${samletBookLav}-${samletBookHoj} bookinger`,
    samlet_kunder: samletKunder,
    naeste_skridt: levMeta.naeste_skridt || [],
  };
}

// ── Shared style helpers ───────────────────────────────
const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 24,
  marginBottom: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

const inp = {
  background: C.surfaceAlt,
  border: `1.5px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 14px",
  color: C.text,
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
  textAlign: "left",
};

const lbl = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: C.textMuted,
  marginBottom: 6,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const secLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: C.blue,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 16,
  paddingBottom: 10,
  borderBottom: `1.5px solid ${C.blueLight}`,
};

const btnPrimary = {
  background: C.navy,
  color: C.white,
  border: "none",
  borderRadius: 8,
  padding: "11px 24px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.01em",
  transition: "opacity 0.15s",
};

const btnSecondary = {
  background: C.white,
  color: C.textMid,
  border: `1.5px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const btnDanger = {
  background: C.white,
  color: C.error,
  border: `1.5px solid #FECACA`,
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const pill = (color, bg) => ({
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  color,
  background: bg,
  borderRadius: 20,
  padding: "3px 10px",
  letterSpacing: "0.04em",
});

const Spinner = () => (
  <span style={{ width: 16, height: 16, border: `2px solid ${C.white}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
);

function defaultForm() {
  return { kundenavn: "", kliknavn: "", dato: new Date().toLocaleDateString("da-DK"), ekstra_info: "" };
}

let cachedInitialState;
function getInitialState() {
  if (cachedInitialState) return cachedInitialState;
  const draft = loadDraft();
  if (!draft) {
    cachedInitialState = {
      form: defaultForm(),
      kampagner: [nyKampagne(), nyKampagne()],
      step: 1,
      smsRedigeret: null,
      result: null,
      savedAt: null,
    };
    return cachedInitialState;
  }
  setKampagneIdCounter(restoreKampagneIdCounter(draft.kampagner || []));
  cachedInitialState = {
    form: draft.form || defaultForm(),
    kampagner: draft.kampagner?.length ? draft.kampagner : [nyKampagne(), nyKampagne()],
    step: draft.step || 1,
    smsRedigeret: draft.smsRedigeret || null,
    result: draft.result || null,
    savedAt: draft.savedAt || null,
  };
  return cachedInitialState;
}

// ── Component ──────────────────────────────────────────
export default function AllioKampagneGenerator() {
  const [step, setStep] = useState(() => getInitialState().step);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(() => getInitialState().result);
  const [smsRedigeret, setSmsRedigeret] = useState(() => getInitialState().smsRedigeret);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [draftInfo, setDraftInfo] = useState(() => getInitialState().savedAt);
  const skipFirstSave = useRef(true);
  const generationRef = useRef(0);

  const [form, setForm] = useState(() => getInitialState().form);
  const [kampagner, setKampagner] = useState(() => getInitialState().kampagner);

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveDraft({ step, form, kampagner, smsRedigeret, result });
    }, 500);
    return () => clearTimeout(timer);
  }, [step, form, kampagner, smsRedigeret, result]);

  function startForfra() {
    clearDraft();
    cachedInitialState = undefined;
    setKampagneIdCounter(0);
    setForm(defaultForm());
    setKampagner([nyKampagne(), nyKampagne()]);
    setStep(1);
    setResult(null);
    setSmsRedigeret(null);
    setError(null);
    setDraftInfo(null);
  }

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateKampagne = (id, field, value) => {
    if (["antal", "normalpris", "tilbudspris", "ydelse"].includes(field)) {
      setResult(null);
    }
    setKampagner(ks => ks.map(k => k.id === id ? { ...k, [field]: value } : k));
  };

  const tilfoejKampagne = () => {
    if (kampagner.length >= MAX_KAMPAGNER) return;
    setKampagner(ks => [...ks, nyKampagne()]);
  };

  const fjernKampagne = (id) => {
    if (kampagner.length <= MIN_KAMPAGNER) return;
    setKampagner(ks => ks.filter(k => k.id !== id));
  };

  const isValid = form.kundenavn && form.kliknavn &&
    kampagner.every(k => k.ydelse && k.antal && k.normalpris && k.tilbudspris);

  function buildContext() {
    const kampagneTekst = kampagner.map((k, i) => `KAMPAGNE ${i + 1}:
- Ydelse: ${k.ydelse}
- Segment: Tidligere kunder der har købt ${k.ydelse} men ikke er kommet igen i 90+ dage
- Antal sovende kunder (90+ dage): ${k.antal}
- Normalpris: ${k.normalpris} kr.
- Kampagnepris: ${k.tilbudspris} kr.
- Noter til vinkel og tone: ${k.noter || "Ingen — brug personlig genaktivering"}`).join("\n\n");

    return `KLIENT: ${form.kundenavn}
KLINIK: ${form.kliknavn}
DATO: ${form.dato}
ANTAL KAMPAGNER: ${kampagner.length}

${kampagneTekst}

SMS-FLOW: SMS #1 (genaktivering) sendes først. SMS #2 (booster/påmindelse) sendes ALTID præcis 48 timer efter SMS #1.
BOOKING: Alle SMS'er skal henvise til booking via [Bookinglink] — link indsættes automatisk i SMS-systemet.

GENERELLE NOTER: ${form.ekstra_info || "Ingen"}
${getSaesonKontekst()}`;
  }

  async function callAPI(sys, usr, maxTokens = 2500) {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    return parseApiResponse(r);
  }

  async function genererSmsUdkast() {
    const genId = ++generationRef.current;
    setLoading(true); setError(null); setResult(null);
    try {
      const p = await callAPI(
        SMS_SYSTEM_PROMPT,
        `Generer SMS-udkast for ${kampagner.length} kampagne(r):\n\n${buildContext()}`,
        500 + kampagner.length * 400,
      );
      if (genId !== generationRef.current) return;
      setSmsRedigeret(normaliserSmsKampagner(p, kampagner.length));
      setStep(2);
    } catch (e) { setError(formatApiError(e, "sms")); }
    setLoading(false);
  }

  async function raffinerOgGenerer() {
    const genId = ++generationRef.current;
    setLoading(true); setError(null);
    try {
      const smsPayload = { kampagner: smsRedigeret };
      const kontekst = buildContext();
      const [raffResult, levResult] = await Promise.allSettled([
        callAPI(
          REFINED_SMS_SYSTEM_PROMPT,
          `Poler disse SMS-udkast:\n${JSON.stringify(smsPayload)}\n\nKontekst:\n${kontekst}`,
          500 + kampagner.length * 400,
        ),
        callAPI(
          LEVERING_SYSTEM_PROMPT,
          `Kampagneanalyse baseret på:\n${JSON.stringify(smsPayload)}\n\nKontekst:\n${kontekst}`,
          800 + kampagner.length * 300,
        ),
      ]);
      if (genId !== generationRef.current) return;
      if (raffResult.status === "rejected") throw new Error(formatApiError(raffResult.reason, "polering"));
      if (levResult.status === "rejected") throw new Error(formatApiError(levResult.reason, "levering"));
      const raffineret = raffResult.value;
      const levData = levResult.value;

      const smsListe = normaliserSmsKampagner(raffineret, kampagner.length);
      const levNormaliseret = normaliserLeveringKampagner(levData, kampagner.length, kampagner);
      const levering = byggLeveringTal(kampagner, smsListe, {
        status_analyse: levData.status_analyse || "",
        kampagner: levNormaliseret,
        naeste_skridt: levData.naeste_skridt || [],
      });

      setResult({ sms: smsListe, levering });
      setStep(3);
    } catch (e) { setError(formatApiError(e, "levering")); }
    setLoading(false);
  }

  async function downloadDocx() {
    const levering = getAktuelLevering();
    if (!result || !levering) return;
    setDownloading(true);
    setError(null);
    try {
      const r = await fetch("/api/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, kampagner, result: { ...result, levering } }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Download fejlede");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = r.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] || `${form.kliknavn || "kampagne"}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(formatApiError(e, "docx"));
    }
    setDownloading(false);
  }

  function copyText(text, key) {
    const el = document.createElement("textarea");
    el.value = text; el.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(el); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  }

  function getAktuelLevering() {
    if (!result) return null;
    return byggLeveringTal(kampagner, result.sms, result.levering);
  }

  function copyAll() {
    if (!result) return;
    const { sms } = result;
    const levering = getAktuelLevering();

    const kampagneBlokke = kampagner.map((k, i) => {
      const lev = levering.kampagner[i];
      const smsData = sms[i] || {};
      return `${"─".repeat(52)}

KAMPAGNE ${i + 1}: ${(lev?.navn || k.ydelse).toUpperCase()}
${kampagneAntal(k)} sovende kunder — ${lev?.beskrivelse}

SMS #1 — Genaktivering:
${smsData.sms1}

SMS #2 — Booster (48 timer efter):
${smsData.sms2}

Prisoverslag: ${lev?.pris_udsendelse}
Forventede bookinger: ${lev?.forventet_bookinger}`;
    }).join("\n\n");

    const txt = `DATAANALYSE & KAMPAGNEANBEFALINGER
${form.kliknavn} — ${form.dato} — Udarbejdet af Allio
${"─".repeat(52)}

STATUS & POTENTIALE
${levering.status_analyse}

${kampagneBlokke}

${"─".repeat(52)}

SAMLET
Kampagnepris: ${levering.samlet_pris}
Forventede bookinger: ${levering.samlet_bookinger}

${"─".repeat(52)}

NÆSTE SKRIDT
${levering.naeste_skridt?.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    copyText(txt, "all");
  }

  const steps = ["Kundeinput", "SMS-udkast", "Levering"];

  const ydPlaceholders = ["fx Microneedling", "fx Helkropslaser", "fx Botox", "fx Voksbehandling"];
  const antalPlaceholders = ["fx 187", "fx 59", "fx 120", "fx 45"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: C.text, paddingBottom: 60 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px ${C.blueDim}; }
        button:hover { opacity: 0.88; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: C.navy, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>A</span>
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Allio</span>
            <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 8 }}>Kampagne Generator</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <div style={{ width: 28, height: 1, background: step > i ? C.blue : C.border }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: step === i + 1 ? C.blue : step > i + 1 ? C.blueDim : C.surfaceAlt,
                  border: `1.5px solid ${step === i + 1 ? C.blue : step > i + 1 ? C.blue : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: step === i + 1 ? C.white : step > i + 1 ? C.blue : C.textLight,
                }}>{step > i + 1 ? "✓" : i + 1}</div>
                <span style={{ fontSize: 12, fontWeight: step === i + 1 ? 600 : 400, color: step === i + 1 ? C.navy : C.textMuted }}>{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px" }}>

        {draftInfo && (
          <div style={{ background: C.blueDim, border: `1px solid ${C.blueLight}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: C.textMid }}>
            <span>Kladde gendannet fra {formatDraftTime(draftInfo)}</span>
            <button style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }} onClick={startForfra}>Start forfra</button>
          </div>
        )}

        {/* ── STEP 1: INPUT ── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: C.navy, margin: "0 0 6px" }}>Ny kampagnebrief</h1>
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>Udfyld felterne efter intro-mødet — genererer et komplet leveringsudkast på under ét minut.</p>
            </div>

            <div style={card}>
              <div style={secLabel}>Klientinformation</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={lbl}>Kundens navn</label><input style={inp} value={form.kundenavn} onChange={e => update("kundenavn", e.target.value)} placeholder="fx Nasrin" /></div>
                <div><label style={lbl}>Klinikknavn</label><input style={inp} value={form.kliknavn} onChange={e => update("kliknavn", e.target.value)} placeholder="fx Klinik Skøn" /></div>
              </div>
            </div>

            {kampagner.map((k, i) => (
              <div key={k.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottom: `1.5px solid ${C.blueLight}` }}>
                  <div style={{ ...secLabel, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
                    Kampagne {i + 1}
                  </div>
                  {kampagner.length > 1 && (
                    <button style={btnDanger} onClick={() => fjernKampagne(k.id)}>Fjern kampagne</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={lbl}>Ydelse</label>
                    <input style={inp} value={k.ydelse} onChange={e => updateKampagne(k.id, "ydelse", e.target.value)} placeholder={ydPlaceholders[i] || "fx Behandling"} />
                  </div>
                  <div>
                    <label style={lbl}>Sovende kunder (90+ dage)</label>
                    <input style={inp} type="number" value={k.antal} onChange={e => updateKampagne(k.id, "antal", e.target.value)} placeholder={antalPlaceholders[i] || "fx 100"} />
                  </div>
                  <div>
                    <label style={lbl}>Normalpris (kr.)</label>
                    <input style={inp} type="number" value={k.normalpris} onChange={e => updateKampagne(k.id, "normalpris", e.target.value)} placeholder="fx 1.300" />
                  </div>
                  <div>
                    <label style={lbl}>Kampagnepris (kr.)</label>
                    <input style={inp} type="number" value={k.tilbudspris} onChange={e => updateKampagne(k.id, "tilbudspris", e.target.value)} placeholder="fx 649" />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={lbl}>Noter om ydelsen</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={k.noter} onChange={e => updateKampagne(k.id, "noter", e.target.value)} placeholder="fx: Laserbehandling anbefales om vinteren da man ikke må have direkte sol på huden efterfølgende..." />
                  </div>
                </div>
              </div>
            ))}

            {kampagner.length < MAX_KAMPAGNER ? (
              <button
                style={{ ...btnSecondary, width: "100%", marginBottom: 16, padding: "12px 20px", color: C.blue, borderColor: C.blueLight, background: C.blueDim }}
                onClick={tilfoejKampagne}
              >
                + Tilføj kampagne
              </button>
            ) : (
              <p style={{ textAlign: "center", fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Maks. {MAX_KAMPAGNER} kampagner</p>
            )}

            <div style={card}>
              <div style={secLabel}>Generelle noter fra mødet</div>
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.ekstra_info} onChange={e => update("ekstra_info", e.target.value)} placeholder="fx: Klinikken er i Aarhus, klinikejer hedder Nika, ønsker en meget personlig tone..." />
            </div>

            {error && <div style={{ background: C.errorBg, border: `1px solid #FECACA`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.error, fontSize: 14 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...btnPrimary, opacity: isValid && !loading ? 1 : 0.4, minWidth: 190 }}
                disabled={!isValid || loading} onClick={genererSmsUdkast}>
                {loading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner />Genererer udkast...</span> : "Generer SMS-udkast →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: SMS-UDKAST ── */}
        {step === 2 && smsRedigeret && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: C.navy, margin: "0 0 6px" }}>Ret SMS-udkastene</h1>
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>Tilpas beskederne så de passer perfekt. Klik derefter videre for at generere den polerede version og den fulde levering.</p>
            </div>

            {kampagner.map((k, i) => (
              <div key={k.id} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={pill(C.blue, C.blueDim)}>Kampagne {i + 1}</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{k.ydelse}</span>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...lbl, color: C.blue }}>SMS #1 — Genaktivering</label>
                  <textarea style={{ ...inp, minHeight: 130, resize: "vertical", lineHeight: 1.7 }}
                    value={smsRedigeret[i]?.sms1 || ""}
                    onChange={e => setSmsRedigeret(r => r.map((s, j) => j === i ? { ...s, sms1: e.target.value } : s))} />
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>
                    {(smsRedigeret[i]?.sms1?.length || 0)} tegn · {beregnSmsSegmenter(smsRedigeret[i]?.sms1)} SMS-segment(er)
                  </div>
                </div>

                <div>
                  <label style={{ ...lbl, color: C.blue }}>SMS #2 — Booster (48 timer efter)</label>
                  <textarea style={{ ...inp, minHeight: 110, resize: "vertical", lineHeight: 1.7 }}
                    value={smsRedigeret[i]?.sms2 || ""}
                    onChange={e => setSmsRedigeret(r => r.map((s, j) => j === i ? { ...s, sms2: e.target.value } : s))} />
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>
                    {(smsRedigeret[i]?.sms2?.length || 0)} tegn · {beregnSmsSegmenter(smsRedigeret[i]?.sms2)} SMS-segment(er)
                  </div>
                </div>
              </div>
            ))}

            {error && <div style={{ background: C.errorBg, border: `1px solid #FECACA`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.error, fontSize: 14 }}>{error}</div>}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button style={{ ...btnSecondary, opacity: loading ? 0.4 : 1 }} disabled={loading} onClick={() => { generationRef.current++; setStep(1); }}>← Ret input</button>
              <button style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, minWidth: 210 }}
                disabled={loading} onClick={raffinerOgGenerer}>
                {loading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner />Genererer levering...</span> : "Poler & generer levering ✦"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: LEVERING ── */}
        {step === 3 && result && (() => {
          const levering = getAktuelLevering();
          if (!levering) return null;
          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, margin: "0 0 4px" }}>{form.kliknavn}</h1>
                <div style={{ fontSize: 13, color: C.textMuted }}>Dataanalyse & Kampagneanbefalinger · {form.dato} · Allio</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnSecondary} onClick={startForfra}>Ny kampagne</button>
                <button style={{ ...btnPrimary, minWidth: 120 }} onClick={copyAll}>{copied === "all" ? "Kopieret ✓" : "Kopiér alt"}</button>
                <button style={{ ...btnSecondary, opacity: downloading ? 0.6 : 1 }} disabled={downloading} onClick={downloadDocx}>
                  {downloading ? "Downloader..." : "Download Word"}
                </button>
              </div>
            </div>

            <div style={{ ...card, borderLeft: `3px solid ${C.blue}`, background: C.white }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Status & Potentiale</div>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7, color: C.textMid }}>{levering.status_analyse}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[["Kampagnepris", levering.samlet_pris], ["Forv. bookinger", levering.samlet_bookinger]].map(([k, v]) => (
                <div key={k} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.navy }}>{v}</div>
                </div>
              ))}
            </div>

            {kampagner.map((k, i) => {
              const lev = levering.kampagner[i];
              const sms = result.sms[i] || {};
              return (
                <div key={k.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={pill(C.blue, C.blueDim)}>Kampagne {i + 1}</span>
                      <span style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{lev?.navn || k.ydelse}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{kampagneAntal(k)}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>sovende kunder</div>
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>{lev?.beskrivelse}</p>

                  {[{ title: "SMS #1 — GENAKTIVERING", tekst: sms.sms1, key: `k${i}_sms1` }, { title: "SMS #2 — BOOSTER (48 TIMER EFTER)", tekst: sms.sms2, key: `k${i}_sms2` }].map(({ title, tekst, key }) => (
                    <div key={key} style={{ background: C.surfaceAlt, border: `1px solid ${C.borderLight}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.06em" }}>{title}</span>
                        <button onClick={() => copyText(tekst, key)} style={{ background: copied === key ? C.successBg : C.white, border: `1px solid ${copied === key ? C.success : C.border}`, borderRadius: 6, padding: "3px 12px", fontSize: 11, fontWeight: 600, color: copied === key ? C.success : C.textMuted, cursor: "pointer" }}>
                          {copied === key ? "Kopieret ✓" : "Kopiér"}
                        </button>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.8, color: C.textMid, whiteSpace: "pre-wrap", textAlign: "left" }}>{tekst}</div>
                      <div style={{ fontSize: 11, color: C.textLight, marginTop: 8, textAlign: "left" }}>{tekst?.length || 0} tegn · {beregnSmsSegmenter(tekst)} SMS-segment(er)</div>
                    </div>
                  ))}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                    {[["Udsendelse", lev?.pris_udsendelse], ["Forv. bookinger", lev?.forventet_bookinger]].map(([label, v]) => (
                      <div key={label} style={{ background: C.surfaceAlt, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 10, color: C.textLight, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div style={card}>
              <div style={secLabel}>Næste skridt</div>
              {levering.naeste_skridt?.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 14 }}>
                  <div style={{ minWidth: 24, height: 24, background: C.blueDim, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.blue, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ color: C.textMid, lineHeight: 1.6, paddingTop: 3 }}>{s}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button style={btnSecondary} onClick={copyAll}>{copied === "all" ? "✓ Kopieret til udklipsholder" : "Kopiér hele dokumentet som tekst"}</button>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
