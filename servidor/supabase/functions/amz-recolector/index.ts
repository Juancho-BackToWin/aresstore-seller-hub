// Agente 0 · Recolector SP-API · Aresstore.
// Descarga inventario FBA y líneas de pedido (sin datos del comprador).
//
// Historia: la PR #24 trajo la v1 (solo inventario, JWT anon). La noche del
// 26-nov el chat del proyecto desplegó encima su v3 (inventario + pedidos,
// cabecera x-recolector-key). Este fichero ES la v3 desplegada, traída al
// repositorio el 27-nov para que un despliegue desde aquí no la pise.
// Lo comprueba tests/recolector.test.js, que la ejecuta con SP-API y Supabase
// simulados.
//
// Convención (compartida con la v1):
//   inventario -> amz_inventario_foto, documento 'spapi/inventario/<PAIS>/<fecha Madrid>'
//   pedidos    -> amz_pedidos_api (clave order_id+order_item_id)
//   cada pasada -> amz_documentos (clave del documento) + amz_ingestas (id_hub 'inventario' | 'pedidos')
// Acceso: cabecera x-recolector-key igual a amz_config.recolector_key
// (verify_jwt = false en Supabase; la clave la comprueba la propia función).
// Parámetros (query): dias (3, entre 1 y 30), mercados (ES), solo (inventario|pedidos).
// Secretos del entorno de la función, nunca del repositorio: SPAPI_LWA_CLIENT_ID,
// SPAPI_LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// La tarea diaria está en servidor/sql/002_recolector_cron.sql.
//
// Límites (lo que NO hace):
//   - Pedidos: Orders API da precio con IVA y sin comisiones ni tarifas. No es
//     dinero cobrado: para eso, el informe de transacciones o Finances API.
//   - amz_pedidos_api incluye pedidos pendientes y cancelados: filtrar por estado.
//   - No escribe en amz_ventas_linea.
import { createClient } from "jsr:@supabase/supabase-js@2";

