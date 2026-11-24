/* ═══════════════════════════════════════════════════════════════════════════
   23 · RECLAMACIONES · dinero que Amazon debe y nadie está mirando

   REGLA DE ESTE FICHERO, POR ENCIMA DE TODO LO DEMÁS: **el hub NUNCA envía
   nada a Amazon.** Aquí se detecta, se estima, se enseña la evidencia y se
   redacta el texto. Presentar la reclamación es un acto humano, en Seller
   Central, y con los ojos puestos en el caso.

   Y LA SEGUNDA REGLA: reclamar un dinero que Amazon no debe cuesta más que no
   reclamar. Una cuenta con reclamaciones infundadas repetidas recibe, por
   escrito en la política, «delayed support», investigación y acción sobre la
   cuenta. Por eso cada detector es CONSERVADOR: cuando falta el dato que
   decidiría, el caso NO se cuenta, y la pantalla dice cuántos se han quedado
   fuera y por qué.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── LAS VENTANAS DE RECLAMACIÓN ────────────────────────────────────────────
   NO ESTÁN ESCRITAS DE MEMORIA. El plan antiguo del proyecto decía «105 y 60
   días»; Amazon cambió estas políticas entre 2024 y 2025 y, además, EL PLAZO
   NO ES EL MISMO EN TODOS LOS MERCADOS. Consultado el 17 de septiembre de 2026
   y RE-VERIFICADO el 3 de octubre de 2026 contra las paginas vivas, una a una.
   Las cuatro siguen diciendo lo mismo; se pegan abajo las frases literales que
   se leyeron ese dia, para que la proxima sesion compare texto con texto y no
   cifra con recuerdo:

     · amazon.es · «Una reclamacion de devolucion del cliente de Logistica de
       Amazon se puede presentar entre 45 y 105 dias despues de la fecha de
       reembolso o reemplazo al cliente.»
     · amazon.es · «...tiene que presentarse en un plazo de 60 dias desde la
       fecha en la que se informo de que el producto se habia extraviado o
       danado.»
     · amazon.es · «Una reclamacion de retirada de productos perdidos en
       transito se puede presentar entre 15 y 75 dias desde la fecha de creacion
       del envio.»
     · amazon.com · «An FBA customer returns claim can be submitted between
       60-120 days after the customer refund or replacement date.»
     · PDF de la politica · «If you don't agree with our valuation of a unit,
       you can file a claim on Contact Us in Seller Central within 60 days after
       we have issued the reimbursement.» Y sigue diciendo «sourcing cost» antes
       del pedido y «minus applicable fees» despues.

   De la ventana de TARIFAS cobradas de mas se volvio a buscar fuente oficial el
   3-10-2026 y NO se encontro ninguna. Sigue sin cifra, a proposito.

   · amazon.es · «Novedades sobre la automatización de reembolsos y los plazos
     para presentar reclamaciones de reembolso», Seller Central España, en vigor
     el 9 de enero de 2025:
       https://sellercentral.amazon.es/seller-forums/discussions/t/8bc6ce8b-d765-411d-942a-fadca01873c2
     «60 días desde la fecha en la que se informó de que el producto se había
     extraviado o dañado» · «entre 45 y 105 días después de la fecha de
     reembolso o reemplazo al cliente» · «entre 15 y 75 días desde la fecha de
     creación del envío» · «60 días desde la fecha de entrega del envío
     devuelto».

   · amazon.com · «Update on Reimbursement Automation and Eligibility Window to
     file reimbursement claims», en vigor el 23 de octubre de 2024:
       https://sellercentral.amazon.com/seller-forums/discussions/t/81c3235d-4c44-47ba-96c5-883cecab3244
     «An FBA customer returns claim can be submitted between 60-120 days after
     the customer refund or replacement date.»
     EL MISMO CONCEPTO, PLAZO DISTINTO: 60–120 en EE. UU., 45–105 en España. El
     hub vende en amazon.es, así que manda el anuncio español; el americano se
     enseña al lado para que nadie mezcle los dos.

   · amazon.com · «Update on reimbursement claim window eligibility on FBA», en
     vigor el 5 de septiembre de 2024:
       https://sellercentral.amazon.com/seller-forums/discussions/t/96a05f4a-537a-49d2-a918-703c47716bc0
     Envíos a Amazon: «no sooner than 15 calendar days from the shipment
     delivery date but no later than 60 calendar days».

   · FBA inventory reimbursement policy · PDF alojado por Amazon:
       https://m.media-amazon.com/images/G/01/rainier/help./Redlined_FBA_Reimbursement_policy_US.pdf
     «If you don't agree with our valuation of a unit, you can file a claim on
     Contact Us in Seller Central within 60 days after we have issued the
     reimbursement.» Y la valoración: antes del pedido se reembolsa el
     **sourcing cost** («your cost to source a product from a manufacturer,
     wholesaler, or reseller… It excludes costs such as shipping, handling,
     customs duties, or other costs»); después del pedido, «the price of that
     order minus applicable fees».

   · TARIFAS DE LOGÍSTICA COBRADAS DE MÁS · NO CONFIRMADA. No he encontrado
     ninguna página oficial de Amazon que fije un plazo para disputar un cobro
     de tarifa FBA incorrecto. Circula «90 días» en blogs de terceros y NO se
     usa aquí: una ventana inventada hace dos daños, presentar fuera de plazo y
     dejar pasar lo que todavía se podía reclamar. La pantalla lo dice.       */
