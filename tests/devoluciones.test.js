/* =========================================================================
   CARRIL 10 · UNA SOLA MECÁNICA DE DEVOLUCIONES

   Lo que se comprueba aquí no es que la pantalla pinte devoluciones. Es que
   Validar producto y la cuenta de resultados usen LA MISMA mecánica, y que el
   margen que sale de una y el que sale de la otra coincidan AL CÉNTIMO para el
   mismo producto y la misma tasa de devolución.

   Por qué importa tanto como para tener su propia suite: dos mecánicas
   distintas no dan error. Dan dos márgenes creíbles y distintos para el mismo
   producto, y quien decide comprar 500 unidades mira uno de los dos. Este hub
   tiene prohibido fallar así.

   Toda la aritmética de cada caso está a mano en el comentario, a propósito:
   si alguien cambia el motor y una prueba se pone roja, tiene ahí la cuenta
   para saber quién de los dos está equivocado.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

const OK = c => c ? 'OK   ' : 'FALLO';
let fails = 0;
function check(label, cond, extra){
  if(!cond) fails++;
  console.log('  ' + OK(cond) + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
}
/* Al céntimo de verdad: media milésima de euro. No 0,01, que dejaría pasar
   justo la clase de diferencia que esta suite existe para cazar. */
const CENT = 0.005;
const near = (a,b,t)=> isFinite(a) && isFinite(b) && Math.abs(a-b) < (t==null?CENT:t);

/* -------------------------------------------------------------------------
   EL ESCENARIO DE LABORATORIO, compartido por el validador y por `pnl()`.

   Producto DEV-1, vendido en España (IVA 21 %).
     PVP con IVA ................................ 60,00 €
     comisión por referencia .................... 15 %  → 9,00 € por unidad
     tarifa de gestión logística (FBA) .......... 4,00 € × 1,015 = 4,06 € /ud
     coste puesto en almacén (4,00 + 1,00) ...... 5,00 € por unidad
     unidades vendidas .......................... 100
     unidades devueltas .........................  10   → tasa 10 %
     todas las devoluciones vuelven VENDIBLES    → revendible = 1

   Ingreso sin IVA por unidad: 60,00 / 1,21 = 49,586776859504134 €
   Tasa de gestión de la devolución: mín(5 ; 20 % de 9,00) = mín(5 ; 1,80) = 1,80 €
   Comisión reintegrada por devolución: 9,00 − 1,80 = 7,20 €

   COSTE DE UNA DEVOLUCIÓN (sin tarifa por procesamiento):
       ingreso devuelto ....................... +49,586776859504134
       menos comisión reintegrada ............. − 7,20
       más procesamiento ...................... + 0,00
       menos coste de producto recuperado ..... − 5,00   (vuelve vendible)
       ------------------------------------------------------------
       coste .................................. = 37,386776859504134 €

   Y la tarifa de gestión logística de 4,00 € NO aparece en esa cuenta: ya se
   cobró en la venta y no vuelve (regla 1). Si alguien la restara aquí, la
   estaría cobrando dos veces.
   ------------------------------------------------------------------------- */
const P     = 60, VAT = 21, REF = 0.15, FBA = 4, COGS = 4, FREIGHT = 1;
const UNITS = 100, RET = 10;
const FUEL_PCT = 1.015;                      // recargo de combustible sobre logística
const NETREV   = P/(1+VAT/100);              // 49.586776859504134
const REFERRAL = P*REF;                      // 9
const LANDED   = COGS+FREIGHT;               // 5
const TASA     = Math.min(5, 0.20*REFERRAL); // 1.8
const DEVCOSTE = NETREV - (REFERRAL-TASA) - LANDED;   // 37.386776859504134

/* Los inputs del validador que reproducen ese escenario. Todo lo que el
   validador sabe calcular y `pnl()` no (almacenaje, bajo inventario, EPR,
   gestoría, publicidad) va a cero: lo que se compara es la mecánica, no el
   catálogo de costes de cada pantalla. */
const INPUTS = (extra) => Object.assign({
  price:P, vat:VAT, cogs:COGS, freight:FREIGHT, referralPct:REF,
  /* `fuel:true` no es un detalle: `pnl()` aplica SIEMPRE el recargo de
     combustible (FUEL = 1,015) a la tarifa FBA que estima, así que el
     validador tiene que aplicarlo también o los dos lados no están costeando
     la misma unidad. Sin esto la prueba salía roja por 0,06 €/ud —
     4,00 × 1,015 − 4,00 = 0,06— que es exactamente el recargo, y es un buen
     ejemplo de por qué esta comparación merece existir: una diferencia de seis
     céntimos por unidad son 6 € en 100 unidades y nadie la ve a ojo. */
  fbaBase:FBA, fuel:true,
  ppcMode:'eur', ppcPct:0, ppcEur:0,
  returnRate:RET/UNITS, unsellable:0,          // 0 % no revendible = todo vuelve vendible
  retProcMode:'none', retProcEur:0,
  litres:0, stockMonths:0, storageRate:0, lowInvEur:0,
  eprEur:0, vatAnnual:0,
  monthly:UNITS, units:UNITS
}, extra||{});

