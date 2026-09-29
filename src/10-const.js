/* =========================================================================
   ARESSTORE SELLER HUB v0.3
   Todo ocurre en tu navegador. No hay servidor, cuenta ni telemetría.
   ========================================================================= */

/* ---------- Países. storage: Amazon documenta almacenamiento PanEU activable
     por NIF-IVA. lowInv: aplica Low-Inventory Cost Coverage Fee. ---------- */
const COUNTRIES = [
  {code:'DE', name:'Alemania',     vat:19, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR'},
  {code:'FR', name:'Francia',      vat:20, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR'},
  {code:'IT', name:'Italia',       vat:22, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR'},
  {code:'ES', name:'España',       vat:21, storage:true,  lowInv:true,  vatCost:1500, cur:'EUR'},
  {code:'PL', name:'Polonia',      vat:23, storage:true,  lowInv:false, vatCost:1500, cur:'PLN'},
  {code:'NL', name:'Países Bajos', vat:21, storage:false, lowInv:false, vatCost:0,    cur:'EUR'},
  {code:'BE', name:'Bélgica',      vat:21, storage:false, lowInv:false, vatCost:0,    cur:'EUR'},
  {code:'IE', name:'Irlanda',      vat:23, storage:false, lowInv:false, vatCost:0,    cur:'EUR'},
  {code:'SE', name:'Suecia',       vat:25, storage:false, lowInv:false, vatCost:0,    cur:'SEK'}
];

/* Tipo general de IVA por país, para el DETECTOR de tipo reducido.

   Sale de COUNTRIES para los mercados donde ya se vende, así que no hay dos
   verdades para el mismo país; se añaden a mano los que aparecen en el informe
   fiscal sin que vendamos allí todavía. Se usa solo para comparar contra el
   tipo que Amazon aplicó de verdad: si el aplicado es menor, o el producto está
   clasificado en una categoría reducida que no le toca, o hay una exención — y
   las dos cosas hay que verlas. */
const VAT_GENERAL = (function(){
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
  /* El informe de IVA escribe el nombre COMPLETO del pais en
     TAXABLE_JURISDICTION: SPAIN, GERMANY, PORTUGAL, POLAND... Cortar por las
     dos primeras letras daba SP, GE, y PO para Portugal Y Polonia a la vez, y
     ninguno encontraba su tipo general: la diferencia salia cero justo en el
     pais que mas pesa. */
  'austria':'AT','portugal':'PT','at':'AT','pt':'PT',
  'amazon.at':'AT','amazon.pt':'PT','amazon.co.uk':'GB',
  'united kingdom':'GB','great britain':'GB','uk':'GB','gb':'GB'
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