const CLAIM_CONSULTA = '2026-10-03';
const CLAIM_VENTANAS = {
  devolucion:{
    etiqueta:'Devolución de cliente FBA reembolsada y no devuelta',
    min:45, max:105, base:'la fecha del reembolso al cliente', confirmada:true,
    fuente:'Seller Central España · plazos de reclamación de reembolsos, en vigor el 9-ene-2025',
    url:'https://sellercentral.amazon.es/seller-forums/discussions/t/8bc6ce8b-d765-411d-942a-fadca01873c2',
    nota:'En amazon.com el anuncio equivalente (23-oct-2024) dice 60–120 días. Para amazon.es manda el español: 45–105.'
  },
  almacen:{
    etiqueta:'Inventario extraviado o dañado en el centro logístico',
    min:0, max:60, base:'la fecha en que la unidad se marcó como extraviada o dañada', confirmada:true,
    fuente:'Seller Central España · plazos de reclamación de reembolsos, en vigor el 9-ene-2025',
    url:'https://sellercentral.amazon.es/seller-forums/discussions/t/8bc6ce8b-d765-411d-942a-fadca01873c2',
    nota:'Amazon reembolsa de oficio casi todas las pérdidas de almacén desde el 15-ene-2025. Esto busca las que no.'
  },
  valor:{
    etiqueta:'Desacuerdo con el importe de un reembolso ya recibido',
    min:0, max:60, base:'la fecha en que Amazon emitió el reembolso', confirmada:true,
    fuente:'FBA inventory reimbursement policy (PDF alojado por Amazon)',
    url:'https://m.media-amazon.com/images/G/01/rainier/help./Redlined_FBA_Reimbursement_policy_US.pdf',
    nota:'Amazon reconoce el COSTE DE APROVISIONAMIENTO, que excluye transporte, manipulación y aduanas.'
  },
  tarifa:{
    etiqueta:'Tarifa de Logística cobrada de más tras un cambio de tarifa',
    min:null, max:null, base:'la fecha del cambio de tarifa', confirmada:false,
    fuente:'sin fuente oficial localizada el '+CLAIM_CONSULTA,
    url:'',
    nota:'NO CONFIRMADA. Circula «90 días» en blogs de terceros; aquí no se usa una cifra que no he podido verificar en una página de Amazon.'
  }
};

/* Estado de una reclamación respecto de su ventana.
   `dias` son los días transcurridos desde la fecha base. Cuatro estados, y el
   cuarto es el que más importa: si la ventana no está confirmada, el hub NO
   dice que esté abierta ni que esté cerrada. Dice que no lo sabe. */
function claimEstado(ventanaId, fechaBase){
  const V = CLAIM_VENTANAS[ventanaId] || {};
  if(!V.confirmada) return {estado:'sin-confirmar', etiqueta:'plazo no confirmado', dias:null, clase:'warn'};
  const d = fechaBase ? daysBetween(fechaBase, today()) : null;
  if(d === null) return {estado:'sin-fecha', etiqueta:'sin fecha', dias:null, clase:'warn'};
  if(V.min && d < V.min)
    return {estado:'pronto', etiqueta:'aún no: faltan '+(V.min-d)+' d', dias:d, clase:'warn'};
  if(V.max != null && d > V.max)
    return {estado:'caducada', etiqueta:'fuera de plazo ('+d+' d)', dias:d, clase:'neg'};
  const quedan = V.max != null ? V.max - d : null;
  return {estado:'abierta', dias:d, quedan,
          etiqueta:(quedan != null ? 'quedan '+quedan+' d' : 'abierta'), clase:quedan!=null&&quedan<=14?'warn':'pos'};
}

/* ── Utilidades comunes a los cuatro detectores ─────────────────────────── */
function claimCoste(sku){
  const p = findProd(sku);
  if(!p) return {coste:null, flete:0, p:null};
  /* `costNow()` es del carril 2 y vive en 12c-lotes.js: se LEE, no se
     recalcula. Recalcular el coste en un segundo sitio es exactamente como los
     números dejan de cuadrar entre pantallas. */
  const c = (typeof costNow === 'function') ? costNow(p) : null;
  return {coste:(c && isFinite(c) && c > 0) ? c : null, flete:toNum(p.freight), p};
}
/* Pedidos con devolución registrada, por número de pedido y por pedido+SKU. */
function claimDevolucionesRegistradas(){
  const porPedido = {}, porPedidoSku = {};
  let desde = null, hasta = null, n = 0;
  imp('returns').forEach(r=>{
    const oid = String(gv(r,'_oid','orderid','amazonorderid')||'').trim();
    const sku = String(gv(r,'_sku','sku','sellersku')||'').trim().toLowerCase();
    if(oid){ porPedido[oid] = 1; if(sku) porPedidoSku[oid+'|'+sku] = 1; }
    const d = parseDate(gv(r,'_date','returndate','fecha'));
    if(d){ n++; if(!desde || d<desde) desde = d; if(!hasta || d>hasta) hasta = d; }
  });
  return {porPedido, porPedidoSku, desde, hasta, n};
}
/* Compensaciones ya recibidas, de las DOS fuentes que las traen: el informe de
   reembolsos FBA y las filas «Ajuste» del informe de transacciones. Reclamar
   algo que Amazon ya te pagó es la forma más rápida de que dejen de mirarte
   las reclamaciones buenas. */
function claimCompensaciones(){
  const porPedido = {}, porSku = [];
  imp('reimb').forEach(r=>{
    const oid = String(gv(r,'_oid','amazonorderid')||'').trim();
    const sku = String(gv(r,'_sku','sku','sellersku')||'').trim().toLowerCase();
    const f   = parseDate(gv(r,'_date','approvaldate'));
    const imp_ = toNum(gv(r,'_amount','amounttotal'));
    if(oid) porPedido[oid] = 1;
    if(sku) porSku.push({sku, f, importe:imp_, qty:toNum(gv(r,'_qty','quantityreimbursedtotal'))||1,
                         origen:'informe de reembolsos', ref:String(gv(r,'_rid','reimbursementid')||'')});
  });
  if(typeof txRows === 'function') txRows().forEach(r=>{
    if(!/^(ajuste|adjustment)$/i.test(r.tipo)) return;
    if(r.oid) porPedido[r.oid] = 1;
    if(r.sku) porSku.push({sku:r.sku.toLowerCase(), f:r.f, importe:r.otro + r.otras,
                           qty:r.qty||1, origen:'transacciones · '+r.desc, ref:r.pago, desc:r.desc, fila:r});
  });
  return {porPedido, porSku};
}

