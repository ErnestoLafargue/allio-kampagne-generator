const TOM_SMS = { sms1: "", sms2: "" };

function hentSmsListe(data, antal) {
  if (Array.isArray(data?.kampagner)) {
    return data.kampagner.map(k => ({
      sms1: k.sms1 || "",
      sms2: k.sms2 || "",
    }));
  }

  const legacy = [];
  for (let i = 1; i <= antal; i++) {
    legacy.push({
      sms1: data?.[`segment${i}_sms1`] || "",
      sms2: data?.[`segment${i}_sms2`] || "",
    });
  }
  return legacy;
}

function padSlice(liste, antal, tom) {
  const result = [...liste];
  while (result.length < antal) result.push({ ...tom });
  return result.slice(0, antal);
}

export function normaliserSmsKampagner(data, antal) {
  return padSlice(hentSmsListe(data, antal), antal, TOM_SMS);
}

export function normaliserLeveringKampagner(levData, antal, formKampagner) {
  const fraApi = Array.isArray(levData?.kampagner) ? levData.kampagner : [];
  return padSlice(fraApi, antal, {}).map((lev, i) => {
    const k = formKampagner[i] || {};
    return {
      navn: lev.navn || k.ydelse || "",
      antal: parseInt(k.antal) || 0,
      beskrivelse: lev.beskrivelse || "",
    };
  });
}
