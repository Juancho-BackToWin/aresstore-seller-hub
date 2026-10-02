/* =========================================================================
   ARESSTORE SELLER HUB v0.3
   Todo ocurre en tu navegador. No hay servidor, cuenta ni telemetría.
   ========================================================================= */

/* ---------- Países. storage: Amazon documenta almacenamiento PanEU activable
     por NIF-IVA. lowInv: aplica Low-Inventory Cost Coverage Fee.

   `origen` dice DE DÓNDE sale que este país esté en la lista, porque un país
   de más mueve el IVA, la rentabilidad por mercado y el coste de gestoría:

     'base'    · estaba desde el principio, no lo he vuelto a medir.
     'medido'  · aparece en los informes reales de /root/aresstore-reales,
                 y el comentario dice en qué columna y de qué fichero.
     'heredado'· lo dice el encargo y NO he podido confirmarlo en ningún
                 fichero ni fuente. La pantalla lo marca como no confirmado.

   Los cuatro añadidos el 17-sep-2026 salen de cruzar COUNTRIES con las
   columnas de país de los informes reales (medido con `cut`/`awk`, no de
   memoria). Lo que se encontró y lo que NO, en docs/carriles/8-cumplimiento.md.

   Tipos generales de IVA verificados el 17-sep-2026 contra la tabla oficial de
   la Comisión «Table 2: VAT rates in the Member States» (DG TAXUD,
   https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en)
   y, para Eslovaquia, contra Access2Markets «Recent VAT changes in certain EU
   Member States» (23 % desde el 1-1-2025). Detalle y fecha de consulta en
   `CUMPL_FUENTES`, en src/28-cumplimiento.js.                     ---------- */