/* ═══ DETECTOR 1 · DEVOLUCIONES FANTASMA ════════════════════════════════════
   El cliente pidió el reembolso, Amazon se lo dio con tu dinero, y la unidad
   no volvió nunca al almacén ni te la compensaron.

   LAS TRES CONDICIONES, Y LAS TRES A LA VEZ:
     1 · hay un reembolso al cliente en el informe de transacciones;
     2 · el informe de devoluciones FBA no registra esa devolución;
     3 · no hay ninguna compensación para ese pedido.

   REVISIÓN ADVERSARIAL · QUÉ DEJARÍA AL HUB RECLAMAR UN DINERO QUE NO LE DEBEN:
   · Un reembolso FBM. Gestionas tú la logística: Amazon no tiene nada que
     devolver. Se exige que «gestión logística» diga Amazon; si la columna
     viene vacía, el caso se descarta y se cuenta aparte.
   · Un reembolso de hace tres días: el cliente TODAVÍA está dentro del plazo
     para devolver. Por eso la ventana tiene mínimo (45 días en amazon.es), y
     los casos por debajo se marcan «aún no», no «reclamable».
   · El informe de devoluciones no cargado. Sin él, TODO reembolso parecería
     fantasma. Si no está, el detector no devuelve casos: devuelve el aviso.
   · Un reembolso parcial de envío o de promoción, sin devolución de producto:
     se exige que las ventas de producto devueltas sean negativas.            */
function claimDevolucionesFantasma(){
  const out = {casos:[], total:0, avisos:[], descartados:{fbm:0, sinCanal:0, fueraDeCobertura:0, conDevolucion:0, compensados:0}};
  if(typeof txHay !== 'function' || !txHay()){
    out.avisos.push('Falta el informe de transacciones (Pagos › Transacciones). Sin él no hay reembolsos que mirar.');
    return out;
  }
  if(!hasImp('returns')){
    out.avisos.push('Falta el informe de devoluciones de Logística de Amazon. Sin él TODO reembolso parecería una devolución fantasma, '+
                    'así que no se enseña ni un caso: el número saldría enorme y sería falso.');
    return out;
  }
  const dev = claimDevolucionesRegistradas();
  const comp = claimCompensaciones();
  /* HASTA DÓNDE LLEGA EL INFORME DE DEVOLUCIONES, QUE NO ES HASTA DÓNDE LLEGAN
     LOS REEMBOLSOS. Esto salió de cargar los ficheros REALES el 17-09-2026: el
     informe de transacciones traía 2 años y 8 meses con 526 reembolsos, y el
     informe de devoluciones descargado cubría unos pocos días. El detector daba
     459 «devoluciones fantasma»: no eran fantasmas, era que el informe de
     devoluciones no llegaba hasta ahí. Reclamar eso es reclamar un dinero que
     Amazon no debe, cientos de veces, con la cuenta puesta en el disparadero.

     La regla: solo se evalúa un reembolso si cae DENTRO de lo que el informe de
     devoluciones cubre, y además con 45 días de margen por el final —el mínimo
     de la propia ventana de Amazon, el tiempo que el cliente tiene para
     devolver—. Fuera de ahí el hub NO SABE, y lo que no sabe no lo reclama: lo
     cuenta aparte y lo dice en pantalla. */
  const margen = CLAIM_VENTANAS.devolucion.min || 45;
  const coberturaHasta = dev.hasta ? addDays(dev.hasta, -margen) : null;
  if(!dev.desde || !coberturaHasta || coberturaHasta < dev.desde){
    out.avisos.push('El informe de devoluciones cubre del '+(dev.desde?iso(dev.desde):'—')+' al '+
      (dev.hasta?iso(dev.hasta):'—')+', menos de los '+margen+' días que el cliente tiene para devolver. '+
      'No se puede saber todavía si alguna de esas devoluciones falta: descarga el informe con un rango más amplio.');
    return out;
  }
  out.avisos.push('El informe de devoluciones cubre del '+iso(dev.desde)+' al '+iso(dev.hasta)+'. '+
    'Solo se evalúan los reembolsos anteriores al '+iso(coberturaHasta)+' ('+margen+' días de margen para que la '+
    'devolución llegue y se registre). Fuera de ese intervalo el hub no sabe si la unidad volvió, y no lo reclama.');
  txRows().forEach(r=>{
    if(!/^(reembolso|refund)$/i.test(r.tipo)) return;
    if(r.ventas >= 0) return;                       // no hay producto devuelto
    const canal = claimCanal(r);
    if(!canal){ out.descartados.sinCanal++; return; }
    if(canal !== 'fba'){ out.descartados.fbm++; return; }
    if(!r.oid){ out.descartados.sinCanal++; return; }
    if(r.f < dev.desde || r.f > coberturaHasta){ out.descartados.fueraDeCobertura++; return; }
    if(dev.porPedido[r.oid] || (r.sku && dev.porPedidoSku[r.oid+'|'+r.sku.toLowerCase()])){
      out.descartados.conDevolucion++; return;
    }
    if(comp.porPedido[r.oid]){ out.descartados.compensados++; return; }
    /* IMPORTE · «the price of that order minus applicable fees», que es lo que
       dice la política. En el informe: ventas de productos devueltas (que
       vienen NEGATIVAS y sin IVA) menos la comisión que Amazon ya te reintegró
       (que viene POSITIVA). Ejemplo real de forma —cifras sintéticas—:
       ventas −11,45 € y comisión +1,95 € → 11,45 − 1,95 = 9,50 €.
       El IVA se deja fuera a propósito: lo recuperas por la declaración, no
       por una reclamación, y meterlo infla el caso. */
    const importe = Math.max(0, (-r.ventas) - Math.max(0, r.com));
    if(importe <= 0) return;
    const est = claimEstado('devolucion', r.f);
    out.casos.push({tipo:'devolucion', fecha:r.f, oid:r.oid, sku:r.sku, desc:r.desc,
                    unidades:r.qty||1, importe, estado:est, pais:r.pais,
                    evidencia:[{fuente:'Transacciones', fecha:r.k, tipo:r.tipo, oid:r.oid, sku:r.sku,
                                detalle:'ventas de productos '+fmt(r.ventas)+' · tarifas de venta '+fmt(r.com)+
                                        ' · total '+fmt(r.total)+' · pago '+r.pago}]});
    if(est.estado === 'abierta') out.total += importe;
  });
  out.casos.sort((a,b)=> b.importe - a.importe);
  return out;
}
/* «Amazon» / «Vendedor» en la columna de gestión logística, y sus equivalentes
   en inglés. Devuelve 'fba', 'fbm' o '' cuando el informe no lo dice. */