const EU = "https://sellingpartnerapi-eu.amazon.com";
const MP: Record<string, string> = {
  ES: "A1RKKUPIHCS9HS", FR: "A13V1IB3VIYZZH", DE: "A1PA6795UKMFR9", IT: "APJ6JRA9NG5V4",
  NL: "A1805IZSGTT6HS", BE: "AMEN7PMS3EDWL", PL: "A1C3SOZRARQ6R3", SE: "A2NODRKZP88ZB9", IE: "A28R8C7NBKEWEA",
};
const PAIS = Object.fromEntries(Object.entries(MP).map(([k, v]) => [v, k]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (m: any) => (m && m.Amount != null ? Number(m.Amount) : null);
const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function huella(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function documento(clave: string, resumen: unknown) {
  const texto = JSON.stringify(resumen);
  const { error } = await db.from("amz_documentos").upsert(
    { clave, texto, meta: { origen: "sp-api", funcion: "amz-recolector" }, huella: await huella(texto), bytes: texto.length },
    { onConflict: "clave" },
  );
  if (error) throw new Error("documento: " + error.message);
}
async function ingesta(id_hub: string, estado: string, mercados: string[], clave: string, registro: unknown) {
  await db.from("amz_ingestas").insert({ id_hub, estado, cuando: new Date().toISOString(), mercados, clave, registro });
}

async function token(): Promise<string> {
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: Deno.env.get("SPAPI_REFRESH_TOKEN")!.trim(),
      client_id: Deno.env.get("SPAPI_LWA_CLIENT_ID")!.trim(),
      client_secret: Deno.env.get("SPAPI_LWA_CLIENT_SECRET")!.trim(),
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`LWA ${r.status} ${j.error ?? ""}`);
  return j.access_token;
}

async function api(tk: string, path: string, intentos = 5): Promise<any> {
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(EU + path, { headers: { "x-amz-access-token": tk } });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${j.errors?.[0]?.code ?? ""} ${j.errors?.[0]?.message ?? ""}`);
    return j;
  }
  throw new Error(`${path.split("?")[0]} límite de peticiones`);
}

async function inventario(tk: string, pais: string) {
  const t0 = Date.now();
  const id = MP[pais];
  const fecha = hoyMadrid();
  const clave = `spapi/inventario/${pais}/${fecha}`;
  const filas: any[] = [];
  let next: string | undefined;
  do {
    const q = `/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${id}&marketplaceIds=${id}` + (next ? `&nextToken=${encodeURIComponent(next)}` : "");
    const j = await api(tk, q);
    for (const s of j.payload?.inventorySummaries ?? []) {
      const d = s.inventoryDetails ?? {};
      filas.push({
        fecha_foto: fecha, sku: s.sellerSku, pais,
        disponibles: d.fulfillableQuantity ?? 0,
        no_vendibles: d.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0,
        reservadas: d.reservedQuantity?.totalReservedQuantity ?? 0,
        entrantes: (d.inboundWorkingQuantity ?? 0) + (d.inboundShippedQuantity ?? 0) + (d.inboundReceivingQuantity ?? 0),
        edad: { asin: s.asin, condicion: s.condition, total: s.totalQuantity, actualizado: s.lastUpdatedTime },
        documento: clave,
      });
    }
    next = j.pagination?.nextToken;
    if (next) await sleep(600);
  } while (next);
  const totales = filas.reduce((a, f) => ({ disponibles: a.disponibles + f.disponibles, no_vendibles: a.no_vendibles + f.no_vendibles, reservadas: a.reservadas + f.reservadas, entrantes: a.entrantes + f.entrantes }), { disponibles: 0, no_vendibles: 0, reservadas: 0, entrantes: 0 });
  const resumen = { skus: filas.length, totales, segundos: (Date.now() - t0) / 1000 };
  await documento(clave, resumen);
  await db.from("amz_inventario_foto").delete().eq("documento", clave);
  if (filas.length) { const { error } = await db.from("amz_inventario_foto").insert(filas); if (error) throw new Error("guardar inventario: " + error.message); }
  await ingesta("inventario", "ok", [pais], clave, resumen);
  return resumen;
}

async function pedidos(tk: string, paises: string[], dias: number) {
  const t0 = Date.now();
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const ids = paises.map((p) => MP[p]).join(",");
  const ordenes: any[] = [];
  let next: string | undefined;
  do {
    const q = next
      ? `/orders/v0/orders?MarketplaceIds=${ids}&NextToken=${encodeURIComponent(next)}`
      : `/orders/v0/orders?MarketplaceIds=${ids}&LastUpdatedAfter=${encodeURIComponent(desde)}&MaxResultsPerPage=100`;
    const j = await api(tk, q);
    ordenes.push(...(j.payload?.Orders ?? []));
    next = j.payload?.NextToken;
    if (next) await sleep(2000);
  } while (next);

  const filas: any[] = [];
  for (let i = 0; i < ordenes.length; i++) {
    const o = ordenes[i];
    if (i > 0) await sleep(i < 25 ? 300 : 2100);
    let nt: string | undefined;
    do {
      const j = await api(tk, `/orders/v0/orders/${o.AmazonOrderId}/orderItems` + (nt ? `?NextToken=${encodeURIComponent(nt)}` : ""));
      for (const it of j.payload?.OrderItems ?? []) {
        filas.push({
          order_id: o.AmazonOrderId, order_item_id: it.OrderItemId,
          fecha_compra: o.PurchaseDate, ultima_actualizacion: o.LastUpdateDate,
          estado: o.OrderStatus, canal: o.FulfillmentChannel,
          marketplace_id: o.MarketplaceId, pais: PAIS[o.MarketplaceId] ?? o.MarketplaceId,
          sku: it.SellerSKU, asin: it.ASIN,
          unidades: it.QuantityOrdered, unidades_enviadas: it.QuantityShipped,
          precio: num(it.ItemPrice), iva: num(it.ItemTax), descuento: num(it.PromotionDiscount),
          divisa: it.ItemPrice?.CurrencyCode ?? o.OrderTotal?.CurrencyCode ?? null,
          b2b: o.IsBusinessOrder ?? null, recogido: new Date().toISOString(),
        });
      }
      nt = j.payload?.NextToken;
    } while (nt);
  }
  if (filas.length) {
    const { error } = await db.from("amz_pedidos_api").upsert(filas, { onConflict: "order_id,order_item_id" });
    if (error) throw new Error("guardar pedidos: " + error.message);
  }
  const resumen = { pedidos: ordenes.length, lineas: filas.length, unidades: filas.reduce((a, f) => a + (f.unidades ?? 0), 0), desde, segundos: (Date.now() - t0) / 1000 };
  const clave = `spapi/pedidos/${paises.join("-")}/${hoyMadrid()}`;
  await documento(clave, resumen);
  await ingesta("pedidos", "ok", paises, clave, resumen);
  return resumen;
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "Content-Type": "application/json" } });
  const { data: cfg } = await db.from("amz_config").select("valor").eq("clave", "recolector_key").maybeSingle();
  if (!cfg?.valor || req.headers.get("x-recolector-key") !== cfg.valor) return json({ ok: false, error: "no autorizado" }, 401);

  const u = new URL(req.url);
  const dias = Math.min(Math.max(Number(u.searchParams.get("dias") ?? 3), 1), 30);
  const paises = (u.searchParams.get("mercados") ?? u.searchParams.get("pais") ?? "ES").split(",").map((s) => s.trim().toUpperCase()).filter((p) => MP[p]);
  const solo = u.searchParams.get("solo");
  const res: Record<string, unknown> = {};
  const errores: string[] = [];
  let tk = "";
  try { tk = await token(); } catch (e) { errores.push(String(e)); }
  if (tk && solo !== "pedidos") for (const p of paises) { try { res[`inventario_${p}`] = await inventario(tk, p); } catch (e) { errores.push(`inventario ${p}: ${e}`); } }
  if (tk && solo !== "inventario") { try { res.pedidos = await pedidos(tk, paises, dias); } catch (e) { errores.push(`pedidos: ${e}`); } }
  if (errores.length) { try { await documento(`spapi/errores/${hoyMadrid()}`, errores); await ingesta("recolector", Object.keys(res).length ? "parcial" : "error", paises, `spapi/errores/${hoyMadrid()}`, { errores }); } catch (_) { /* sin registro */ } }
  return json({ ok: !errores.length, res, errores }, errores.length && !Object.keys(res).length ? 502 : 200);
});
