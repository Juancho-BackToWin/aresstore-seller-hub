/* Los mismos informes que fixtures/, pero con cabeceras y valores en ESPAÑOL.
   Los nombres de columna son inventados a propósito: si el importador los
   reconoce igual, es porque no depende de las cabeceras. */
const fs = require('fs');
const D = require('path').resolve(__dirname,'fixtures-es');
fs.mkdirSync(D, {recursive:true});
const iso = d => d.toISOString().slice(0,10);
const ago = k => { const d=new Date(); d.setDate(d.getDate()-k); return d; };
const tsv = (name, headers, rows, enc) =>
  fs.writeFileSync(D+'/'+name, Buffer.from([headers.join('\t')].concat(rows.map(r=>r.join('\t'))).join('\n'), enc||'utf8'));

const SKUS=[['ARS-ROD-01','Rodillo de masaje muscular',24.99],['ARS-BAN-02','Set de bandas elásticas',17.99],
            ['ARS-EST-03','Esterilla plegable',39.99],['ARS-PEL-04','Pelota miofascial',11.99]];
const CH=['Amazon.de','Amazon.fr','Amazon.it','Amazon.es'];
const ST=[420,180,95,1400];

/* 1 · TODOS LOS PEDIDOS — cabeceras traducidas, estados traducidos */
const ordH=['identificador-del-pedido-de-amazon','identificador-del-pedido-del-comerciante',
 'fecha-de-la-compra','fecha-de-la-ultima-actualizacion','estado-del-pedido',
 'canal-de-gestion-logistica','canal-de-venta','canal-del-pedido','nivel-de-servicio-de-envio',
 'nombre-del-producto','sku','asin','estado-del-articulo','cantidad','divisa',
 'precio-del-articulo','impuesto-del-articulo','precio-del-envio','impuesto-del-envio',
 'precio-del-envoltorio','impuesto-del-envoltorio','descuento-promocional-del-articulo',
 'descuento-promocional-del-envio','ciudad-de-envio','provincia-de-envio','codigo-postal-de-envio',
 'pais-de-envio','identificadores-de-promocion','cpf','es-pedido-de-empresa',
 'numero-de-orden-de-compra','designacion-de-precio','se-recomienda-confirmacion-de-firma'];
const ordR=[];
for(let d=0; d<95; d++){
  SKUS.forEach((s,si)=>{
    const q = Math.max(1, Math.round([6,4,2,3][si] + Math.sin((d+si*5)/8)*2));
    const ch = CH[(d+si)%4], price=+(s[2]*q).toFixed(2);
    ordR.push(['171-'+String(2000000+d*13+si).padStart(7,'0')+'-'+String(1000000+d*7+si).padStart(7,'0'),'', iso(ago(d))+'T09:12:44+00:00', iso(ago(d))+'T11:00:00+00:00',
      'Enviado','Amazon', ch,'','Urgente', s[1], s[0], 'B0TEST'+si, 'Enviado', q, 'EUR',
      price, (price*0.21/1.21).toFixed(2), '0','0','0','0','0','0','Madrid','','28001',
      ch.slice(7).toUpperCase(), '','','false','','','']);
  });
}
tsv('pedidos-es.txt', ordH, ordR, 'latin1');

/* 2 · INVENTARIO FBA */
const invH=['sku','fnsku','asin','nombre-del-producto','estado','tu-precio',
 'existe-oferta-gestionada-por-el-vendedor','cantidad-gestionada-por-el-vendedor',
 'existe-oferta-gestionada-por-amazon','cantidad-en-almacen-de-amazon',
 'cantidad-disponible-gestionada-por-amazon','cantidad-no-vendible',
 'cantidad-reservada','cantidad-total-gestionada-por-amazon','volumen-por-unidad',
 'cantidad-entrante-en-preparacion','cantidad-entrante-enviada','cantidad-entrante-en-recepcion',
 'cantidad-en-investigacion','cantidad-reservada-suministro-futuro','suministro-futuro-comprable'];
tsv('inventario-es.txt', invH, SKUS.map((s,i)=>[s[0],'X00'+i,'B0TEST'+i,s[1],'Nuevo',s[2],'No','0','Sí',
  ST[i],ST[i],'3','12',ST[i]+15,'1.5','0','0','0','0','0','0']), 'latin1');

/* 3 · INVENTARIO MULTIPAÍS */
tsv('multipais-es.txt',
  ['sku-del-vendedor','sku-del-canal-de-gestion','asin','tipo-de-estado','pais','cantidad-para-gestion-local'],
  [].concat.apply([], SKUS.map((s,i)=>['DE','FR','IT','ES'].map((c,ci)=>
    [s[0],'X00'+i,'B0TEST'+i,'Nuevo',c, Math.round(ST[i]*[0.42,0.24,0.16,0.18][ci])]))), 'latin1');

/* 4 · VISTA PREVIA DE TARIFAS */
const feeH=['sku','fnsku','asin','nombre-del-producto','grupo-de-productos','marca','gestionado-por',
 'tu-precio','precio-de-venta','lado-mas-largo','lado-medio','lado-mas-corto','largo-y-contorno',
 'unidad-de-dimension','peso-del-paquete','unidad-de-peso','nivel-de-tamano-del-producto','divisa',
 'total-estimado-de-tarifas','comision-por-recomendacion-estimada-por-unidad',
 'tarifa-variable-de-cierre-estimada','tarifa-de-gestion-de-pedido-estimada',
 'tarifa-de-recogida-y-embalaje-estimada','tarifa-de-manipulacion-por-peso-estimada',
 'tarifa-de-gestion-logistica-prevista-por-unidad','tarifa-futura-estimada',
 'tarifa-futura-de-gestion-de-pedido','tarifa-futura-de-recogida-y-embalaje',
 'tarifa-futura-de-manipulacion-por-peso','tarifa-futura-de-gestion-logistica-por-unidad',
 'comision-futura-estimada-por-unidad','categoria-de-tarifa-actual','categoria-de-tarifa-futura',
 'fecha-efectiva-de-la-categoria-futura'];