function claimCanal(r){
  const v = fold(String((r && r.fulfil) || ''));
  if(!v) return '';
  if(/amazon|afn/.test(v)) return 'fba';
  if(/vendedor|seller|merchant|mfn/.test(v)) return 'fbm';
  return '';
}

/* ═══ DETECTOR 2 · REEMBOLSO INFERIOR AL COSTE REAL ═════════════════════════
   Amazon te compensó, pero por menos de lo que te cuesta el producto.

   LA POLÍTICA VIGENTE (marzo de 2025) valora el reembolso por el COSTE DE
   APROVISIONAMIENTO, no por el precio de venta, y excluye expresamente
   transporte, manipulación y aduanas. `costNow()` es el coste PUESTO, flete
   incluido. Por eso cada caso enseña las dos cifras: la diferencia contra el
   coste puesto y cuánto de esa diferencia es flete que Amazon no reconoce.
   Reclamar el flete es reclamar un dinero que no te deben.                   */
function claimReembolsoInsuficiente(){
  const out = {casos:[], total:0, avisos:[], descartados:{sinCoste:0, suficientes:0}};
  const comp = claimCompensaciones();
  if(!comp.porSku.length){
    out.avisos.push('No hay compensaciones que revisar: hace falta el informe de reembolsos de Logística de Amazon '+
                    'o el informe de transacciones (las filas «Ajuste»).');
    return out;
  }
  comp.porSku.forEach(c=>{
    if(!(c.importe > 0)) return;
    const C = claimCoste(c.sku);
    if(!C.coste){ out.descartados.sinCoste++; return; }
    const uds = c.qty > 0 ? c.qty : 1;
    const porUd = c.importe / uds;
    if(porUd >= C.coste - 0.005){ out.descartados.suficientes++; return; }
    const dif = (C.coste - porUd) * uds;
    const fleteNoAdmisible = Math.min(dif, C.flete * uds);
    const est = claimEstado('valor', c.f);
    out.casos.push({tipo:'valor', fecha:c.f, sku:c.sku, unidades:uds,
                    compensado:c.importe, costeUd:C.coste, compensadoUd:porUd,
                    importe:dif, fleteNoAdmisible, estado:est, ref:c.ref, origen:c.origen,
                    evidencia:[{fuente:c.origen, fecha:c.f?iso(c.f):'—', tipo:'compensación', sku:c.sku,
                                detalle:'compensado '+fmt(c.importe)+' por '+uds+' ud ('+fmt(porUd)+'/ud) '+
                                        'frente a un coste puesto de '+fmt(C.coste)+'/ud · referencia '+(c.ref||'—')}]});
    if(est.estado === 'abierta') out.total += dif;
  });
  out.casos.sort((a,b)=> b.importe - a.importe);
  return out;
}

/* ═══ DETECTOR 3 · INVENTARIO PERDIDO O DAÑADO SIN COMPENSAR ════════════════
   Del libro mayor de inventario (`ledger`): unidades que salen del inventario
   por culpa de Amazon y no aparecen compensadas en ninguna de las dos fuentes
   de compensación.

   REVISIÓN ADVERSARIAL:
   · Una unidad DAÑADA POR EL CLIENTE o DEFECTUOSA no la paga Amazon. Se
     excluyen `CUSTOMER_DAMAGED`, `DEFECTIVE` y `CARRIER_DAMAGED` cuando el
     transportista no es de Amazon. Sin este filtro el hub reclamaría el
     desgaste normal del negocio.
   · Un movimiento de almacén a almacén (`WhseTransfers`) no es una pérdida.
   · Sin coste conocido del producto NO se inventa un importe: el caso sale
     con «coste desconocido» y no suma al total.                              */
