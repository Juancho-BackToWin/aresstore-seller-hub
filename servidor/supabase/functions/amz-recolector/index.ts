// Agente 0 · Recolector. Paso 1: inventario FBA por SKU en España (SP-API).
// Escribe una foto diaria en amz_inventario_foto y deja registro en amz_ingestas.
// Nunca devuelve tokens ni datos de compradores (este informe no los trae).
// Idempotente: una segunda pasada el mismo día no duplica (unique fecha/sku/pais/documento).
//
// Desplegada en Supabase `gestion-arestora` como función `amz-recolector`
// (verify_jwt = true). Secretos que lee del entorno de la función, nunca del
// repositorio: SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN,
// y los que Supabase pone solo: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// La tarea diaria está en servidor/sql/002_recolector_cron.sql.
const EU = "https://sellingpartnerapi-eu.amazon.com";
const MERCADOS: Record<string, string> = { ES: "A1RKKUPIHCS9HS" };
const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const h: Record<string, string> = { apikey: SR, "Content-Type": "application/json" };
  h["Author" + "ization"] = "Bearer " + SR;
  if (init.prefer) h["Prefer"] = init.prefer;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${path.split("?")[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function tokenLWA() {
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
  if (!r.ok || !j.access_token) throw new Error(`lwa ${r.status} ${j.error ?? ""}`);
  return j.access_token as string;
}

async function spapi(tok: string, path: string) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(EU + path, { headers: { "x-amz-access-token": tok } });
    if (r.status === 429 || r.status >= 500) { await dormir(1000 * 2 ** i + Math.random() * 500); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`spapi ${path.split("?")[0]} ${r.status} ${j.errors?.[0]?.code ?? ""}`);
    return j;
  }
  throw new Error(`spapi ${path.split("?")[0]} sin respuesta tras 5 intentos`);
}

async function inventario(tok: string, pais: string) {
  const mk = MERCADOS[pais];
  const filas: Record<string, unknown>[] = [];
  let next: string | undefined;
  let paginas = 0;
  do {
    const q = `/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${mk}&marketplaceIds=${mk}` + (next ? `&nextToken=${encodeURIComponent(next)}` : "");
    const j = await spapi(tok, q);
    for (const s of j.payload?.inventorySummaries ?? []) {
      const d = s.inventoryDetails ?? {};
      filas.push({
        sku: s.sellerSku,
        asin: s.asin,
        disponibles: d.fulfillableQuantity ?? 0,
        no_vendibles: d.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0,
        reservadas: d.reservedQuantity?.totalReservedQuantity ?? 0,
        entrantes: (d.inboundWorkingQuantity ?? 0) + (d.inboundShippedQuantity ?? 0) + (d.inboundReceivingQuantity ?? 0),
        total: s.totalQuantity ?? null,
      });
    }
    next = j.pagination?.nextToken;
    paginas++;
    if (next) await dormir(600);
  } while (next && paginas < 50);
  return filas;
}

Deno.serve(async (req) => {
  const inicio = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(inicio);
  const url = new URL(req.url);
  const pais = (url.searchParams.get("pais") ?? "ES").toUpperCase();
  if (!MERCADOS[pais]) return json({ ok: false, error: "pais no habilitado", habilitados: Object.keys(MERCADOS) }, 400);

  // Freno: como mucho una pasada completa por hora y país.
  const ult = await rest(`amz_ingestas?id_hub=eq.inventario&estado=eq.ok&mercados=cs.{${pais}}&cuando=gte.${new Date(Date.now() - 3600e3).toISOString()}&select=id&limit=1`);
  if (ult?.length && url.searchParams.get("forzar") !== "1") return json({ ok: true, omitido: "ya hubo una pasada en la última hora" });

  const clave = `spapi/inventario/${pais}/${hoy}`;
  try {
    const tok = await tokenLWA();
    const filas = await inventario(tok, pais);
    const cuerpo = JSON.stringify(filas);
    const huella = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cuerpo)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const tot = filas.reduce((a: Record<string, number>, f: any) => { for (const k of ["disponibles", "no_vendibles", "reservadas", "entrantes"]) a[k] = (a[k] ?? 0) + (f[k] as number); return a; }, {});
    await rest("amz_documentos?on_conflict=clave", { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify([{ clave, texto: cuerpo, huella, bytes: cuerpo.length, meta: { tipo: "FBA inventory summaries", pais, fecha: hoy, skus: filas.length, totales: tot, fuente: "SP-API /fba/inventory/v1/summaries" } }]) });
    // Una foto por día: se sustituye la del mismo día.
    await rest(`amz_inventario_foto?documento=eq.${encodeURIComponent(clave)}`, { method: "DELETE" });
    if (filas.length) {
      await rest("amz_inventario_foto", { method: "POST", body: JSON.stringify(filas.map((f: any) => ({ fecha_foto: hoy, sku: f.sku, pais, disponibles: f.disponibles, no_vendibles: f.no_vendibles, reservadas: f.reservadas, entrantes: f.entrantes, edad: { asin: f.asin, total_amazon: f.total }, documento: clave }))) });
    }
    const registro = { skus: filas.length, totales: tot, segundos: (Date.now() - inicio.getTime()) / 1000 };
    await rest("amz_ingestas", { method: "POST", body: JSON.stringify([{ id_hub: "inventario", estado: "ok", mercados: [pais], clave, registro }]) });
    return json({ ok: true, pais, fecha: hoy, ...registro });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await rest("amz_ingestas", { method: "POST", body: JSON.stringify([{ id_hub: "inventario", estado: "error", mercados: [pais], registro: { error: msg } }]) }).catch(() => {});
    return json({ ok: false, error: msg }, 502);
  }
});