/* La misma realidad, pero como la ve `pnl()`: un informe de pedidos y un
   informe de devoluciones. Las fechas se ponen a hoy para que caigan dentro
   del periodo por defecto (30 días) sin depender del calendario. */
const FIXTURE = `
  DB = blankDB();
  DB.settings.cash.ppcDaily = 0;      // sin publicidad: la cuenta la tiene y el validador aqui no
  DB.expenses = [];                   // sin gastos fijos
  DB.products = [{id:'d1', sku:'DEV-1', name:'Producto de devoluciones', cogs:${COGS},
                  freight:${FREIGHT}, fba:${FBA}, referral:${REF*100}, price:${P}, channel:'FBA'}];
  const hoy = new Date(); const iso10 = d => d.toISOString().slice(0,10);
  const dia = iso10(new Date(hoy.getTime() - 3*86400000));
  DB.imports.orders = {count:1, file:'lab', rows:[{
    amazonorderid:'DEV-ORD-1', purchasedate:dia+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'DEV-1', asin:'B0DEV',
    itemstatus:'Shipped', quantity:'${UNITS}',
    itemprice:String(${P}*${UNITS}), itemtax:String(${P}*${UNITS}*${VAT}/(100+${VAT})),
    shipcountry:'ES', currency:'EUR'}]};
  DB.imports.returns = {count:1, file:'lab', rows:[{
    returndate:dia+'T12:00:00+00:00', 'order-id':'DEV-ORD-1', sku:'DEV-1',
    quantity:'${RET}', detaileddisposition:'SELLABLE'}]};
  periodDays = 30; countryFilter = 'ALL';
`;
const js = body => '(()=>{' + FIXTURE + body + '})()';

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000},
                                        timezoneId:'Europe/Madrid', locale:'es-ES'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_CONNECTION')<0 && t.indexOf('ERR_CERT')<0
       && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());

  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);

  /* =====================================================================
     DEV-A · LA MECÁNICA EXISTE, VIVE EN UN SITIO Y HACE LA CUENTA DE AMAZON
     ===================================================================== */
  console.log('\n=== DEV-A · LA MECÁNICA, CONTRA LA ARITMÉTICA A MANO ===');
  const a = await page.evaluate(()=>({
    hayFuncion: typeof costeDevolucion === 'function',
    hayTasa: typeof tasaGestionDevolucion === 'function',
    reglas: (typeof DEV_REGLAS!=='undefined' ? DEV_REGLAS : []).map(r=>r.id),
    tope: typeof DEV_TASA_TOPE!=='undefined' ? DEV_TASA_TOPE : null,
    pct : typeof DEV_TASA_PCT !=='undefined' ? DEV_TASA_PCT  : null
  }));
  check('`costeDevolucion()` existe y es la única mecánica', a.hayFuncion);
  check('las cuatro reglas están declaradas en el módulo',
    a.reglas.join(',')==='logistica,tasa,procesamiento,revendible', a.reglas.join(', '));
  check('el tope y el porcentaje son 5 € y 20 %', a.tope===5 && a.pct===0.20,
    a.tope+' € · '+(a.pct*100)+' %');

  /* El ejemplo que publica la propia Amazon en https://sell.amazon.es/precios
     (consultado el 17-sep-2026): reembolso del precio total de venta de 10 €
     en una categoría con tarifa por referencia del 15 % → tarifa de gestión de
     reembolso de 0,30 €.
        comisión = 10 × 15 % = 1,50 €
        20 % de 1,50 = 0,30 €;  mín(5 ; 0,30) = 0,30 €                       */
  const ejemplo = await page.evaluate(()=>tasaGestionDevolucion(10*0.15));
  check('reproduce el ejemplo publicado por Amazon (10 € al 15 % → 0,30 €)',
    near(ejemplo, 0.30), ejemplo.toFixed(4)+' €');

  /* REGLA 2 · el tope de 5 € muerde a partir de una comisión de 25 €.
        comisión 20 € → 20 % = 4,00 € → cobra 4,00 (el porcentaje)
        comisión 25 € → 20 % = 5,00 € → justo en el filo
        comisión 90 € → 20 % = 18,00 € → cobra 5,00 (el tope)                */
  const tope = await page.evaluate(()=>[20,25,90,0,-3].map(c=>tasaGestionDevolucion(c)));
  check('comisión 20 € → 4,00 € (manda el 20 %)', near(tope[0],4), tope[0]);
  check('comisión 25 € → 5,00 € (el filo exacto)', near(tope[1],5), tope[1]);
  check('comisión 90 € → 5,00 € (manda el tope)',  near(tope[2],5), tope[2]);
  check('comisión 0 € → 0,00 €',                   near(tope[3],0), tope[3]);
  check('una comisión negativa no genera una tasa negativa', near(tope[4],0), tope[4]);

  /* Las cuatro reglas, una a una, sobre el escenario de laboratorio. */
  const m = await page.evaluate(([nr,ref,fba,landed])=>{
    const base = {ingresoNeto:nr, comision:ref, logistica:fba, procesamiento:0,
                  costeProducto:landed, revendible:1};
    return {
      vendible   : costeDevolucion(base),
      noVendible : costeDevolucion(Object.assign({},base,{revendible:0})),
      mitad      : costeDevolucion(Object.assign({},base,{revendible:0.5})),
      conProceso : costeDevolucion(Object.assign({},base,{procesamiento:2})),
      sinLogistica: costeDevolucion(Object.assign({},base,{logistica:0})),
      sinDato    : costeDevolucion({ingresoNeto:nr, comision:ref, costeProducto:landed})
    };
  }, [NETREV, REFERRAL, FBA, LANDED]);

  check('REGLA 2 · la tasa de gestión es 1,80 € (20 % de 9,00 €)',
    near(m.vendible.tasaGestion, 1.80), m.vendible.tasaGestion);
  check('coste de la devolución = 37,39 € (cuenta a mano arriba)',
    near(m.vendible.coste, DEVCOSTE), m.vendible.coste.toFixed(6)+' € vs '+DEVCOSTE.toFixed(6));
  /* REGLA 1 · quitar la tarifa de logística del dato NO cambia el coste: es
     que no entra en la suma. Si alguien la restara, este caso se pondría rojo
     con la diferencia exacta de 4,00 €. */
  check('REGLA 1 · la tarifa de logística no se resta (quitarla no mueve el coste)',
    near(m.sinLogistica.coste, m.vendible.coste),
    'con 4 € de FBA: '+m.vendible.coste.toFixed(4)+' · con 0 €: '+m.sinLogistica.coste.toFixed(4));
  check('REGLA 1 · pero se declara, para poder enseñarla',
    near(m.vendible.logisticaNoDevuelta, FBA), m.vendible.logisticaNoDevuelta);
  void FUEL_PCT;
  /* REGLA 4 · no revendible = 5,00 € más de coste, que es el coste de producto
     entero: 37,386776859504134 + 5 = 42,386776859504134 €                    */
  check('REGLA 4 · si no vuelve vendible, el coste sube exactamente 5,00 €',
    near(m.noVendible.coste - m.vendible.coste, LANDED),
    m.noVendible.coste.toFixed(4)+' − '+m.vendible.coste.toFixed(4));
  check('REGLA 4 · medio revendible recupera la mitad del coste (2,50 €)',
    near(m.mitad.costeRecuperado, 2.50), m.mitad.costeRecuperado);
  check('REGLA 4 · sin dato de estado, NO se recupera nada (supuesto prudente)',
    near(m.sinDato.costeRecuperado, 0) && near(m.sinDato.coste, m.noVendible.coste),
    'recuperado '+m.sinDato.costeRecuperado);
  /* REGLA 3 · el procesamiento suma euro a euro. */
  check('REGLA 3 · 2,00 € de procesamiento suman 2,00 € al coste',
    near(m.conProceso.coste - m.vendible.coste, 2),
    m.conProceso.coste.toFixed(4)+' − '+m.vendible.coste.toFixed(4));

  /* =====================================================================
     DEV-B · EL VALIDADOR USA ESA MECÁNICA, NO UNA COPIA SUYA
     ===================================================================== */
  console.log('\n=== DEV-B · EL VALIDADOR NO TIENE MECÁNICA PROPIA ===');
  const b = await page.evaluate(inp=>{
    const e   = unitEconomics(inp);
    const e0  = unitEconomics(Object.assign({}, inp, {returnRate:0}));
    const d   = costeDevolucion({ingresoNeto:e.netRev, comision:e.referral, logistica:e.fba,
                                 procesamiento:e.retProc, costeProducto:e.landed,
                                 revendible:1-inp.unsellable});
    return {profit:e.profit, profit0:e0.profit, r:inp.returnRate, dev:d.coste,
            devDelMotor:e.devCoste, refundAdmin:e.refundAdmin,
            /* la cascada, que es lo que se le enseña al usuario */
            revenue:e.revenue, referralCost:e.referralCost,
            returnCost:e.returnCost, productCost:e.productCost};
  }, INPUTS());

  /* LA IDENTIDAD QUE LO ATA TODO:
        beneficio con devoluciones = beneficio sin devoluciones − r × coste(1 devolución)
     Si alguien vuelve a escribir la mecánica dentro de `unitEconomics()`, esta
     línea se rompe y dice por cuánto. */
  check('beneficio = beneficio sin devoluciones − tasa × coste de una devolución',
    near(b.profit, b.profit0 - b.r*b.dev),
    b.profit.toFixed(6)+' vs '+(b.profit0 - b.r*b.dev).toFixed(6));
  check('el motor expone el mismo coste de devolución que la mecánica',
    near(b.devDelMotor, b.dev), b.devDelMotor.toFixed(6));
  check('el motor toma la tasa de gestión de la mecánica (1,80 €)',
    near(b.refundAdmin, TASA), b.refundAdmin);
  /* La cascada tiene que cuadrar con la mecánica línea a línea, porque es lo
     que se lee en pantalla:
        ingreso retenido = 49,586776859504134 − 0,10 × 49,586776859504134 = 44,62809917355372
        comisión neta    = 9,00 − 0,10 × 7,20 = 8,28
        coste de producto= 5,00 − 0,10 × 5,00 = 4,50                        */
  check('cascada · ingreso retenido = 44,63 €', near(b.revenue, 44.62809917355372), b.revenue.toFixed(6));
  check('cascada · comisión neta = 8,28 €',     near(b.referralCost, 8.28), b.referralCost.toFixed(6));
  check('cascada · coste de producto = 4,50 €', near(b.productCost, 4.50), b.productCost.toFixed(6));
  check('cascada · procesamiento = 0,00 € (categoría sin esa tarifa)',
    near(b.returnCost, 0), b.returnCost);

  /* =====================================================================
     DEV-C · LA PRUEBA DE PROPIEDAD
     El mismo producto y la misma tasa de devolución, en las dos pantallas.
     ===================================================================== */
  console.log('\n=== DEV-C · VALIDADOR Y CUENTA DE RESULTADOS, AL CÉNTIMO ===');
  const c = await page.evaluate(js(`
    const Pn = pnl();
    return {
      units:Pn.units, grossInc:Pn.grossInc, net:Pn.net, tax:Pn.tax,
      referral:Pn.referral, fba:Pn.fba, ship:Pn.ship, cogs:Pn.cogs,
      storage:Pn.storage, otherFee:Pn.otherFee, ppc:Pn.ppc, fixed:Pn.fixed,
      reimb:Pn.reimb, vatShortfall:Pn.vatShortfall,
      returnsCost:Pn.returnsCost, retIngreso:Pn.retIngreso,
      retComision:Pn.retComision, retCoste:Pn.retCoste,
      retImputadas:Pn.retImputadas, retDescartadas:Pn.retDescartadas,
      profit:Pn.profit
    };
  `));

  /* Primero: el escenario es limpio de verdad. Si una de estas líneas dejara
     de ser cero, la comparación de abajo pasaría por casualidad y esta suite
     estaría mintiendo. */
  console.log('  — qué incluye cada lado —');
  check('P&L · publicidad = 0 (el validador aquí tampoco la tiene)', near(c.ppc,0), c.ppc);
  check('P&L · gastos fijos = 0',        near(c.fixed,0), c.fixed);
  check('P&L · almacenaje = 0',          near(c.storage,0), c.storage);
  check('P&L · otras tarifas = 0',       near(c.otherFee,0), c.otherFee);
  check('P&L · envío FBM = 0 (el producto es FBA)', near(c.ship,0), c.ship);
  check('P&L · reembolsos de Amazon = 0', near(c.reimb,0), c.reimb);
  /* La línea de IVA no repercutido que trajo la PR #4. El validador NO la
     modela: no sabe a qué tipo liquidó Amazon cada venta, porque eso sale del
     informe fiscal. En este escenario no hay informe fiscal, así que vale 0 y
     los dos lados incluyen lo mismo. Si algún día dejara de valer 0 aquí, esta
     comprobación se pone roja y avisa de que la comparación ya no es limpia. */
  check('P&L · IVA no repercutido = 0 (el validador no modela esa línea)',
    near(c.vatShortfall,0), c.vatShortfall);
  check('P&L · las 10 devoluciones se imputan, ninguna se descarta',
    near(c.retImputadas,RET) && near(c.retDescartadas,0),
    c.retImputadas+' imputadas · '+c.retDescartadas+' descartadas');
  check('P&L · 100 unidades vendidas', c.units===UNITS, c.units);

  /* Segundo: `pnl()` reproduce la mecánica compartida, componente a componente.
        ingreso devuelto   10 × 49,586776859504134 = 495,86776859504134
        comisión reintegr. 10 × 7,20              =  72,00
        coste recuperado   10 × 5,00              =  50,00   (vuelven vendibles)
        coste total        495,86776859504134 − 72 − 50 = 373,86776859504134    */
  const espIngreso  = RET*NETREV;
  const espComision = RET*(REFERRAL-TASA);
  const espCoste    = RET*LANDED;
  check('P&L · ingreso devuelto = 495,87 € (10 × 49,586776…)',
    near(c.retIngreso, espIngreso), c.retIngreso.toFixed(4));
  check('P&L · comisión reintegrada = 72,00 € (10 × 7,20) → misma regla 2',
    near(c.retComision, espComision), c.retComision.toFixed(4));
  check('P&L · coste recuperado = 50,00 € (10 × 5,00) → misma regla 4',
    near(c.retCoste, espCoste), c.retCoste.toFixed(4));

  /* Tercero: LA PROPIEDAD. Con la categoría sin tarifa por procesamiento —que
     es lo único que `pnl()` no sabe cobrar todavía— el beneficio por unidad de
     las dos pantallas tiene que ser EL MISMO NÚMERO.

     Lado validador: ingreso sin IVA − comisión − FBA − coste de producto,
                     menos 10 % × coste de una devolución.
     Lado P&L:       (ingreso sin IVA − comisión − FBA − coste − devoluciones)
                     entre 100 unidades.
     Incluyen exactamente lo mismo, porque las ocho líneas de arriba son cero. */
  const validador = await page.evaluate(inp=>unitEconomics(inp).profit, INPUTS());
  const pnlUnidad = c.profit / c.units;
  check('MISMO PRODUCTO, MISMA TASA → MISMO BENEFICIO POR UNIDAD, AL CÉNTIMO',
    near(validador, pnlUnidad),
    'validador '+validador.toFixed(6)+' €/ud · P&L '+pnlUnidad.toFixed(6)+' €/ud · '+
    'diferencia '+Math.abs(validador-pnlUnidad).toFixed(8)+' €');

  /* Y el margen, que es el número con el que se decide. Aquí hay que DECIR qué
     incluye cada lado, porque los dos porcentajes se calculan sobre bases
     distintas y confundirlas sería el mismo error en otra forma:

       · el validador divide entre el ingreso RETENIDO (ya sin las ventas que
         se devolvieron): 49,586776859504134 × 90 % = 44,628099173553720 €/ud;
       · `pnl()` divide entre el ingreso NETO del periodo, que incluye las
         ventas devueltas, porque la devolución se le resta luego como coste:
         49,586776859504134 €/ud.

     El numerador es el mismo euro; el denominador no. Por eso se comprueban
     LAS DOS COSAS: que sobre la misma base los porcentajes coinciden al
     céntimo, y que la diferencia entre las dos bases es exactamente el ingreso
     devuelto — ni un euro más. */
  const margenVal = await page.evaluate(inp=>unitEconomics(inp).marginNet, INPUTS());
  const baseRetenida = c.net - c.retIngreso;
  const margenPnlComparable = baseRetenida>0 ? c.profit/baseRetenida*100 : null;
  const margenPnlCrudo = c.net>0 ? c.profit/c.net*100 : null;
  check('base del validador = base de `pnl()` menos el ingreso devuelto',
    near(baseRetenida/c.units, NETREV*(1-RET/UNITS)),
    (baseRetenida/c.units).toFixed(6)+' €/ud vs '+(NETREV*(1-RET/UNITS)).toFixed(6)+' €/ud');
  check('MISMO MARGEN NETO SOBRE LA MISMA BASE, AL CÉNTIMO',
    near(margenVal, margenPnlComparable, 0.005),
    'validador '+margenVal.toFixed(4)+' % · P&L '+margenPnlComparable.toFixed(4)+' %');
  check('y la diferencia con el margen que pinta Rentabilidad está explicada',
    margenPnlCrudo < margenVal,
    'sobre ingreso retenido '+margenVal.toFixed(2)+' % · sobre ingreso del periodo '+
    margenPnlCrudo.toFixed(2)+' % · misma cuenta, denominador distinto');

  /* =====================================================================
     DEV-D · LA ÚNICA DIFERENCIA QUE QUEDA, MEDIDA Y NOMBRADA
     ===================================================================== */
  console.log('\n=== DEV-D · LA COSTURA PENDIENTE DEL CARRIL 5, CUANTIFICADA ===');
  /* Si al validador se le pone la tarifa por procesamiento de devoluciones
     (categorías de alta tasa de devolución, y ropa/calzado), las dos pantallas
     dejan de coincidir — y la diferencia no es ruido: es EXACTAMENTE esa
     tarifa por las devoluciones habidas.

        3,44 € por devolución × 10 devoluciones = 34,40 € en el periodo
        34,40 € / 100 unidades vendidas = 0,344 € por unidad                 */
  const PROC = 3.44;
  const conProc = await page.evaluate(inp=>unitEconomics(inp).profit,
                                      INPUTS({retProcMode:'manual', retProcEur:PROC}));
  const hueco = pnlUnidad - conProc;
  check('la diferencia es exactamente la tarifa por procesamiento (0,344 €/ud)',
    near(hueco, PROC*RET/UNITS),
    'hueco '+hueco.toFixed(6)+' €/ud · esperado '+(PROC*RET/UNITS).toFixed(6)+' €/ud');
  check('y nada más: sin esa tarifa el hueco es cero',
    near(pnlUnidad - validador, 0), (pnlUnidad-validador).toFixed(8)+' €/ud');

  /* La costura tiene que estar ESCRITA, no solo pensada. Si alguien borra el
     comentario, esto se pone rojo: la costura es el entregable. */
  const costura = await page.evaluate(()=>{
    const t = document.documentElement.innerHTML;
    return {marca: /COSTURA → carril 5/.test(t),
            nombra: /costeDevolucion\(\)/.test(t) && /pnl\(\)/.test(t)};
  });
  check('la costura para el carril 5 está escrita en el código', costura.marca);
  check('y dice qué función tiene que llamar y desde dónde', costura.nombra);

  /* =====================================================================
     DEV-E · EL UMBRAL DE PRECIO NO PUEDE TENER SU PROPIA MECÁNICA
     ===================================================================== */
  console.log('\n=== DEV-E · PRECIO MÍNIMO VIABLE, CON EL TOPE DE 5 € DENTRO ===');
  /* Producto caro: PVP 400 €, coste puesto en almacén 200 €, comisión 15 %,
     30 % de devoluciones y nada revendible. Al precio de equilibrio la
     comisión ronda los 66 €, así que el 20 % serían 13,27 € y Amazon cobra 5.
     La fórmula cerrada que había antes ignoraba el tope y daba 447,78 € cuando
     el equilibrio real del propio motor es 442,44 €: declaraba como mínimo un
     precio al que el motor ya daba +2,53 €/ud de beneficio. */
  const caro = {price:400, vat:21, cogs:180, freight:20, referralPct:0.15, fbaBase:8, fuel:false,
    ppcMode:'eur', ppcPct:0, ppcEur:0, returnRate:0.30, unsellable:1,
    retProcMode:'none', retProcEur:0, litres:0, stockMonths:0, storageRate:0,
    lowInvEur:0, eprEur:0, vatAnnual:0, monthly:100, units:0};
  const e = await page.evaluate(i=>({
    bp: breakevenPrice(i),
    beneficioAhi: unitEconomics(i,{price:breakevenPrice(i)}).profit,
    unCentimoMenos: unitEconomics(i,{price:breakevenPrice(i)-0.01}).profit,
    bl: breakevenLanded(i),
    beneficioConEseCoste: unitEconomics(Object.assign({},i,{cogs:breakevenLanded(i),freight:0})).profit
  }), caro);
  check('en el «precio mínimo viable» el beneficio es exactamente cero',
    near(e.beneficioAhi, 0, 1e-6), e.beneficioAhi.toExponential(2)+' € a '+e.bp.toFixed(2)+' €');
  check('un céntimo por debajo ya se pierde dinero (es un mínimo de verdad)',
    e.unCentimoMenos < 0, e.unCentimoMenos.toFixed(6)+' €/ud');
  check('el umbral es 442,44 €, no los 447,78 € de la fórmula sin tope',
    near(e.bp, 442.4382581377, 0.01), e.bp.toFixed(4)+' €');
  check('en el «coste de compra máximo» el beneficio también es cero',
    near(e.beneficioConEseCoste, 0, 1e-6),
    e.beneficioConEseCoste.toExponential(2)+' € con '+e.bl.toFixed(2)+' € de coste');

  /* =====================================================================
     DEV-F · EL COMPARADOR PANEU NO SUMA DIVISAS DISTINTAS
     ===================================================================== */
  console.log('\n=== DEV-F · PANEU · ZLOTYS Y CORONAS NO SON EUROS ===');
  await page.evaluate(()=>go('paises'));
  await page.waitForTimeout(400);
  const f = await page.evaluate(()=>{
    countryState = {};                 // estado limpio
    renderCountryTable();
    Object.keys(countryState).forEach(k=>{ countryState[k].on = true; });   // los nueve
    /* Para que el fallo del ranking sea visible hace falta un mercado fuera
       del euro cuyo NÚMERO EN BRUTO gane a todos: Suecia con cinco veces el
       volumen. En coronas esa cifra no es comparable con los euros de los
       demás, así que coronar a Suecia sería exactamente el fallo de antes. */
    countryState.SE.units = countryState.SE.units * 5;
    updateCountryCells();
    const rows = countryRows();
    const on = rows.filter(r=>r.s.on);
    const euros  = on.filter(r=>r.cur==='EUR');
    const fuera  = on.filter(r=>r.cur!=='EUR');
    const txt = document.getElementById('countryVerdict').textContent;
    const pintado = parseFloat((txt.match(/activos:\s*€([\d.]+)/)||[])[1]);
    return {
      sumaEuros : +euros.reduce((a,r)=>a+r.annual,0).toFixed(2),
      sumaTodo  : +on.reduce((a,r)=>a+r.annual,0).toFixed(2),
      pintado,
      fuera     : fuera.map(r=>r.c.code),
      mejorPintado: (txt.match(/el que más aporta es (.+?) con /)||[])[1],
      mejorDeTodos: on.slice().sort((a,b)=>b.annual-a.annual)[0].c.code,
      mejorEnEuros: euros.slice().sort((a,b)=>b.annual-a.annual)[0].c.name,
      declaraDivisas: /no cobran? en euros/.test(txt),
      nombraPLN: /PLN/.test(txt) && /SEK/.test(txt),
      /* la celda de Polonia no puede llevar un € delante */
      celdaPL: document.getElementById('ca-PL').textContent,
      celdaDE: document.getElementById('ca-DE').textContent
    };
  });
  check('el total anunciado suma SOLO los mercados en euros',
    near(f.pintado, f.sumaEuros, 0.02),
    'pintado €'+f.pintado+' · euros €'+f.sumaEuros+' · sumándolo todo saldría €'+f.sumaTodo);
  check('y sumarlo todo daría un número distinto (el fallo que había)',
    Math.abs(f.sumaTodo - f.sumaEuros) > 1,
    'diferencia €'+(f.sumaTodo-f.sumaEuros).toFixed(2)+' que no son euros');
  check('los mercados fuera del euro son PL y SE, y se declaran',
    f.fuera.join(',')==='PL,SE' && f.declaraDivisas && f.nombraPLN, f.fuera.join(', '));
  check('en bruto ganaría Suecia, que cobra en coronas',
    f.mejorDeTodos==='SE', 'el mayor número sin mirar la divisa es '+f.mejorDeTodos);
  check('pero el «que más aporta» se corona solo entre los que cobran en euros',
    f.mejorPintado===f.mejorEnEuros && f.mejorPintado!=='Suecia',
    'pintado: '+f.mejorPintado+' · mejor en euros: '+f.mejorEnEuros);
  check('la celda de Polonia lleva zlotys, no €', /zł/.test(f.celdaPL) && !/€/.test(f.celdaPL), f.celdaPL);
  check('la celda de Alemania sigue llevando €', /€/.test(f.celdaDE), f.celdaDE);

  /* =====================================================================
     DEV-G · LOS AVISOS · productos que salen plausibles y equivocados
     ===================================================================== */
  console.log('\n=== DEV-G · EL MARGEN PLAUSIBLE Y FALSO ===');
  await page.evaluate(()=>go('calculadora'));
  await page.waitForTimeout(300);
  const g = await page.evaluate(()=>{
    const v = id => document.getElementById(id);
    const salida = {};
    /* Sin avisos con los valores por defecto. */
    v('country').value='ES'; onCountryChange();
    v('monthly').value='200'; v('vatAnnual').value='1500'; calc();
    salida.limpio = document.querySelectorAll('#calcAvisos [data-aviso]').length;
    salida.margenLimpio = unitEconomics(inputs()).marginNet;

    /* El agujero: 0 ventas al mes evapora la gestoría de 1.500 €/año. */
    v('monthly').value='0'; calc();
    salida.conCero = [...document.querySelectorAll('#calcAvisos [data-aviso]')]
                       .map(x=>x.getAttribute('data-aviso'));
    salida.margenCero = unitEconomics(inputs()).marginNet;
    salida.vatUnitCero = unitEconomics(inputs()).vatUnit;
    v('monthly').value='200'; calc();

    /* Mercado que no cobra en euros. */
    v('country').value='PL'; onCountryChange();
    salida.conPL = [...document.querySelectorAll('#calcAvisos [data-aviso]')]
                     .map(x=>x.getAttribute('data-aviso'));
    salida.unidadPL = (document.querySelector('#view-calculadora [data-money]')||{}).textContent;
    salida.profitPL = document.getElementById('mProfit').textContent;
    v('country').value='ES'; onCountryChange();
    salida.unidadES = (document.querySelector('#view-calculadora [data-money]')||{}).textContent;
    return salida;
  });
  check('con los valores por defecto no hay ningún aviso', g.limpio===0, g.limpio+' avisos');
  check('con 0 ventas/mes la gestoría de 1.500 €/año se evapora del cálculo',
    near(g.vatUnitCero,0) && g.margenCero > g.margenLimpio,
    'margen '+g.margenLimpio.toFixed(2)+' % → '+g.margenCero.toFixed(2)+' % sin el coste fijo');
  check('…y la pantalla lo dice en vez de callárselo',
    g.conCero.indexOf('grave')>=0, g.conCero.join(', ')||'ninguno');
  check('con Polonia seleccionada se avisa de la divisa',
    g.conPL.indexOf('divisa')>=0, g.conPL.join(', ')||'ninguno');
  check('y las unidades de dinero dejan de decir «€»',
    g.unidadPL==='zł' && g.unidadES==='€', 'PL: '+g.unidadPL+' · ES: '+g.unidadES);
  check('el beneficio por unidad se rotula en zlotys, no en €',
    /zł/.test(g.profitPL) && !/€/.test(g.profitPL), g.profitPL);

  /* =====================================================================
     DEV-H · LA PANTALLA · vacía, a medias y llena, sin errores de JS
     ===================================================================== */
  console.log('\n=== DEV-H · LA PANTALLA EN SUS TRES ESTADOS ===');
  await page.reload();
  await page.waitForTimeout(700);
  const vacia = await page.evaluate(()=>{
    go('calculadora');
    DB = blankDB(); renderSaved();
    return {
      lista: document.getElementById('savedList').textContent.trim().slice(0,40),
      veredicto: document.getElementById('vHead').textContent,
      beneficio: document.getElementById('mProfit').textContent,
      avisos: document.querySelectorAll('#calcAvisos [data-aviso]').length
    };
  });
  check('vacía · la lista de guardados explica qué hacer, no se queda en blanco',
    vacia.lista.length>10, JSON.stringify(vacia.lista));
  check('vacía · el veredicto ya da un número con los valores por defecto',
    /€/.test(vacia.beneficio), vacia.beneficio);

  const media = await page.evaluate(()=>{
    /* A medias: precio puesto, coste sin poner. Un coste de 0 € no puede dar
       «válido para escalar» por la vía de que no cuesta nada producirlo, pero
       tampoco puede reventar la pantalla. */
    document.getElementById('cogs').value=''; document.getElementById('freight').value='';
    document.getElementById('units').value=''; document.getElementById('monthly').value='';
    calc();
    const e=unitEconomics(inputs());
    return {roi:document.getElementById('mRoi').textContent,
            payback:document.getElementById('mPayback').textContent,
            cobertura:document.getElementById('mCover').textContent,
            bl:document.getElementById('mBeLanded').textContent,
            roiNum:e.roi, veredicto:document.getElementById('vHead').textContent,
            avisos:[...document.querySelectorAll('#calcAvisos [data-aviso]')].map(x=>x.getAttribute('data-aviso'))};
  });
  check('a medias · sin coste de producto el ROI no inventa un número',
    media.roi==='—' || media.roiNum===0, media.roi);
  check('a medias · sin volumen la cobertura y el payback dicen «—», no «Infinity»',
    media.cobertura==='—' && media.payback==='—',
    'cobertura '+media.cobertura+' · payback '+media.payback);
  check('a medias · y avisa de que la gestoría no se está repartiendo',
    media.avisos.indexOf('grave')>=0, media.avisos.join(', ')||'ninguno');

  const llena = await page.evaluate(()=>{
    loadDemo();
    go('calculadora');
    document.getElementById('cogs').value='4.50'; document.getElementById('freight').value='1.20';
    document.getElementById('units').value='500'; document.getElementById('monthly').value='200';
    calc();
    document.getElementById('saveName').value='Producto de prueba';
    saveProduct();
    const antes=DB.saved.length;
    const id=DB.saved[0].id;
    loadProduct(id);
    const cargado=document.getElementById('price').value;
    delProduct(id);
    return {antes, despues:DB.saved.length, cargado,
            fila:document.getElementById('savedList').textContent.slice(0,60),
            beneficio:document.getElementById('mProfit').textContent,
            filas:document.querySelectorAll('#stressTable tr').length};
  });
  check('llena · guardar añade el producto a la lista', llena.antes===1, llena.antes);
  check('llena · cargarlo devuelve el PVP guardado', llena.cargado==='24.99', llena.cargado);
  check('llena · borrarlo lo quita', llena.despues===0, llena.despues);
  check('llena · el test de estrés tiene sus seis escenarios + cabecera',
    llena.filas===7, llena.filas+' filas');
  check('llena · el beneficio por unidad se sigue pintando', /€/.test(llena.beneficio), llena.beneficio);

  /* El comparador PanEU con datos cargados, que es donde antes salía el total
     inventado. */
  await page.evaluate(()=>go('paises'));
  await page.waitForTimeout(400);
  const paisesLleno = await page.evaluate(()=>({
    filas: document.querySelectorAll('#countryTable tr').length,
    veredicto: document.getElementById('countryVerdict').textContent.length
  }));
  check('llena · el comparador pinta los nueve países + cabecera',
    paisesLleno.filas===10, paisesLleno.filas+' filas');
  check('llena · y el veredicto dice algo', paisesLleno.veredicto>120, paisesLleno.veredicto+' caracteres');

  console.log('\n=== ERRORES DE JAVASCRIPT ===');
  check('ninguna pantalla ha lanzado un error de JS', errors.length===0,
    errors.length ? errors.join(' | ') : 'ninguno');

  console.log('\n' + (fails ? '✗ ' + fails + ' FALLO(S)' : '✓ todo correcto'));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