const LEDGER_PERDIDA = /(lost|perdid|extravi|misplac|damag|dana|destru|dispos)/;
const LEDGER_NO_ES_DE_AMAZON = /(customer.?damag|defect|dana.?por.?el.?cliente|defectuos)/;
function claimInventarioPerdido(){
  const out = {casos:[], total:0, avisos:[], descartados:{noEsDeAmazon:0, compensados:0, sinCoste:0}};
  const led = imp('ledger');
  if(!led.length){
    out.avisos.push('Falta el libro mayor de inventario (Informes › Logística de Amazon › Inventario). Es la única fuente que dice qué unidades se perdieron y cuándo.');
    return out;
  }
  const comp = claimCompensaciones();
  led.forEach(r=>{
    const f = parseDate(gv(r,'_date','date','fecha'));
    const qty = toNum(gv(r,'_qty','quantity','cantidad'));
    if(!f || qty >= 0) return;                       // solo salidas de inventario
    const ev   = fold(String(gv(r,'_event','eventtype','tipodeevento')||''));
    const disp = fold(String(gv(r,'_disp','disposition','disposicion')||''));
    const rea  = fold(String(gv(r,'_reason','reason','motivo')||''));
    const txt  = ev+' '+disp+' '+rea;
    if(!LEDGER_PERDIDA.test(txt)) return;
    if(LEDGER_NO_ES_DE_AMAZON.test(txt)){ out.descartados.noEsDeAmazon++; return; }
    const sku = String(gv(r,'_sku','msku','sku')||'').trim();
    const uds = Math.abs(qty);
    /* ¿Ya compensado? Una compensación del mismo SKU dentro de la ventana de la
       propia política (60 días) se considera la de este movimiento. Es una
       regla conservadora: en la duda, NO se reclama. */
    const ya = comp.porSku.some(c=> c.sku === sku.toLowerCase() && c.f &&
                                    Math.abs(daysBetween(c.f, f)) <= 60 && c.importe > 0);
    if(ya){ out.descartados.compensados++; return; }
    const C = claimCoste(sku);
    const est = claimEstado('almacen', f);
    const importe = C.coste ? C.coste * uds : null;
    if(!C.coste) out.descartados.sinCoste++;
    out.casos.push({tipo:'almacen', fecha:f, sku, unidades:uds, importe,
                    costeUd:C.coste, estado:est,
                    pais:String(gv(r,'_country','country','pais')||'').trim(),
                    evidencia:[{fuente:'Libro mayor de inventario', fecha:iso(f),
                                tipo:String(gv(r,'_event','eventtype')||''), sku,
                                detalle:uds+' ud · disposición '+(gv(r,'_disp','disposition')||'—')+
                                        ' · motivo '+(gv(r,'_reason','reason')||'—')+
                                        ' · referencia '+(gv(r,'_ref','referenceid')||'—')}]});
    if(importe && est.estado === 'abierta') out.total += importe;
  });
  out.casos.sort((a,b)=> (b.importe||0) - (a.importe||0));
  return out;
}

/* ═══ DETECTOR 4 · CAMBIO DE TARIFA FBA PARA EL MISMO ASIN ══════════════════
   El histórico (`DB.history.d[fecha].f[sku] = [fba, comisión]`) guarda la
   tarifa vigente cada día que se importó la vista previa de tarifas. Si la
   tarifa de logística de un SKU cambia de un día para otro, aquí se ve.

   ESTO NO ES UNA RECLAMACIÓN, ES UNA REVISIÓN, Y LA PANTALLA LO DICE ASÍ.
   Amazon sube las tarifas por calendario todos los años y eso no se reclama.
   Lo reclamable es el cambio por una medición o una categoría equivocadas, y
   eso hay que mirarlo caso a caso. El hub pone el cambio, la fecha, las
   unidades vendidas después y el dinero en juego; no dicta el veredicto.
   Además, el plazo para disputar un cobro de tarifa NO está confirmado, así
   que todos los casos salen con el plazo en «no confirmado».                 */
function claimCambioTarifa(){
  const out = {casos:[], total:0, avisos:[], descartados:{bajadas:0}};
  const H = (DB.history && DB.history.d) || {};
  const dias = Object.keys(H).filter(k=>H[k] && H[k].f).sort();
  if(dias.length < 2){
    out.avisos.push('Hacen falta al menos dos importaciones de la vista previa de tarifas en días distintos: '+
                    'sin dos fotos no hay cambio que comparar. Hoy hay '+dias.length+'.');
    return out;
  }
  const asinDe = {};
  imp('fees').forEach(r=>{
    const sk = String(gv(r,'_sku','sku','sellersku')||'').trim();
    const a  = String(gv(r,'_asin','asin')||'').trim();
    if(sk && a) asinDe[sk] = a;
  });
  const ventasDesde = (sku, desde) => {
    let n = 0;
    imp('orders').forEach(o=>{
      if(String(gv(o,'_sku','sku')||'').trim() !== sku) return;
      const d = parseDate(gv(o,'_date','purchasedate'));
      if(d && d >= desde) n += toNum(gv(o,'_qty','quantity')) || 1;
    });
    return n;
  };
  const ultimo = {};
  dias.forEach(k=>{
    const f = H[k].f || {};
    Object.keys(f).forEach(sku=>{
      const fba = toNum(f[sku][0]);
      const prev = ultimo[sku];
      ultimo[sku] = {fba, k};
      if(!prev || !(prev.fba > 0) || !(fba > 0)) return;
      const delta = fba - prev.fba;
      if(Math.abs(delta) < 0.01) return;
      if(delta < 0){ out.descartados.bajadas++; return; }
      const fecha = parseDate(k);
      const uds = ventasDesde(sku, fecha);
      const importe = delta * uds;
      out.casos.push({tipo:'tarifa', fecha, sku, asin:asinDe[sku]||'', antes:prev.fba, ahora:fba,
                      delta, unidades:uds, importe, estado:claimEstado('tarifa', fecha),
                      evidencia:[{fuente:'Histórico del hub', fecha:k, tipo:'cambio de tarifa', sku,
                                  detalle:'tarifa de logística '+fmt(prev.fba)+' el '+prev.k+' → '+fmt(fba)+' el '+k+
                                          ' · '+uds+' ud vendidas desde entonces'}]});
    });
  });
  out.casos.sort((a,b)=> b.importe - a.importe);
  return out;
}

