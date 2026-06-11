import { useState } from "react";

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

// ── System Prompts ─────────────────────────────────────
const SMS_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

REGLER FOR SMS-BESKEDER:
- INGEN emojis
- INGEN specialtegn
- Brug altid korrekte danske bogstaver: æ ø å
- Tone: som om klinikejer skriver personligt til en gammel kunde de kender — varm, direkte og menneskelig
- Beskeden skal føles 100% skrædersyet til modtageren — ALDRIG som en masse-SMS
- Brug altid klinikejerens fornavn og klinikkens navn naturligt i beskeden
- Brug [Fornavn] som placeholder for kundens navn
- Konkret tilbudspris skal med — gør besparelsen synlig og håndgribelig
- Skab urgency via konkret dato eller "få ledige tider tilbage"
- Aldrig medicinske løfter, sundhedspåstande eller diagnose-referencer
- Aldrig aggressiv eller pushy salgstone
- SMS #2 (booster) skal være kortere og mere direkte end SMS #1

PERSONLIGHED:
- Start altid med "Hej [Fornavn],"
- Klinikkejeren skal lyde som om hun selv skriver — ikke som et system
- Gerne en lille menneskelig observation fx "jeg kiggede lige listen igennem og tænkte på dig"
- Slut med klinikkejers fornavn alene (uden kh, dbh eller lignende)

FORMAT: Returner KUN valid JSON uden markdown, kode-blokke eller forklaringer.

{
  "segment1_sms1": "fuld SMS-tekst",
  "segment1_sms2": "fuld booster SMS-tekst — kortere og mere direkte",
  "segment2_sms1": "fuld SMS-tekst (eller tom streng hvis intet segment 2)",
  "segment2_sms2": "fuld booster SMS-tekst (eller tom streng hvis intet segment 2)"
}`;

const REFINED_SMS_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

Du får et redigeret SMS-udkast og skal generere en skarpere, mere poleret version der bevarer den personlige tone og alle rettelser manageren har lavet.

REGLER:
- Bevar alle rettelser manageren har lavet — de er intentionelle
- Gør sproget endnu mere naturligt og personligt
- INGEN emojis, INGEN specialtegn
- Brug korrekte danske bogstaver: æ ø å
- Start med "Hej [Fornavn],"
- Slut med klinikkejers fornavn alene

FORMAT: Returner KUN valid JSON uden markdown eller forklaringer.

{
  "segment1_sms1": "poleret SMS-tekst",
  "segment1_sms2": "poleret booster SMS-tekst",
  "segment2_sms1": "poleret SMS-tekst (eller tom streng)",
  "segment2_sms2": "poleret booster SMS-tekst (eller tom streng)"
}`;

const LEVERING_SYSTEM_PROMPT = `Du er en ekspert i SMS-markedsføring for skønheds- og behandlingsklinikker i Danmark. Du skriver på dansk med korrekte danske tegn: æ, ø, å, Æ, Ø, Å.

Du genererer en komplet kampagneanalyse baseret på godkendte SMS-udkast.

FORMAT: Returner KUN valid JSON uden markdown eller forklaringer.

{
  "status_analyse": "2-3 sætninger om klinikkens situation og potentiale",
  "segment1": {
    "navn": "segmentnavn",
    "antal": antal som tal,
    "beskrivelse": "1 sætning om hvem disse kunder er",
    "pris_udsendelse": "BEREGNES",
    "forventet_bookinger": "X-Y bookinger",
    "forventet_omsaetning": "X.XXX-X.XXX kr."
  },
  "segment2": {
    "navn": "segmentnavn eller tom streng",
    "antal": antal som tal eller 0,
    "beskrivelse": "1 sætning eller tom streng",
    "pris_udsendelse": "BEREGNES",
    "forventet_bookinger": "X-Y bookinger",
    "forventet_omsaetning": "X.XXX-X.XXX kr."
  },
  "samlet_pris": "BEREGNES",
  "samlet_bookinger": "X-Y bookinger",
  "samlet_omsaetning": "X.XXX-X.XXX kr.",
  "naeste_skridt": ["punkt 1", "punkt 2", "punkt 3"]
}

BOOKINGFORVENTNING: Skriv forventet_bookinger og forventet_omsaetning som BEREGNES — tallene beregnes automatisk af systemet.`;

// ── Prisberegning ──────────────────────────────────────
function beregnSegmenter(tekst) {
  if (!tekst) return 0;
  return Math.ceil(tekst.length / 160);
}