const COUNTRIES = [
  {code:'DE', name:'Alemania',     vat:19, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR', origen:'base'},
  {code:'FR', name:'Francia',      vat:20, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR', origen:'base'},
  {code:'IT', name:'Italia',       vat:22, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR', origen:'base'},
  {code:'ES', name:'España',       vat:21, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR', origen:'base'},
  {code:'PL', name:'Polonia',      vat:23, storage:true,  lowInv:false, vatCost:1500, cur:'PLN', origen:'base'},
  {code:'NL', name:'Países Bajos', vat:21, storage:false, lowInv:false, vatCost:0,    cur:'EUR', origen:'base'},
  {code:'BE', name:'Bélgica',      vat:21, storage:false, lowInv:false, vatCost:0,    cur:'EUR', origen:'base'},
  {code:'IE', name:'Irlanda',      vat:23, storage:false, lowInv:false, vatCost:0,    cur:'EUR', origen:'base'},
  {code:'SE', name:'Suecia',       vat:25, storage:false, lowInv:false, vatCost:0,    cur:'SEK', origen:'base'},
  /* Austria · MEDIDO. TAXABLE_JURISDICTION = AUSTRIA en los dos informes de
     IVA reales (269805020675.txt y 273390020688.txt), con TAX_REPORTING_SCHEME
     = UNION-OSS y SALE_ARRIVAL_COUNTRY = AT; en pedidos, un envío con
     ship-country AT desde sales-channel Amazon.de. Hay venta y hay hecho
     imponible austriaco. NO hay stock: AT no aparece nunca como
     DEPARTURE_COUNTRY, así que no genera NIF-IVA local por almacén. */
  {code:'AT', name:'Austria',      vat:20, storage:false, lowInv:false, vatCost:0,    cur:'EUR', origen:'medido'},
  /* Portugal · MEDIDO. TAXABLE_JURISDICTION = PORTUGAL en los dos informes de
     IVA (6 y 11 filas), UNION-OSS, vendido desde amazon.es; en pedidos, 24
     filas con ship-country PT. Tampoco aparece como DEPARTURE_COUNTRY: se
     sirve desde ES y DE, así que es venta a distancia, no almacén. */
  {code:'PT', name:'Portugal',     vat:23, storage:false, lowInv:false, vatCost:0,    cur:'EUR', origen:'medido'},
  /* Eslovaquia · MEDIDO, y es el hallazgo que no estaba en ningún sitio:
     DEPARTURE_COUNTRY = SK en filas FC_TRANSFER de los DOS informes de IVA
     (SK→IT en 2026-JUL, SK→DE en 2026-MAY). Un traslado que SALE de Eslovaquia
     solo puede salir de mercancía que estaba en Eslovaquia. No es un mercado
     de venta —no hay ni una fila con jurisdicción SK—, es un país de ALMACÉN,
     que para IVA es lo que obliga a registrarse. Por eso storage:true y
     vatCost distinto de cero aunque las ventas sean cero. */
  {code:'SK', name:'Eslovaquia',   vat:23, storage:true,  lowInv:false, vatCost:1500, cur:'EUR', origen:'medido'},
  /* Chequia · HEREDADO, y hay que decirlo entero: el encargo afirma que es
     país de almacenaje PanEU, pero `grep -w CZ` sobre los once ficheros reales
     de /root/aresstore-reales devuelve CERO coincidencias en todos ellos. Ni
     venta, ni jurisdicción, ni traslado. Se añade porque un país de almacén no
     declarado es exactamente el agujero que este carril existe para tapar,
     pero entra marcado como NO CONFIRMADO y la pantalla lo dice con esas
     palabras: el hub no puede afirmar que haya stock allí. */
  {code:'CZ', name:'Chequia',      vat:21, storage:true,  lowInv:false, vatCost:1500, cur:'CZK', origen:'heredado'}
];

/* Tipo general de IVA por país, para el DETECTOR de tipo reducido.

   Sale de COUNTRIES para los mercados donde ya se vende, así que no hay dos
   verdades para el mismo país; se añaden a mano los que aparecen en el informe
   fiscal sin que vendamos allí todavía. Se usa solo para comparar contra el
   tipo que Amazon aplicó de verdad: si el aplicado es menor, o el producto está
   clasificado en una categoría reducida que no le toca, o hay una exención — y
   las dos cosas hay que verlas. */
const VAT_GENERAL = (function(){
  /* AT y PT siguen aquí aunque desde el 17-sep-2026 estén también en
     COUNTRIES, con EL MISMO valor (20 y 23). Se quedan a propósito: si alguien
     vuelve a sacarlos de COUNTRIES, el detector de tipo reducido no debe
     quedarse ciego en esos dos países de un día para otro. Que la semilla y
     COUNTRIES coincidan lo comprueba tests/cumplimiento.test.js: si alguien
     cambia uno de los dos sitios y no el otro, la suite lo dice. */
  const m = {AT:20, PT:23};
  COUNTRIES.forEach(c => { m[c.code] = c.vat; });
  return m;
})();
/* Mapa de dominio de marketplace -> código de país. Los informes de Amazon
   identifican el país de formas distintas según el informe, nunca por el
   nombre del fichero. */
const MKT_MAP = {
  'amazon.de':'DE','amazon.fr':'FR','amazon.it':'IT','amazon.es':'ES','amazon.pl':'PL',
  'amazon.nl':'NL','amazon.com.be':'BE','amazon.ie':'IE','amazon.se':'SE',
  'germany':'DE','france':'FR','italy':'IT','spain':'ES','poland':'PL',
  'netherlands':'NL','belgium':'BE','ireland':'IE','sweden':'SE',
  'de':'DE','fr':'FR','it':'IT','es':'ES','pl':'PL','nl':'NL','be':'BE','ie':'IE','se':'SE',
  /* INTEGRACIÓN · el informe de IVA escribe el nombre COMPLETO del pais en
     TAXABLE_JURISDICTION (SPAIN, GERMANY...). Cortar por las dos primeras
     letras daba SP y GE, que no existen: la deuda salia cero justo en el
     pais que mas pesa (arreglo A7, entrega del 6-sep). Las claves de abajo
     son las del carril 8 mas 'great britain' y 'uk', que solo traia A7. */
  /* ── Añadido el 17-sep-2026 · carril 8 ──────────────────────────────────
     SOLO SE AÑADE. Ninguna de las claves de arriba cambia de valor, porque
     media docena de módulos deducen el país con ellas.

     Cada clave sale de un valor que APARECE DE VERDAD en los informes reales:

       'AUSTRIA', 'PORTUGAL'     TAXABLE_JURISDICTION del informe de IVA
       'amazon.co.uk'            MARKETPLACE del informe de IVA (2 filas,
                                 AMAZON_FEE / INVOICE en GBP — ojo: son
                                 FACTURAS de Amazon, no ventas nuestras)
       'SK'                      DEPARTURE_COUNTRY de filas FC_TRANSFER
       'AT','PT'                 ship-country del informe de pedidos

     Reino Unido se mapea pero NO entra en COUNTRIES: dos facturas en libras no
     son un mercado de venta, y meterlo en la lista de países pintaría una
     columna de cumplimiento para un país donde no consta ni una venta.
     countryStats() ya lo agrupa en «Otros mercados», que es donde debe estar.

     CUIDADO CON LAS CLAVES DE DOS LETRAS. `countryOf()` (de carril 1) primero
     busca la clave exacta y, si no la encuentra, recorre el mapa buscando
     SUBCADENAS por orden de inserción. Por eso las claves largas van antes que
     las cortas: así 'portugal' casa como 'portugal' y no por accidente. El
     riesgo que queda es ajeno a este carril y está anotado como costura:
     con 'at' en el mapa, un valor futuro como 'Croatia' o 'Latvia' contiene
     'at' y devolvería AT. Hoy no pasa porque ninguno de los dos aparece en
     ningún informe, y lo comprueba tests/cumplimiento.test.js.
     // COSTURA → carril 1: countryOf() debería casar por palabra completa en
     // la pasada de subcadena, no por indexOf. No se toca desde aquí. */
  'amazon.at':'AT','amazon.pt':'PT','amazon.cz':'CZ','amazon.sk':'SK','amazon.co.uk':'GB',
  'austria':'AT','oesterreich':'AT','portugal':'PT',
  'czechia':'CZ','czech republic':'CZ','chequia':'CZ',
  'slovakia':'SK','eslovaquia':'SK','united kingdom':'GB','great britain':'GB',
  /* GUARDAS. Estas tres no son mercados nuestros: están para que la pasada de
     subcadena de `countryOf()` no dé una respuesta falsa. Sin ellas, 'Croatia'
     y 'Latvia' contienen la subcadena 'at' y devolverían AT, y 'Egypt'
     contiene 'pt' y devolvería PT. Con la clave exacta delante, `countryOf()`
     acierta por el camino rápido y no llega nunca al bucle. Devuelven su
     código real, que al no estar en COUNTRIES cae en «Otros mercados»: que es
     exactamente lo que son. Lo comprueba tests/cumplimiento.test.js, y se vio
     fallar antes de añadirlas. */
  'croatia':'HR','latvia':'LV','egypt':'EG',
  'at':'AT','pt':'PT','cz':'CZ','sk':'SK','gb':'GB','uk':'GB'
};
/* Un nombre de jurisdiccion -> codigo ISO, o null si no se reconoce.
   Devolver null y que quien llame lo diga es preferible a devolver un codigo
   inventado: un cero por no reconocer el pais es indistinguible de un cero
   por no haber deuda. */
function paisDeJuris(v){
  const s = String(v==null?'':v).trim().toLowerCase();
  if(!s) return null;
  if(MKT_MAP[s]) return MKT_MAP[s];
  if(/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return null;
}

const FUEL = 1.015;                 // recargo de combustible sobre logística FBA
const STORAGE_LOW = 27.54, STORAGE_HIGH = 52.20;   // €/m³/mes standard
const PPWR_DATE = '2026-08-12';
let TARGET = {net:15, contrib:30, roi:60, tacos:15, cover:35, cash:3000};
let ppcMode = 'tacos';
let calcChannel = 'FBA';
let countryState = {};
let countryFilter = 'ALL';
let periodDays = 30;