/* ── Todo junto ─────────────────────────────────────────────────────────── */
function claimsAll(){
  const d1 = claimDevolucionesFantasma();
  const d2 = claimReembolsoInsuficiente();
  const d3 = claimInventarioPerdido();
  const d4 = claimCambioTarifa();
  const bloques = [
    {id:'devolucion', titulo:'Devoluciones fantasma', ventana:'devolucion', r:d1,
     explica:'Reembolsaste al cliente, la unidad no volvió y nadie te la compensó.'},
    {id:'valor', titulo:'Reembolso por debajo del coste', ventana:'valor', r:d2,
     explica:'Amazon te compensó por menos de lo que te cuesta el producto.'},
    {id:'almacen', titulo:'Inventario perdido o dañado sin compensar', ventana:'almacen', r:d3,
     explica:'El libro mayor registra la salida y no hay compensación detrás.'},
    {id:'tarifa', titulo:'Cambio de tarifa de Logística', ventana:'tarifa', r:d4,
     explica:'Revisión, no reclamación: Amazon sube tarifas por calendario y eso no se reclama.'}
  ];
  /* El total SOLO suma lo que está dentro de plazo y con una ventana
     confirmada. Los cambios de tarifa quedan fuera del total a propósito: no
     son dinero debido, son dinero que hay que mirar. */
  const total = bloques.filter(b=>CLAIM_VENTANAS[b.ventana].confirmada)
                       .reduce((a,b)=>a + b.r.total, 0);
  const casos = bloques.reduce((a,b)=>a + b.r.casos.length, 0);
  const caducados = bloques.reduce((a,b)=>a + b.r.casos.filter(c=>c.estado.estado==='caducada').length, 0);
  const pronto    = bloques.reduce((a,b)=>a + b.r.casos.filter(c=>c.estado.estado==='pronto').length, 0);
  const revisar   = d4.casos.length;
  return {bloques, total, casos, caducados, pronto, revisar,
          hayFuente: (typeof txHay==='function' && txHay()) || hasImp('returns') || hasImp('ledger') || hasImp('reimb')};
}

/* ── La plantilla de texto ──────────────────────────────────────────────────
   Se redacta aquí y se copia a mano. El hub no abre casos, no rellena
   formularios y no habla con Amazon: escribe el texto y lo enseña. */
function claimPlantilla(caso, bloque){
  const V = CLAIM_VENTANAS[bloque.ventana];
  const L = [];
  const f = caso.fecha ? iso(caso.fecha) : '(fecha)';
  L.push('Asunto: '+V.etiqueta+(caso.oid ? ' · pedido '+caso.oid : (caso.sku ? ' · SKU '+caso.sku : '')));
  L.push('');
  if(bloque.id === 'devolucion'){
    L.push('Buenos días:');
    L.push('');
    L.push('El pedido '+(caso.oid||'(pedido)')+' ('+(caso.sku||'(SKU)')+', '+(caso.unidades||1)+' ud) se reembolsó al cliente el '+f+'.');
    L.push('A fecha de hoy ('+iso(today())+') no consta la devolución de la unidad en el informe de devoluciones de');
    L.push('Logística de Amazon, ni consta ninguna compensación asociada a este pedido en el informe de reembolsos');
    L.push('ni en el informe de transacciones.');
    L.push('');
    L.push('Solicito el reembolso correspondiente conforme a la política de reembolsos de inventario de Logística de');
    L.push('Amazon, por importe de '+fmt(caso.importe)+' (ventas de producto devueltas menos la comisión ya reintegrada).');
  } else if(bloque.id === 'valor'){
    L.push('Buenos días:');
    L.push('');
    L.push('El '+f+' recibí una compensación de '+fmt(caso.compensado)+' por '+caso.unidades+' unidad(es) del SKU '+caso.sku+',');
    L.push('es decir '+fmt(caso.compensadoUd)+' por unidad.');
    L.push('');
    L.push('Mi coste de aprovisionamiento de esa referencia es superior. Adjunto la documentación de compra que lo acredita');
    L.push('y solicito la revisión del importe conforme a la política de reembolsos de inventario de Logística de Amazon,');
    L.push('que permite presentar esta reclamación dentro de los 60 días siguientes a la emisión del reembolso.');
    L.push('');
    L.push('Diferencia solicitada: '+fmt(caso.importe)+'.');
    if(caso.fleteNoAdmisible > 0.005){
      L.push('');
      L.push('[NOTA INTERNA, NO ENVIAR: hasta '+fmt(caso.fleteNoAdmisible)+' de esa diferencia corresponden al transporte,');
      L.push(' que la política excluye del coste de aprovisionamiento. Ajusta la cifra antes de enviar.]');
    }
  } else if(bloque.id === 'almacen'){
    L.push('Buenos días:');
    L.push('');
    L.push('El libro mayor de inventario registra el '+f+' la salida de '+caso.unidades+' unidad(es) del SKU '+caso.sku+
           (caso.pais ? ' en '+caso.pais : '')+',');
    L.push('marcadas como extraviadas o dañadas en el centro logístico. No consta compensación asociada.');
    L.push('');
    L.push('Solicito el reembolso conforme a la política de reembolsos de inventario de Logística de Amazon.');
    if(caso.importe) L.push('Importe estimado a coste de aprovisionamiento: '+fmt(caso.importe)+'.');
    else L.push('No dispongo todavía del coste de aprovisionamiento de esta referencia en el sistema: adjunto la factura de compra.');
  } else {
    L.push('Buenos días:');
    L.push('');
    L.push('La tarifa de Logística de Amazon del SKU '+caso.sku+(caso.asin ? ' (ASIN '+caso.asin+')' : '')+
           ' pasó de '+fmt(caso.antes)+' a '+fmt(caso.ahora)+' el '+f+'.');
    L.push('Desde entonces se han vendido '+caso.unidades+' unidades, con una diferencia acumulada de '+fmt(caso.importe)+'.');
    L.push('');
    L.push('Solicito la verificación de las medidas y del peso de esta referencia y, si el cambio se debe a una medición');
    L.push('incorrecta, el reembolso de la diferencia cobrada de más.');
  }
  L.push('');
  L.push('Evidencia:');
  (caso.evidencia||[]).forEach(e=>{
    L.push('  · '+e.fuente+' · '+e.fecha+(e.tipo?' · '+e.tipo:'')+(e.oid?' · '+e.oid:'')+(e.sku?' · '+e.sku:''));
    if(e.detalle) L.push('    '+e.detalle);
  });
  L.push('');
  L.push('Gracias.');
  return L.join('\n');
}

