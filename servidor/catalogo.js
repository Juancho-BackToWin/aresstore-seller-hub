'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/catalogo.js · qué informe del hub pide qué reportType de SP-API

   REGLA QUE MANDA AQUÍ: SOLO VARIANTES NO RESTRINGIDAS, SIN DATOS DE COMPRADOR.
   Amazon marca como «restricted report type» los informes que llevan datos
   personales del comprador, y exige para ellos una ficha aparte (RDT) y una
   revisión de seguridad adicional:
     «This is a restricted report type. When you specify a restricted report type
      in a call to the getReportDocument operation, you must pass in a Restricted
      Data Token (RDT) for authorization.»
     «some report types require restrictions because they contain customer PII data»
   Cuando un informe tiene pareja —una variante con PII y otra sin ella— aquí se
   usa la que NO la tiene, aunque traiga menos columnas. El hub no calcula nada
   con el nombre, la dirección ni el teléfono de nadie: pedirlos sería recoger
   datos personales que no se usan, y eso además contradice por escrito los
   controles de seguridad de `tests/privacidad.test.js`.

   Fuentes, todas consultadas el 17 de septiembre de 2026:
     · https://developer-docs.amazon.com/sp-api/docs/report-type-values-order
     · https://developer-docs.amazon.com/sp-api/docs/report-type-values-fba
     · https://developer-docs.amazon.com/sp-api/docs/report-type-values-tax
     · https://developer-docs.amazon.com/sp-api/docs/report-type-values-settlement
     · https://developer-docs.amazon.com/sp-api/docs/report-type-values-analytics
   ═══════════════════════════════════════════════════════════════════════════ */

/* Cómo se consigue cada informe:
     PEDIR   · createReport → getReport → getReportDocument
     LISTAR  · ya existe, se busca con getReports y se archiva
     MANUAL  · NO se automatiza; se sigue arrastrando el fichero a mano, y aquí
               se dice por qué */
const VIA = {PEDIR:'PEDIR', LISTAR:'LISTAR', MANUAL:'MANUAL'};