function beregnKampagnePris(sms1, sms2, antal) {
  const n = parseInt(antal) || 0;
  const seg1 = beregnSegmenter(sms1);
  const seg2 = beregnSegmenter(sms2);
  const totalSeg = (n * seg1) + (n * seg2);
  const pris = Math.ceil(totalSeg * 0.40); // Rundes op til helt tal
  return { seg1, seg2, totalSeg, pris };
}

function rundOmsaetning(str) {
  // Runder tal i omsaetningsstreng op til naermeste 100
  // fx "12.134-16.728 kr." => "12.200-16.800 kr."
  return str.replace(/[\d.]+/g, m => {
    const num = parseFloat(m.replace(/\./g, "").replace(",", "."));
    if (isNaN(num) || num < 100) return m;
    const rounded = Math.ceil(num / 100) * 100;
    return rounded.toLocaleString("da-DK");
  });
}

function beregnBookinger(antal, tilbudspris) {
  const n = parseInt(antal) || 0;
  const pris = parseFloat(tilbudspris) || 0;
  // Konservativ rate: SMS1 giver 3%, booster giver yderligere 1.5%
  const lav = Math.round(n * 0.035);
  const hoj = Math.round(n * 0.055);
  const omsLav = Math.ceil((lav * pris) / 100) * 100;
  const omsHoj = Math.ceil((hoj * pris) / 100) * 100;
  return {
    bookinger: `${lav}-${hoj} bookinger`,
    omsaetning: `${omsLav.toLocaleString("da-DK")}-${omsHoj.toLocaleString("da-DK")} kr.`
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

// ── Component ──────────────────────────────────────────
export default function AllioKampagneGenerator() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [smsRedigeret, setSmsRedigeret] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const [form, setForm] = useState({
    kundenavn: "", kliknavn: "",
    dato: new Date().toLocaleDateString("da-DK"),
    segment1_ydelse: "", segment1_antal: "",
    segment1_normalpris: "", segment1_tilbudspris: "",
    segment1_noter: "",
    segment2_ydelse: "", segment2_antal: "",
    segment2_normalpris: "", segment2_tilbudspris: "",
    segment2_noter: "",
    ekstra_info: "",
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isValid = form.kundenavn && form.kliknavn && form.segment1_ydelse &&
    form.segment1_antal && form.segment1_normalpris && form.segment1_tilbudspris;

  function buildContext() {
    return `KLIENT: ${form.kundenavn}
KLINIK: ${form.kliknavn}
DATO: ${form.dato}

SEGMENT 1:
- Ydelse: ${form.segment1_ydelse}
- Antal sovende kunder (90+ dage): ${form.segment1_antal}
- Normalpris: ${form.segment1_normalpris} kr.
- Kampagnepris: ${form.segment1_tilbudspris} kr.
- Kontekst: ${form.segment1_noter || "Ingen noter"}

SEGMENT 2:
- Ydelse: ${form.segment2_ydelse || "Ikke angivet"}
- Antal: ${form.segment2_antal || "0"}
- Normalpris: ${form.segment2_normalpris || "0"} kr.
- Kampagnepris: ${form.segment2_tilbudspris || "0"} kr.
- Kontekst: ${form.segment2_noter || "Ingen noter"}

GENERELLE NOTER: ${form.ekstra_info || "Ingen"}
Det er juni 2026, sommersæson.
Segment 2 er ${form.segment2_ydelse ? "aktivt" : "ikke relevant — brug tomme strenge"}.`;
  }

  async function callAPI(sys, usr) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    const d = await r.json();
    const t = d.content?.map(b => b.text || "").join("") || "";
    return JSON.parse(t.replace(/```json|```/g, "").trim());
  }

  async function genererSmsUdkast() {
    setLoading(true); setError(null);
    try {
      const p = await callAPI(SMS_SYSTEM_PROMPT, `Generer SMS-udkast:\n\n${buildContext()}`);
      setSmsRedigeret({
        segment1_sms1: p.segment1_sms1 || "",
        segment1_sms2: p.segment1_sms2 || "",
        segment2_sms1: p.segment2_sms1 || "",
        segment2_sms2: p.segment2_sms2 || "",
      });
      setStep(2);
    } catch { setError("Noget gik galt. Prøv igen."); }
    setLoading(false);
  }

  async function raffinerOgGenerer() {
    setLoading(true); setError(null);
    try {
      const raffineret = await callAPI(REFINED_SMS_SYSTEM_PROMPT,
        `Poler disse SMS-udkast:\n${JSON.stringify(smsRedigeret)}\n\nKontekst:\n${buildContext()}`);
      const levData = await callAPI(LEVERING_SYSTEM_PROMPT,
        `Kampagneanalyse baseret på:\n${JSON.stringify(raffineret)}\n\nKontekst:\n${buildContext()}`);

      const p1 = beregnKampagnePris(raffineret.segment1_sms1, raffineret.segment1_sms2, form.segment1_antal);
      const p2 = form.segment2_ydelse ? beregnKampagnePris(raffineret.segment2_sms1, raffineret.segment2_sms2, form.segment2_antal) : null;
      const samletInt = Math.ceil(parseFloat(p1.pris) + (p2 ? parseFloat(p2.pris) : 0));
      const b1 = beregnBookinger(form.segment1_antal, form.segment1_tilbudspris);
      const b2 = form.segment2_ydelse ? beregnBookinger(form.segment2_antal, form.segment2_tilbudspris) : null;

      if (levData.segment1) {
        levData.segment1.antal = parseInt(form.segment1_antal) || 0; // Altid fra form
        levData.segment1.pris_udsendelse = `${p1.pris} kr.`;
        levData.segment1.forventet_bookinger = b1.bookinger;
        levData.segment1.forventet_omsaetning = b1.omsaetning;
      }
      if (p2 && levData.segment2) {
        levData.segment2.antal = parseInt(form.segment2_antal) || 0; // Altid fra form
        levData.segment2.pris_udsendelse = `${p2.pris} kr.`;
        levData.segment2.forventet_bookinger = b2.bookinger;
        levData.segment2.forventet_omsaetning = b2.omsaetning;
      }

      // Samlede tal
      const samletBookLav = (parseInt(b1.bookinger) || 0) + (b2 ? (parseInt(b2.bookinger) || 0) : 0);
      const samletBookHoj = (parseInt(b1.bookinger.split("-")[1]) || 0) + (b2 ? (parseInt(b2.bookinger.split("-")[1]) || 0) : 0);
      const samletOmsLav = (parseInt(b1.omsaetning.replace(/\./g, "").split("-")[0]) || 0) + (b2 ? (parseInt(b2.omsaetning.replace(/\./g, "").split("-")[0]) || 0) : 0);
      const samletOmsHoj = (parseInt(b1.omsaetning.replace(/\./g, "").split("-")[1]) || 0) + (b2 ? (parseInt(b2.omsaetning.replace(/\./g, "").split("-")[1]) || 0) : 0);

      levData.samlet_pris = `${samletInt} kr.`;
      levData.samlet_bookinger = `${samletBookLav}-${samletBookHoj} bookinger`;
      levData.samlet_omsaetning = `${samletOmsLav.toLocaleString("da-DK")}-${samletOmsHoj.toLocaleString("da-DK")} kr.`;

      setResult({ sms: raffineret, levering: levData });
      setStep(3);
    } catch { setError("Noget gik galt. Prøv igen."); }
    setLoading(false);
  }

  function copyText(text, key) {
    const el = document.createElement("textarea");
    el.value = text; el.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(el); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  }

  function copyAll() {
    if (!result) return;
    const { sms, levering } = result;
    const hasS2 = form.segment2_ydelse && levering.segment2?.navn;
    const txt = `DATAANALYSE & KAMPAGNEANBEFALINGER
${form.kliknavn} — ${form.dato} — Udarbejdet af Allio
${"─".repeat(52)}

STATUS & POTENTIALE
${levering.status_analyse}

${"─".repeat(52)}

SEGMENT 1: ${(levering.segment1?.navn || form.segment1_ydelse).toUpperCase()}
${levering.segment1?.antal} sovende kunder — ${levering.segment1?.beskrivelse}

SMS #1 — Genaktivering:
${sms.segment1_sms1}

SMS #2 — Booster (48 timer efter):
${sms.segment1_sms2}

Prisoverslag: ${levering.segment1?.pris_udsendelse}
Forventet: ${levering.segment1?.forventet_bookinger} — ${levering.segment1?.forventet_omsaetning}

${hasS2 ? `${"─".repeat(52)}

SEGMENT 2: ${(levering.segment2?.navn || form.segment2_ydelse).toUpperCase()}
${levering.segment2?.antal} sovende kunder — ${levering.segment2?.beskrivelse}

SMS #1 — Genaktivering:
${sms.segment2_sms1}

SMS #2 — Booster (48 timer efter):
${sms.segment2_sms2}

Prisoverslag: ${levering.segment2?.pris_udsendelse}
Forventet: ${levering.segment2?.forventet_bookinger} — ${levering.segment2?.forventet_omsaetning}

` : ""}${"─".repeat(52)}

SAMLET
Kampagnepris: ${levering.samlet_pris}
Forventede bookinger: ${levering.samlet_bookinger}
Forventet omsætning: ${levering.samlet_omsaetning}

${"─".repeat(52)}

NÆSTE SKRIDT
${levering.naeste_skridt?.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    copyText(txt, "all");
  }

  function downloadDocx() {
    alert('Download som Word er ikke tilgængeligt i dette miljø. Brug Kopier alt knappen i stedet.');
  }

  const Spinner = () => (
    <span style={{ width: 16, height: 16, border: `2px solid ${C.white}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
  );

  const steps = ["Kundeinput", "SMS-udkast", "Levering"];

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

        {/* Step bar */}
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

        {/* ── STEP 1: INPUT ── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: C.navy, margin: "0 0 6px" }}>Ny kampagnebrief</h1>
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>Udfyld felterne efter intro-mødet — genererer et komplet leveringsudkast på under ét minut.</p>
            </div>

            {/* Klientinfo */}
            <div style={card}>
              <div style={secLabel}>Klientinformation</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={lbl}>Kundens navn</label><input style={inp} value={form.kundenavn} onChange={e => update("kundenavn", e.target.value)} placeholder="fx Nasrin" /></div>
                <div><label style={lbl}>Klinikknavn</label><input style={inp} value={form.kliknavn} onChange={e => update("kliknavn", e.target.value)} placeholder="fx Klinik Skøn" /></div>
              </div>
            </div>

            {/* Segmenter */}
            {[
              { p: "segment1", label: "Segment 1 — Primær kampagne", req: true, ydPlaceholder: "fx Microneedling", antalPlaceholder: "fx 187" },
              { p: "segment2", label: "Segment 2 — Sekundær kampagne (valgfri)", req: false, ydPlaceholder: "fx Helkropslaser", antalPlaceholder: "fx 59" },
            ].map(({ p, label, req, ydPlaceholder, antalPlaceholder }) => (
              <div key={p} style={card}>
                <div style={secLabel}>{label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={lbl}>Ydelse</label>
                    <input style={inp} value={form[`${p}_ydelse`]} onChange={e => update(`${p}_ydelse`, e.target.value)} placeholder={ydPlaceholder} />
                  </div>
                  <div>
                    <label style={lbl}>Sovende kunder (90+ dage)</label>
                    <input style={inp} type="number" value={form[`${p}_antal`]} onChange={e => update(`${p}_antal`, e.target.value)} placeholder={antalPlaceholder} />
                  </div>
                  <div>
                    <label style={lbl}>Normalpris (kr.)</label>
                    <input style={inp} type="number" value={form[`${p}_normalpris`]} onChange={e => update(`${p}_normalpris`, e.target.value)} placeholder="fx 1.300" />
                  </div>
                  <div>
                    <label style={lbl}>Kampagnepris (kr.)</label>
                    <input style={inp} type="number" value={form[`${p}_tilbudspris`]} onChange={e => update(`${p}_tilbudspris`, e.target.value)} placeholder="fx 649" />
                  </div>
                  <div>
                    <label style={lbl}>Noter om ydelsen</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form[`${p}_noter`]} onChange={e => update(`${p}_noter`, e.target.value)} placeholder="fx: Laserbehandling anbefales om vinteren da man ikke må have direkte sol på huden efterfølgende. Perfekt timing nu da sommerpausen nærmer sig..." />
                  </div>
                </div>
              </div>
            ))}

            {/* Generelle noter */}
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

            {[
              { seg: "1", label: form.segment1_ydelse, s1: "segment1_sms1", s2: "segment1_sms2" },
              form.segment2_ydelse ? { seg: "2", label: form.segment2_ydelse, s1: "segment2_sms1", s2: "segment2_sms2" } : null,
            ].filter(Boolean).map(({ seg, label, s1, s2 }) => (
              <div key={seg} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={pill(C.blue, C.blueDim)}>Segment {seg}</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{label}</span>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...lbl, color: C.blue }}>SMS #1 — Genaktivering</label>
                  <textarea style={{ ...inp, minHeight: 130, resize: "vertical", lineHeight: 1.7 }}
                    value={smsRedigeret[s1]} onChange={e => setSmsRedigeret(r => ({ ...r, [s1]: e.target.value }))} />
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>{smsRedigeret[s1]?.length || 0} tegn · {Math.ceil((smsRedigeret[s1]?.length || 0) / 160)} segment(er)</div>
                </div>

                <div>
                  <label style={{ ...lbl, color: C.blue }}>SMS #2 — Booster (48 timer efter)</label>
                  <textarea style={{ ...inp, minHeight: 110, resize: "vertical", lineHeight: 1.7 }}
                    value={smsRedigeret[s2]} onChange={e => setSmsRedigeret(r => ({ ...r, [s2]: e.target.value }))} />
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>{smsRedigeret[s2]?.length || 0} tegn · {Math.ceil((smsRedigeret[s2]?.length || 0) / 160)} segment(er)</div>
                </div>
              </div>
            ))}

            {error && <div style={{ background: C.errorBg, border: `1px solid #FECACA`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.error, fontSize: 14 }}>{error}</div>}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button style={btnSecondary} onClick={() => setStep(1)}>← Ret input</button>
              <button style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, minWidth: 210 }}
                disabled={loading} onClick={raffinerOgGenerer}>
                {loading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner />Genererer levering...</span> : "Poler & generer levering ✦"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: LEVERING ── */}
        {step === 3 && result && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, margin: "0 0 4px" }}>{form.kliknavn}</h1>
                <div style={{ fontSize: 13, color: C.textMuted }}>Dataanalyse & Kampagneanbefalinger · {form.dato} · Allio</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnSecondary} onClick={() => { setStep(1); setResult(null); setSmsRedigeret(null); }}>Ny kampagne</button>
                <button style={{ ...btnPrimary, minWidth: 120 }} onClick={copyAll}>{copied === "all" ? "Kopieret ✓" : "Kopiér alt"}</button>
                <button style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6 }} onClick={cpAll}>
                  ↓ Kopiér dok.
                </button>
              </div>
            </div>

            {/* Status */}
            <div style={{ ...card, borderLeft: `3px solid ${C.blue}`, background: C.white }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Status & Potentiale</div>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7, color: C.textMid }}>{result.levering.status_analyse}</p>
            </div>

            {/* Totaler */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[["Kampagnepris", result.levering.samlet_pris], ["Forv. bookinger", result.levering.samlet_bookinger], ["Forv. omsætning", result.levering.samlet_omsaetning]].map(([k, v]) => (
                <div key={k} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.navy }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Segmenter */}
            {[
              { seg: result.levering.segment1, label: "Segment 1", ydelse: form.segment1_ydelse, sms1: result.sms.segment1_sms1, sms2: result.sms.segment1_sms2, k1: "s1_sms1", k2: "s1_sms2" },
              form.segment2_ydelse && result.levering.segment2?.navn ? { seg: result.levering.segment2, label: "Segment 2", ydelse: form.segment2_ydelse, sms1: result.sms.segment2_sms1, sms2: result.sms.segment2_sms2, k1: "s2_sms1", k2: "s2_sms2" } : null,
            ].filter(Boolean).map(({ seg, label, ydelse, sms1, sms2, k1, k2 }) => (
              <div key={label} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={pill(C.blue, C.blueDim)}>{label}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{seg.navn || ydelse}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{seg.antal}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>sovende kunder</div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>{seg.beskrivelse}</p>

                {[{ title: "SMS #1 — GENAKTIVERING", tekst: sms1, key: k1 }, { title: "SMS #2 — BOOSTER (48 TIMER EFTER)", tekst: sms2, key: k2 }].map(({ title, tekst, key }) => (
                  <div key={key} style={{ background: C.surfaceAlt, border: `1px solid ${C.borderLight}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.06em" }}>{title}</span>
                      <button onClick={() => copyText(tekst, key)} style={{ background: copied === key ? C.successBg : C.white, border: `1px solid ${copied === key ? C.success : C.border}`, borderRadius: 6, padding: "3px 12px", fontSize: 11, fontWeight: 600, color: copied === key ? C.success : C.textMuted, cursor: "pointer" }}>
                        {copied === key ? "Kopieret ✓" : "Kopiér"}
                      </button>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: C.textMid, whiteSpace: "pre-wrap" }}>{tekst}</div>
                    <div style={{ fontSize: 11, color: C.textLight, marginTop: 8 }}>{tekst?.length || 0} tegn · {Math.ceil((tekst?.length || 0) / 160)} segment(er)</div>
                  </div>
                ))}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                  {[["Udsendelse", seg.pris_udsendelse], ["Bookinger", seg.forventet_bookinger], ["Omsætning", seg.forventet_omsaetning]].map(([k, v]) => (
                    <div key={k} style={{ background: C.surfaceAlt, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.borderLight}` }}>
                      <div style={{ fontSize: 10, color: C.textLight, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Næste skridt */}
            <div style={card}>
              <div style={secLabel}>Næste skridt</div>
              {result.levering.naeste_skridt?.map((s, i) => (
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
        )}
      </div>
    </div>
  );
}