/* ── La vista ──────────────────────────────────────────────────────────── */
registrarEstilo(
  '#view-reclamaciones .cl-ev{font-size:11.5px;color:#9A7C66;line-height:1.55}'+
  '#view-reclamaciones .cl-tpl{width:100%;min-height:170px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;'+
    'font-size:11.5px;line-height:1.5;padding:10px;border-radius:8px;border:1px solid rgba(255,106,0,.25);'+
    'background:rgba(0,0,0,.18);color:inherit;resize:vertical}'+
  '#view-reclamaciones details{margin-top:8px}'+
  '#view-reclamaciones summary{cursor:pointer;font-size:12px;color:#FF6A00}'+
  '#view-reclamaciones .cl-fuente{font-size:11.5px;line-height:1.6}'+
  '#view-reclamaciones .cl-fuente a{color:#FF6A00;word-break:break-all}'
);

registrarVista({
  id:'reclamaciones', etiqueta:'Reclamaciones', icono:'⚖', grupo:'Dinero',
  crumb:'Dinero que Amazon debe y nadie está mirando',
  html:
    '<div class="sec-head"><h1>Reclamaciones</h1>'+
      '<div class="sec-desc">Cuatro detectores de dinero que Amazon debe. Cada caso trae importe estimado, '+
      'las filas que lo sostienen y el texto para abrir la reclamación. '+
      '<strong>El hub no envía nada a Amazon: detecta, estima y redacta. Presentar el caso lo haces tú.</strong></div></div>'+
    '<div class="kpis" id="clKpis"></div>'+
    '<div class="card" id="clFuente"></div>'+
    '<div class="card"><h2>Plazos para presentar</h2>'+
      '<div class="sec-desc">Consultados en la documentación oficial de Amazon el '+CLAIM_CONSULTA+'. '+
      'No son los del plan antiguo del proyecto: Amazon cambió estas políticas entre 2024 y 2025 y, además, '+
      'el plazo de las devoluciones de cliente <strong>no es el mismo en amazon.es que en amazon.com</strong>.</div>'+
      '<div id="clVentanas" class="cl-fuente"></div></div>'+
    '<div id="clBloques"></div>',
  render:function(){ try{ renderReclamaciones(); }catch(e){ console.warn('reclamaciones', e); } }
});