tsv('tarifas-es.txt', feeH, SKUS.map((s,i)=>[s[0],'X00'+i,'B0TEST'+i,s[1],'deporte','Aresstore','AMAZON_EU',
  s[2],s[2],'20','15','8','60','centimetros','450','gramos','Estándar','EUR','6.95',
  (s[2]*0.204).toFixed(2),'0.00','0.00','2.10','1.10','3.20','6.95','0.00','2.10','1.10','3.25',
  (s[2]*0.204).toFixed(2),'Estándar','Estándar','']), 'latin1');

/* 5 · DEVOLUCIONES */
const retH=['fecha-de-devolucion','identificador-del-pedido','sku','asin','fnsku','nombre-del-producto',
 'cantidad','identificador-del-centro-logistico','disposicion-detallada','motivo','estado',
 'numero-de-matricula','comentarios-del-cliente'];
const retR=[]; for(let i=0;i<38;i++){ const s=SKUS[i%4];
  retR.push([iso(ago(i*2)),'171-4'+String(100000+i).padStart(6,'0')+'-'+String(2000000+i).padStart(7,'0'),s[0],'B0TEST'+(i%4),'X00'+(i%4),s[1],'1','FRA7',
    i%3?'VENDIBLE':'DANADO_POR_CLIENTE','YA_NO_LO_NECESITO','Unidad devuelta al inventario','LPN'+i,'']); }
tsv('devoluciones-es.txt', retH, retR, 'latin1');

/* 6 · TÉRMINOS DE BÚSQUEDA (Publicidad) — CSV con comas */
const stH=['Fecha de inicio','Fecha de fin','Nombre de la cartera','Divisa','Nombre de la campaña',
 'Nombre del grupo de anuncios','Segmentación','Tipo de concordancia','Término de búsqueda del cliente',
 'Impresiones','Clics','Porcentaje de clics','Coste por clic','Gasto','Ventas totales en 14 días',
 'Coste publicitario total de las ventas','Retorno de la inversión publicitaria',
 'Pedidos totales en 14 días','Unidades totales en 14 días'];
const TERMS=[['pulsera piedra onix',9],['pulsera acero hombre',8],['pulsera ojo de tigre',6],
 ['brazalete cuero, hombre',2],['pulsera perlas mujer',7],['pulsera jaspe imperial',3],
 ['pulsera cuerda nautica',5],['pulsera 18kora',0],['pulsera barata hombre',0],
 ['abalorios sueltos',0],['pulsera magnetica',4],['complementos moda',0]];
const stR = TERMS.map((t,i)=>{
  const clicks=28+i*9, spend=(clicks*0.64).toFixed(2), orders=t[1], sales=(orders*23.4).toFixed(2);
  return ['2026-06-01','2026-07-31','','EUR','"SP · Pulseras, exacta"','GA1','pulsera','EXACTA',
    '"'+t[0]+'"', clicks*36, clicks, '"0,28"', '"0,64"', spend, sales,
    orders?(spend/sales*100).toFixed(1):'0', orders?(sales/spend).toFixed(2):'0', orders, orders];
});
fs.writeFileSync(D+'/terminos-es.csv', Buffer.from([stH.join(',')].concat(stR.map(r=>r.join(','))).join('\n'),'latin1'));

/* 6b · CSV MAL FORMADO: coma decimal sin comillas. Debe rechazarse. */
fs.writeFileSync(D+'/terminos-roto.csv', Buffer.from([stH.join(',')].concat(
  TERMS.map((t,i)=>{const clicks=28+i*9, spend=(clicks*0.64).toFixed(2).replace('.',',');
    return ['2026-06-01','2026-07-31','','EUR','SP Pulseras','GA1','pulsera','EXACTA',
      t[0].replace(',',''), clicks*36, clicks, '0,28', '0,64', spend, '64,00','17,9','210,6','8','11'].join(',');})
  ).join('\n'),'latin1'));

/* 6b · Libro mayor de inventario en español. Es el único de los siete informes
   traducibles que no tenía fixture en español: sin él, ese camino de detección
   —por nombres de columna en español, no por cabecera inglesa— nunca se
   probaba. Va en Latin-1, que es como lo sirve Amazon. */
const ledH = ['Fecha','FNSKU','ASIN','MSKU','Título','Tipo de evento','ID de referencia','Cantidad',
 'Centro logístico','Estado','Motivo','País','Cantidad conciliada','Cantidad sin conciliar','Fecha y hora'];
const ledR=[];
['DE','FR','IT','ES'].forEach((c,ci)=>SKUS.forEach((s,si)=>{
  ledR.push([iso(ago(ci*3+si)), 'X00'+si, 'B0TEST'+si, s[0], s[1], 'Envíos', '171-x'+si, '-12',
             'FRA7', 'VENDIBLE', '', c, '0', '0', iso(ago(ci))+' 10:00:00']);
}));
tsv('libro-inventario-es.txt', ledH, ledR, 'latin1');

/* 7 · CASO HOSTIL: cabeceras que no dicen nada. Solo puede salir por contenido. */
const hostH = ordH.map((_,i)=>'columna_'+(i+1));
tsv('hostil-sin-nombres.txt', hostH, ordR.slice(0,200), 'utf8');

console.log('Fixtures en español creados:');
fs.readdirSync(D).forEach(f=>console.log('  '+f+'  '+fs.statSync(D+'/'+f).size+' bytes'));
