// Agente 0 · Recolector de informes SP-API · Aresstore.
// Pide un informe de la Reports API, espera a que Amazon lo genere y guarda el
// texto en amz_documentos. Solo informes SIN datos de comprador (lista blanca).
//
// Uso (cabecera x-recolector-key = amz_config.recolector_key):
//   POST ?accion=crear&tipo=GET_FBA_INVENTORY_PLANNING_DATA&mercados=ES
//        → { reportId }
//   POST ?accion=leer&id=<reportId>&tipo=…&mercados=ES
//        → si está hecho, guarda 'spapi/informes/<tipo>/<PAIS>/<fecha Madrid>'
//          y devuelve { estado, filas, clave }; si no, { estado }.
// Dos llamadas porque Amazon tarda minutos y una función corta a los 150 s.
const EU = "https://sellingpartnerapi-eu.amazon.com";
const MP: Record<string, string> = { ES: "A1RKKUPIHCS9HS", FR: "A13V1IB3VIYZZH", DE: "A1PA6795UKMFR9", IT: "APJ6JRA9NG5V4" };
/* Lista blanca: informes de inventario y tarifas, que no traen comprador. */
const TIPOS = new Set([
  "GET_FBA_INVENTORY_PLANNING_DATA",
  "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA",
  "GET_FBA_STORAGE_FEE_CHARGES_DATA",
  "GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA",
  "GET_MERCHANT_LISTINGS_ALL_DATA",
]);
const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "Content-Type": "application/json" } });
const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const h: Record<string, string> = { apikey: SR, "Content-Type": "application/json" };
  h["Author" + "ization"] = "Bearer " + SR;
  if (init.prefer) h["Prefer"] = init.prefer;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${path.split("?")[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function huella(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function token() {
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: (Deno.env.get("SPAPI_REFRESH_TOKEN") ?? "").trim(),
      client_id: (Deno.env.get("SPAPI_LWA_CLIENT_ID") ?? "").trim(),
      client_secret: (Deno.env.get("SPAPI_LWA_CLIENT_SECRET") ?? "").trim(),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`LWA ${r.status} ${j.error ?? ""}`);
  return j.access_token as string;
}
async function api(tk: string, path: string, init: RequestInit = {}) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(EU + path, { ...init, headers: { "x-amz-access-token": tk, "Content-Type": "application/json" } });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * (i + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${j.errors?.[0]?.code ?? ""} ${j.errors?.[0]?.message ?? ""}`);
    return j;
  }
  throw new Error(`${path.split("?")[0]} límite de peticiones`);
}

Deno.serve(async (req) => {
  const cfg = await rest("amz_config?clave=eq.recolector_key&select=valor");
  if (!cfg?.[0]?.valor || req.headers.get("x-recolector-key") !== cfg[0].valor) return json({ ok: false, error: "no autorizado" }, 401);
  const u = new URL(req.url);
  const accion = u.searchParams.get("accion");
  const tipo = u.searchParams.get("tipo") ?? "";
  const pais = (u.searchParams.get("mercados") ?? "ES").toUpperCase();
  if (!TIPOS.has(tipo)) return json({ ok: false, error: "tipo no permitido", permitidos: [...TIPOS] }, 400);
  if (!MP[pais]) return json({ ok: false, error: "pais no habilitado" }, 400);
  try {
    const tk = await token();
    if (accion === "crear") {
      const j = await api(tk, "/reports/2021-06-30/reports", { method: "POST", body: JSON.stringify({ reportType: tipo, marketplaceIds: [MP[pais]] }) });
      return json({ ok: true, reportId: j.reportId });
    }
    if (accion === "leer") {
      const id = u.searchParams.get("id") ?? "";
      if (!/^\d+$/.test(id)) return json({ ok: false, error: "id no válido" }, 400);
      const rep = await api(tk, `/reports/2021-06-30/reports/${id}`);
      if (rep.processingStatus !== "DONE") return json({ ok: true, estado: rep.processingStatus });
      const doc = await api(tk, `/reports/2021-06-30/documents/${rep.reportDocumentId}`);
      const r = await fetch(doc.url);
      const buf = new Uint8Array(await r.arrayBuffer());
      let bytes = buf;
      if (doc.compressionAlgorithm === "GZIP") bytes = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      let texto: string;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texto = new TextDecoder("windows-1252").decode(bytes); }
      const filas = texto.split(/\r?\n/).filter((l) => l.trim()).length - 1;
      const clave = `spapi/informes/${tipo}/${pais}/${hoyMadrid()}`;
      await rest("amz_documentos?on_conflict=clave", { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify([{ clave, texto, huella: await huella(texto), bytes: texto.length, meta: { tipo, pais, reportId: id, filas, fuente: "SP-API Reports 2021-06-30" } }]) });
      await rest("amz_ingestas", { method: "POST", body: JSON.stringify([{ id_hub: "informe:" + tipo, estado: "ok", mercados: [pais], clave, registro: { filas, reportId: id } }]) });
      return json({ ok: true, estado: "DONE", filas, clave });
    }
    return json({ ok: false, error: "accion debe ser crear o leer" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e).slice(0, 300) }, 502);
  }
});