function renderReclamaciones(){
  const cont = document.getElementById('clBloques');
  if(!cont) return;
  const A = claimsAll();

  const k = document.getElementById('clKpis');
  if(k) k.innerHTML =
    kpi('Reclamable dentro de plazo', fmt(A.total,2), A.casos+' caso'+(A.casos===1?'':'s')+' detectados', A.total>0?'accent':'')+
    kpi('Fuera de plazo', String(A.caducados), A.caducados?'ya no se pueden presentar':'ninguno', A.caducados?'neg':'pos')+
    kpi('Todavía no', String(A.pronto), 'la ventana aún no ha abierto', A.pronto?'warn':'')+
    kpi('A revisar', String(A.revisar), 'cambios de tarifa, no reclamaciones', A.revisar?'warn':'');

  /* De dónde sale el dinero que se está mirando, y qué se ha dejado fuera. Una
     fuente que no se declara es una fuente en la que nadie puede reparar. */
  const fu = document.getElementById('clFuente');
  if(fu){
    if(typeof txHay!=='function' || !txHay()){
      fu.innerHTML = '<h2>Origen de los datos</h2><div class="sec-desc">Sin el informe de transacciones '+
        '(Pagos › Transacciones › rango personalizado). Es el que trae los reembolsos, las compensaciones '+
        'y las tarifas de varios años.</div>';
    } else {
      const s = txSpan(), f = txFees({from:new Date(2000,0,1), pais:'ALL'});
      const sf = settlementFees();
      const c = sf.txContraste;
      fu.innerHTML = '<h2>Origen de los datos</h2>'+
        '<div class="cl-fuente">'+
        '<strong>Informe de transacciones</strong> · '+num(s.filas)+' filas, del '+
        (s.desde?iso(s.desde):'—')+' al '+(s.hasta?iso(s.hasta):'—')+
        (s.sinFecha?' · <span class="warn">'+num(s.sinFecha)+' sin fecha</span>':'')+
        '<br>Comisión cobrada '+fmt(f.referral)+' · crédito de comisión por reembolsos '+fmt(f.refCredito)+
        ' · logística '+fmt(f.fba)+' · almacenamiento '+fmt(f.storage)+' · otras '+fmt(f.other)+
        '<br><span class="mut">'+num(f.fuera)+' filas fuera de las tarifas a propósito: publicidad (ya la mide el informe de PPC), '+
        'transferencias, ajustes y retrocesiones de impuestos.</span>'+
        (f.dupFilas ? '<br><span class="mut">'+num(f.dupFilas)+' filas de '+num(f.dupPagos)+
          ' liquidación(es) ya venían en el fichero plano y no se han contado dos veces.</span>' : '')+
        (c && !c.ok ? '<br><span class="warn">Estas tarifas NO entran en la cuenta de resultados: '+esc(c.razon)+
          '. Mientras las dos fuentes no cuadren, el P&amp;L estima las tarifas desde las ventas que conoce. '+
          'Las reclamaciones de esta pantalla no dependen de eso.</span>' : '')+
        '</div>';
    }
  }

  const v = document.getElementById('clVentanas');
  if(v) v.innerHTML = Object.keys(CLAIM_VENTANAS).map(id=>{
    const V = CLAIM_VENTANAS[id];
    const plazo = V.confirmada
      ? (V.min ? 'entre '+V.min+' y '+V.max+' días' : 'hasta '+V.max+' días')+' desde '+V.base
      : '<strong class="warn">plazo NO CONFIRMADO</strong>';
    return '<div style="margin-bottom:10px">'+
      '<strong>'+esc(V.etiqueta)+'</strong> · '+plazo+
      '<br><span class="mut">Fuente: '+esc(V.fuente)+
      (V.url ? ' · <a href="'+esc(V.url)+'" target="_blank" rel="noopener">'+esc(V.url)+'</a>' : '')+
      ' · consultado el '+CLAIM_CONSULTA+'</span>'+
      (V.nota ? '<br><span class="mut">'+esc(V.nota)+'</span>' : '')+'</div>';
  }).join('');

  if(!A.hayFuente){
    cont.innerHTML = '<div class="card">'+noData(
      '<br>Las reclamaciones se construyen con el informe de <strong>transacciones</strong> (Pagos › Transacciones), '+
      'el de <strong>devoluciones</strong> de Logística de Amazon, el <strong>libro mayor de inventario</strong> y el de '+
      '<strong>reembolsos</strong> de Logística de Amazon. Sin ninguno de los cuatro no hay nada que mirar.', true)+'</div>';
    return;
  }

  let h = '';
  A.bloques.forEach((b, bi)=>{
    const V = CLAIM_VENTANAS[b.ventana];
    h += '<div class="card"><h2>'+esc(b.titulo)+'</h2>'+
         '<div class="sec-desc">'+esc(b.explica)+'</div>';
    (b.r.avisos||[]).forEach(a=>{ h += '<div class="note-box">'+esc(a)+'</div>'; });
    if(!b.r.casos.length){
      h += (b.r.avisos && b.r.avisos.length) ? '' :
        '<div class="empty"><strong>Ningún caso</strong>Con los informes cargados no hay nada que reclamar por este concepto.</div>';
    } else {
      h += '<div class="tbl-wrap"><table class="grid"><tr>'+
        '<th>Fecha</th><th>'+(b.id==='devolucion'?'Pedido':'SKU')+'</th><th class="num">Ud</th>'+
        '<th class="num">Importe</th><th>Plazo</th><th>Evidencia</th></tr>';
      b.r.casos.slice(0,60).forEach((c, ci)=>{
        h += '<tr>'+
          '<td>'+(c.fecha?iso(c.fecha):'—')+'</td>'+
          '<td class="name"><strong>'+esc(c.oid||c.sku||'—')+'</strong>'+
            (c.oid&&c.sku?'<br><span class="mut">'+esc(c.sku)+'</span>':'')+
            (c.asin?'<br><span class="mut">'+esc(c.asin)+'</span>':'')+'</td>'+
          '<td class="num">'+num(c.unidades)+'</td>'+
          '<td class="num" style="font-weight:600">'+(c.importe!=null?fmt(c.importe):'<span class="mut">coste desconocido</span>')+'</td>'+
          '<td><span class="pill '+(c.estado.clase==='pos'?'go':(c.estado.clase==='neg'?'stop':''))+'">'+esc(c.estado.etiqueta)+'</span></td>'+
          '<td class="cl-ev">'+(c.evidencia||[]).map(e=>esc(e.fuente+' · '+e.fecha+' · '+(e.detalle||''))).join('<br>')+'</td>'+
        '</tr>'+
        '<tr><td colspan="6"><details><summary>Texto de la reclamación · '+esc(c.oid||c.sku||'')+'</summary>'+
          '<textarea class="cl-tpl" readonly id="cltpl-'+bi+'-'+ci+'">'+esc(claimPlantilla(c, b))+'</textarea>'+
          '<div style="margin-top:6px"><button class="btn sm" onclick="claimCopiar(\''+bi+'-'+ci+'\')">Copiar</button> '+
          '<span class="mut" style="font-size:11.5px">Lo presentas tú en Seller Central. El hub no envía nada.</span></div>'+
        '</details></td></tr>';
      });
      h += '</table></div>';
      if(b.r.casos.length > 60) h += '<div class="mut" style="font-size:11.5px;margin-top:6px">Se enseñan los 60 de mayor importe de '+b.r.casos.length+'.</div>';
    }
    const d = b.r.descartados || {};
    const partes = Object.keys(d).filter(x=>d[x]>0).map(x=>d[x]+' '+({
      fbm:'de gestión propia (Amazon no debe nada)', sinCanal:'sin canal logístico declarado',
      conDevolucion:'con devolución registrada', compensados:'ya compensados',
      fueraDeCobertura:'fuera de lo que cubre el informe de devoluciones',
      sinCoste:'sin coste conocido del producto', suficientes:'compensados por encima del coste',
      noEsDeAmazon:'dañados por el cliente o defectuosos', bajadas:'bajadas de tarifa'
    }[x] || x));
    if(partes.length) h += '<div class="mut" style="font-size:11.5px;margin-top:8px">Descartados a propósito: '+esc(partes.join(' · '))+'.</div>';
    h += '<div class="mut" style="font-size:11.5px;margin-top:4px">Plazo aplicado: '+
         (V.confirmada ? (V.min?V.min+'–'+V.max:'0–'+V.max)+' días desde '+esc(V.base) : 'NO CONFIRMADO')+
         ' · consultado el '+CLAIM_CONSULTA+'.</div>';
    h += '</div>';
  });
  cont.innerHTML = h;
}

function claimCopiar(id){
  const el = document.getElementById('cltpl-'+id);
  if(!el) return;
  el.focus(); el.select();
  try{
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value);
    else document.execCommand('copy');
  }catch(e){ /* en file:// el portapapeles puede estar cerrado: el texto queda seleccionado */ }
}

/* Salida en CSV, para quien prefiera trabajar los casos en una hoja. */
registrarExportacion('reclamaciones', 'Exportar reclamaciones', function(){
  const A = claimsAll();
  const L = [['bloque','fecha','pedido','sku','unidades','importe_estimado','estado_plazo','dias','evidencia'].join(';')];
  A.bloques.forEach(b=> b.r.casos.forEach(c=>{
    L.push([b.titulo, c.fecha?iso(c.fecha):'', c.oid||'', c.sku||'', c.unidades||'',
            c.importe!=null?c.importe.toFixed(2).replace('.',','):'', c.estado.etiqueta,
            c.estado.dias!=null?c.estado.dias:'',
            (c.evidencia||[]).map(e=>e.fuente+' '+e.fecha+' '+(e.detalle||'')).join(' | ')]
           .map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';'));
  }));
  const blob = new Blob(['﻿'+L.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reclamaciones-'+iso(today())+'.csv';
  a.click();
});
