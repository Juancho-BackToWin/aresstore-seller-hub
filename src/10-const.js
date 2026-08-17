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
/* Mapa de dominio de marketplace -> código de país. Los informes de Amazon
   identifican el país de formas distintas según el informe, nunca por el
   nombre del fichero. */
const MKT_MAP = {
  'amazon.de':'DE','amazon.fr':'FR','amazon.it':'IT','amazon.es':'ES','amazon.pl':'PL',
  'amazon.nl':'NL','amazon.com.be':'BE','amazon.ie':'IE','amazon.se':'SE',
  'germany':'DE','france':'FR','italy':'IT','spain':'ES','poland':'PL',
  'netherlands':'NL','belgium':'BE','ireland':'IE','sweden':'SE',
  'de':'DE','fr':'FR','it':'IT','es':'ES','pl':'PL','nl':'NL','be':'BE','ie':'IE','se':'SE'
};

const FUEL = 1.015;                 // recargo de combustible sobre logística FBA
const STORAGE_LOW = 27.54, STORAGE_HIGH = 52.20;   // €/m³/mes standard
const PPWR_DATE = '2026-08-12';
let TARGET = {net:15, contrib:30, roi:60, tacos:15, cover:35, cash:3000};
let ppcMode = 'tacos';
let calcChannel = 'FBA';
let countryState = {};
let countryFilter = 'ALL';
let periodDays = 30;