const CATALOGO = {

  /* ── Pedidos ──────────────────────────────────────────────────────────────
     Se elige la variante `_GENERAL`, que es la que NO lleva datos del
     comprador. La documentación de informes de pedidos lista como restringidos
     (RDT + PII) `GET_FLAT_FILE_ORDER_REPORT_DATA_SHIPPING`,
     `GET_ORDER_REPORT_DATA_SHIPPING`, `_INVOICING` y `_TAX`, que traen la
     dirección de envío. Las cuatro variantes «all orders» son las `_GENERAL`,
     ninguna restringida: son exactamente las que necesita el hub (unidades,
     importe, impuesto, país, divisa) sin una sola columna de persona.
     Verificado además que NO existe un `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE`
     sin sufijo: la variante sin PII no es una versión recortada, es la única. */
  orders: {
    tipo: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    via: VIA.PEDIR,
    restringido: false,
    descartadas: ['GET_FLAT_FILE_ORDER_REPORT_DATA_SHIPPING',
                  'GET_ORDER_REPORT_DATA_SHIPPING',
                  'GET_ORDER_REPORT_DATA_INVOICING',
                  'GET_ORDER_REPORT_DATA_TAX'],
    porQueEsa: 'Las descartadas son «restricted report type» y llevan la dirección ' +
               'del comprador. La `_GENERAL` trae lo que el hub calcula y ninguna PII.',
    ventanaDias: 30,
    nota: 'Se pide por fecha de pedido (BY_ORDER_DATE), que es como cuenta el hub. ' +
          'La variante BY_LAST_UPDATE_GENERAL recogería el mismo pedido dos veces ' +
          'si cambia de estado, y duplicaría ventas.'
  },

  /* ── Inventario ───────────────────────────────────────────────────────── */
  inventory: {
    tipo: 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA',
    via: VIA.PEDIR, restringido: false,
    nota: '«Contains current details of active (not archived) inventory including ' +
          'condition, quantity, and volume. Content updated in near real-time.»'
  },
  multicountry: {
    tipo: 'GET_AFN_INVENTORY_DATA_BY_COUNTRY',
    via: VIA.PEDIR, restringido: false,
    nota: 'Solo tiendas de Europa. «Contains quantity available for local fulfillment by country.»'
  },
  ledger: {
    tipo: 'GET_LEDGER_DETAIL_VIEW_DATA',
    via: VIA.PEDIR, restringido: false,
    admiteOpciones: ['eventType','FNSKU','MSKU','ASIN'],
    nota: '18 meses de movimientos. El hub hoy lo guarda sin usarlo (`guardaSinUsar`).'
  },
  returns: {
    tipo: 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
    via: VIA.PEDIR, restringido: false,
    nota: '«Content updated daily»: pedirlo dos veces el mismo día no trae nada nuevo.'
  },

  /* ── Tarifas ──────────────────────────────────────────────────────────────
     UNA VEZ AL DÍA. Literal de la documentación:
       «This report can only be requested once per day per seller.»
       «The content is updated at least once every 72 hours. To successfully
        generate a report, specify the dataStartTime parameter for a minimum
        72 hours prior to NOW.»
     Las dos frases importan. La primera obliga a llevar la cuenta de si ya se
     pidió hoy: el segundo intento no da error, vuelve CANCELLED, y quien lea
     CANCELLED como «no hay datos» archivará que este SKU no tiene tarifas.
     La segunda obliga a poner `dataStartTime` al menos 72 horas atrás. */
  fees: {
    tipo: 'GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA',
    via: VIA.PEDIR, restringido: false,
    unaVezAlDia: true,
    horasMinimasAtras: 72,
    nota: 'Una vez al día por vendedor, y dataStartTime a 72 h o más.'
  },
  storage: {
    tipo: 'GET_FBA_STORAGE_FEE_CHARGES_DATA',
    via: VIA.PEDIR, restringido: false,
    nota: 'Mensual. El hub lo guarda sin usarlo todavía.'
  },
  planning: {
    tipo: 'GET_FBA_INVENTORY_PLANNING_DATA',
    via: VIA.PEDIR, restringido: false
  },
  reimb: {
    tipo: 'GET_FBA_REIMBURSEMENTS_DATA',
    via: VIA.PEDIR, restringido: false
  },

  /* ── Liquidaciones ────────────────────────────────────────────────────────
     NO SE PIDEN: SE LISTAN Y SE ARCHIVAN. Literal:
       «Settlement reports cannot be requested or scheduled. They are
        automatically scheduled by Amazon. You can search for these reports
        using the getReports operation.»
     Y solo se ven 90 días atrás: «Reports are retained for a maximum of 90
     days» (parámetro `createdSince` de getReports). Este es el único dato de
     todo el hub que se pierde PARA SIEMPRE si nadie lo archiva a tiempo. */
  settlement: {
    tipo: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
    tiposObsoletos: ['GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE',
                     'GET_V2_SETTLEMENT_REPORT_DATA_XML'],
    via: VIA.LISTAR, restringido: false,
    ventanaRetencionDias: 90,
    nota: 'createReport con este tipo falla siempre: Amazon los programa él. ' +
          'Archivar dentro de los 90 días o perderlos.'
  },

  /* ── Los que NO se automatizan, y por qué ────────────────────────────────── */
  vat: {
    tipo: 'GET_VAT_TRANSACTION_DATA',
    via: VIA.MANUAL, restringido: true,
    porQueManual:
      'Es «restricted report type»: exige ficha restringida (RDT) y una revisión ' +
      'de seguridad adicional porque puede llevar datos del comprador. No existe ' +
      'variante sin restricción de este informe, así que la regla del carril ' +
      '—solo variantes no restringidas— lo deja fuera. Se sigue arrastrando a ' +
      'mano. Automatizarlo es una decisión con consecuencias de cumplimiento, no ' +
      'una tarea de programación.'
  },
  searchterm: {
    tipo: null,
    via: VIA.MANUAL, restringido: false,
    porQueManual:
      'El informe de términos de búsqueda de Publicidad NO está en SP-API: es de ' +
      'la Amazon Ads API, que es otra API, con otra autorización y otro alta. El ' +
      'único parecido en SP-API, GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT, exige ' +
      'estar en Brand Registry y NO trae el gasto de las campañas propias, que es ' +
      'justo lo que el hub calcula. Ponerlo aquí sería prometer un dato que esta ' +
      'API no da.'
  }
};

/* Los doce informes del hub, para poder comprobar que no falta ninguno por
   clasificar: el peligro no es equivocarse, es olvidarse en silencio. */
const IDS_HUB = ['orders','inventory','multicountry','fees','returns','searchterm',
                 'ledger','settlement','storage','planning','reimb','vat'];

function entrada(idHub){
  const e = CATALOGO[idHub];
  if(!e){
    const err = new Error('El informe «'+idHub+'» no está en el catálogo de SP-API');
    err.codigo = 'SIN_CATALOGAR';
    throw err;
  }
  return e;
}
function automatizables(){
  return IDS_HUB.filter(id => CATALOGO[id] && CATALOGO[id].via !== VIA.MANUAL);
}
/* Ningún informe restringido debe llegar nunca a pedirse. Es una comprobación
   de las que no deberían hacer falta; existe porque el día que alguien añada un
   tipo nuevo con prisa, esta es la que salta. */
function comprobarNoRestringido(idHub){
  const e = entrada(idHub);
  if(e.restringido){
    const err = new Error('El informe «'+idHub+'» ('+e.tipo+') es restringido (PII) y este ' +
      'carril no lo pide: ' + (e.porQueManual||''));
    err.codigo = 'INFORME_RESTRINGIDO';
    throw err;
  }
  return e;
}

module.exports = { CATALOGO, VIA, IDS_HUB, entrada, automatizables, comprobarNoRestringido };
