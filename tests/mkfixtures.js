// Genera informes con las CABECERAS REALES de Amazon para probar el importador.
const fs = require('fs');
const D = require('path').resolve(__dirname,'fixtures');
fs.mkdirSync(D, {recursive:true});
const iso = d => d.toISOString().slice(0,10);
const ago = k => { const d=new Date(); d.setDate(d.getDate()-k); return d; };

function tsv(name, headers, rows, enc){
  const txt = [headers.join('\t')].concat(rows.map(r=>r.join('\t'))).join('\n');
  fs.writeFileSync(D+'/'+name, Buffer.from(txt, enc||'utf8'));
}

// 1 · All Orders by Order Date (33 columnas reales)
const ordH = ['amazon-order-id','merchant-order-id','purchase-date','last-updated-date','order-status',
 'fulfillment-channel','sales-channel','order-channel','ship-service-level','product-name','sku','asin',
 'item-status','quantity','currency','item-price','item-tax','shipping-price','shipping-tax','gift-wrap-price',
 'gift-wrap-tax','item-promotion-discount','ship-promotion-discount','ship-city','ship-state','ship-postal-code',
 'ship-country','promotion-ids','cpf','is-business-order','purchase-order-number','price-designation',
 'signature-confirmation-recommended'];
const SKUS=[['ARS-ROD-01','Rodillo de masaje muscular',24.99],['ARS-BAN-02','Set de bandas elásticas',17.99],
            ['ARS-EST-03','Esterilla plegable',39.99],['ARS-PEL-04','Pelota miofascial',11.99]];
const CH=['Amazon.de','Amazon.fr','Amazon.it','Amazon.es'];
const ordR=[];
for(let d=0; d<95; d++){
  SKUS.forEach((s,si)=>{
    const q = Math.max(1, Math.round([6,4,2,3][si] + Math.sin((d+si*5)/8)*2));
    const ch = CH[(d+si)%4];
    const price = +(s[2]*q).toFixed(2);
    ordR.push([ '171-'+String(2000000+d*13+si).padStart(7,'0')+'-'+String(1000000+d*7+si).padStart(7,'0'), '', iso(ago(d))+'T09:12:44+00:00', iso(ago(d))+'T11:00:00+00:00',
      'Shipped','Amazon', ch,'','Expedited', s[1], s[0], 'B0TEST'+si, 'Shipped', q, 'EUR',
      price, (price*0.21/1.21).toFixed(2), '0','0','0','0','0','0','Madrid','','28001',
      ch.slice(7).toUpperCase().replace('COM.BE','BE'), '','','false','','','' ]);
  });
}
tsv('all-orders.txt', ordH, ordR);

// 2 · FBA Fee Preview (34 columnas, incluida la de nombre con paréntesis)
const feeH = ['sku','fnsku','asin','product-name','product-group','brand','fulfilled-by','your-price','sales-price',
 'longest-side','median-side','shortest-side','length-and-girth','unit-of-dimension','item-package-weight',
 'unit-of-weight','product-size-tier','currency','estimated-fee-total','estimated-referral-fee-per-unit',
 'estimated-variable-closing-fee','estimated-order-handling-fee-per-order','estimated-pick-pack-fee-per-unit',
 'estimated-weight-handling-fee-per-unit','expected-fulfillment-fee-per-unit',
 'estimated-future-fee (Current Selling on Amazon + Future Fulfillment fees)',
 'estimated-future-order-handling-fee-per-order','estimated-future-pick-pack-fee-per-unit',
 'estimated-future-weight-handling-fee-per-unit','expected-future-fulfillment-fee-per-unit',
 'estimated-future-referral-fee-per-unit','current-fee-category','future-fee-category','future-fee-category-effective-date'];
tsv('fee-preview.txt', feeH, SKUS.map((s,i)=>[s[0],'X00'+i,'B0TEST'+i,s[1],'sports','Aresstore','AMAZON_EU',
  s[2],s[2],'20','15','8','60','centimeters','450','grams','Standard','EUR','6.95',(s[2]*0.15).toFixed(2),
  '0','0','2.10','1.10','3.20','6.95','0','2.10','1.10','3.25',(s[2]*0.15).toFixed(2),'Standard','Standard','']));

// 3 · Inventory Ledger Detailed (cabeceras con mayúsculas y espacios) — en LATIN-1 a propósito
const ledH = ['Date','FNSKU','ASIN','MSKU','Title','Event Type','Reference ID','Quantity','Fulfillment Center',
 'Disposition','Reason','Country','Reconciled Quantity','Unreconciled Quantity','Date and Time'];
const ledR=[];
['DE','FR','IT','ES'].forEach((c,ci)=>SKUS.forEach((s,si)=>{
  ledR.push([iso(ago(ci*3+si)), 'X00'+si,'B0TEST'+si, s[0], s[1],'Shipments','171-x'+si,'-12','FRA7','SELLABLE','',c,'0','0', iso(ago(ci))+' 10:00:00']);
}));
tsv('ledger-detail.txt', ledH, ledR, 'latin1');

// 4 · Manage FBA Inventory (21 columnas)
const invH=['sku','fnsku','asin','product-name','condition','your-price','mfn-listing-exists','mfn-fulfillable-quantity',
 'afn-listing-exists','afn-warehouse-quantity','afn-fulfillable-quantity','afn-unsellable-quantity','afn-reserved-quantity',
 'afn-total-quantity','per-unit-volume','afn-inbound-working-quantity','afn-inbound-shipped-quantity',
 'afn-inbound-receiving-quantity','afn-researching-quantity','afn-reserved-future-supply','afn-future-supply-buyable'];
const ST=[420,180,95,1400];
tsv('fba-inventory.txt', invH, SKUS.map((s,i)=>[s[0],'X00'+i,'B0TEST'+i,s[1],'New',s[2],'No','0','Yes',
  ST[i],ST[i],'3','12',ST[i]+15,'1.5','0','0','0','0','0','0']));

// 5 · FBA Multi-Country Inventory (6 columnas) — la clave de PanEU
tsv('multicountry.txt', ['seller-sku','fulfillment-channel-sku','asin','condition-type','country','quantity-for-local-fulfillment'],
  [].concat.apply([], SKUS.map((s,i)=>['DE','FR','IT','ES'].map((c,ci)=>
    [s[0],'X00'+i,'B0TEST'+i,'New',c, Math.round(ST[i]*[0.42,0.24,0.16,0.18][ci])]))));

// 6 · FBA Customer Returns (13 columnas)
const retH=['return-date','order-id','sku','asin','fnsku','product-name','quantity','fulfillment-center-id',
 'detailed-disposition','reason','status','license-plate-number','customer-comments'];
const retR=[]; for(let i=0;i<38;i++){ const s=SKUS[i%4];
  retR.push([iso(ago(i*2)),'171-4'+String(100000+i).padStart(6,'0')+'-'+String(2000000+i).padStart(7,'0'),s[0],'B0TEST'+(i%4),'X00'+(i%4),s[1],'1','FRA7',
    i%3?'SELLABLE':'CUSTOMER_DAMAGED','NO_LONGER_NEEDED','Unit returned to inventory','LPN'+i,'']); }
tsv('returns.txt', retH, retR);

// 7 · Search Term Report (CSV con comas y comillas, como lo exporta la consola de Ads)
const stH=['Start Date','End Date','Portfolio name','Currency','Campaign Name','Ad Group Name','Targeting',
 'Match Type','Customer Search Term','Impressions','Clicks','Click-Thru Rate (CTR)','Cost Per Click (CPC)',
 'Spend','14 Day Total Sales','Total Advertising Cost of Sales (ACOS)','Total Return on Advertising Spend (ROAS)',
 '14 Day Total Orders (#)','14 Day Total Units (#)'];
const TERMS=[['rodillo masaje muscular',9],['foam roller',8],['rodillo fitness',6],['masajeador espalda, grande',2],
 ['banda elastica fitness',7],['gomas entrenamiento',3],['esterilla yoga plegable',5],['pelota lacrosse masaje',0],
 ['rodillo de espuma barato',0],['masaje piernas maquina',0],['rodillo pilates',4],['fitness accesorios',0]];
const stR = TERMS.map((t,i)=>{
  const clicks=28+i*9, spend=(clicks*0.64).toFixed(2), orders=t[1], sales=(orders*23.4).toFixed(2);
  return ['2026-06-01','2026-07-31','','EUR','"SP · Rodillo, exacta"','AG1','rodillo','EXACT',
    '"'+t[0]+'"', clicks*36, clicks, '0.28', '0.64', spend, sales,
    orders? (spend/sales*100).toFixed(1):'0', orders?(sales/spend).toFixed(2):'0', orders, orders];
});
fs.writeFileSync(D+'/search-terms.csv', [stH.join(',')].concat(stR.map(r=>r.join(','))).join('\n'));

// 8 · Un archivo NO reconocible, para comprobar que falla con elegancia
fs.writeFileSync(D+'/desconocido.csv','columna_a,columna_b,columna_c\n1,2,3\n4,5,6\n');

// 9 · Storage fees (cabeceras con guion BAJO — inconsistencia real de Amazon)
const storH=['asin','fnsku','product_name','fulfillment_center','country_code','longest_side','median_side',
 'shortest_side','measurement_units','weight','weight_units','item_volume','volume_units','product_size_tier',
 'average_quantity_on_hand','average_quantity_pending_removal','estimated_total_item_volume','month_of_charge',
 'storage_rate','estimated_monthly_storage_fee','currency','average_quantity_customer_orders','base_rate',
 'breakdown_incentive_fee_amount','dangerous_goods_storage_type','eligible_for_inventory_discount',
 'qualifies_for_inventory_discount','storage_utilization_ratio','storage_utilization_ratio_units',
 'total_incentive_fee_amount','utilization_surcharge_rate'];
tsv('storage-fees.txt', storH, SKUS.map((s,i)=>['B0TEST'+i,'X00'+i,s[1],'FRA7','DE','20','15','8','centimeters',
 '450','grams','0.0015','cubic feet','Standard',ST[i],'0',(ST[i]*0.0015).toFixed(3),'2026-07','27.54',
 (ST[i]*0.0015*27.54).toFixed(2),'EUR','12','27.54','0','','No','No','8.2','weeks','0','0']));

/* 9 · Settlement flat file V1 · el esquema que el lector entiende.
   Solo en inglés: Amazon no lo traduce. Trae `item-related-fee-type`, que es
   la columna de la que salen las comisiones reales del P&L. */
const setH = ['settlement-id','settlement-start-date','settlement-end-date','deposit-date','total-amount',
 'currency','transaction-type','order-id','merchant-order-id','adjustment-id','shipment-id','marketplace-name',
 'shipment-fee-type','shipment-fee-amount','order-fee-type','order-fee-amount','fulfillment-id','posted-date',
 'posted-date-time','order-item-code','merchant-order-item-id','merchant-adjustment-item-id','sku',
 'quantity-purchased','price-type','price-amount','item-related-fee-type','item-related-fee-amount',
 'misc-fee-amount','other-fee-amount','other-fee-reason-description','promotion-id','promotion-type',
 'promotion-amount','direct-payment-type','direct-payment-amount','other-amount'];
const setDesde = iso(ago(14)), setHasta = iso(ago(1));
const setR = [];
SKUS.forEach((s,i)=>{
  const oid = '171-'+String(3000000+i).padStart(7,'0')+'-'+String(2000000+i).padStart(7,'0');
  const precio = s[2]*10;
  // una fila de ingreso, una de comisión y una de tarifa FBA por SKU
  [['Principal', precio.toFixed(2), '', ''],
   ['', '', 'Commission', (-precio*0.153).toFixed(2)],
   ['', '', 'FBAPerUnitFulfillmentFee', (-3.2*10).toFixed(2)]].forEach(([pt,pa,ft,fa])=>{
    setR.push(['9876543210', setDesde+' UTC', setHasta+' UTC', setHasta+' UTC','', 'EUR','Order',oid,'','','FBA-'+i,
      'Amazon.es','','','','','FBA', iso(ago(2)), iso(ago(2))+' 10:12:00 UTC','1','','', s[0],'10',
      pt, pa, ft, fa, '','','','','','','','','']);
  });
});
tsv('settlement.txt', setH, setR);

/* 10 · FBA Inventory Planning (salud del inventario). Solo en inglés. */
const plaH = ['snapshot-date','sku','fnsku','asin','product-name','condition','available',
 'pending-removal-quantity','inv-age-0-to-90-days','inv-age-91-to-180-days','inv-age-181-to-270-days',
 'inv-age-271-to-365-days','inv-age-365-plus-days','currency','units-shipped-t7','units-shipped-t30',
 'units-shipped-t60','units-shipped-t90','alert','your-price','sales-price','recommended-action',
 'healthy-inventory-level','recommended-sales-price','recommended-sale-duration-days',
 'recommended-removal-quantity','estimated-cost-savings-of-recommended-actions','sell-through',
 'item-volume','volume-unit-measurement','storage-type','storage-volume','marketplace','product-group',
 'sales-rank','days-of-supply','estimated-excess-quantity','weeks-of-cover-t30','weeks-of-cover-t90'];
tsv('inventory-planning.txt', plaH, SKUS.map((s,i)=>[iso(ago(1)), s[0], 'X00'+i, 'B0TEST'+i, s[1], 'New',
 String(ST[i]), '0', String(Math.round(ST[i]*0.6)), String(Math.round(ST[i]*0.2)),
 String(Math.round(ST[i]*0.1)), String(Math.round(ST[i]*0.07)), String(Math.round(ST[i]*0.03)), 'EUR',
 '42','180','360','540','', s[2].toFixed(2), s[2].toFixed(2), '', String(Math.round(ST[i]*0.5)),
 '','','0','0', (0.35+i*0.05).toFixed(2), '0.0015','cubic feet','Standard','2.4','Amazon.es','Sports',
 String(1200+i*300), String(40+i*20), String(Math.max(0, Math.round(ST[i]*0.3))), '5.2','6.1']));

/* 11 · FBA Reimbursements. Solo en inglés. */
const reiH = ['approval-date','reimbursement-id','case-id','amazon-order-id','reason','sku','fnsku','asin',
 'product-name','condition','currency-unit','amount-per-unit','amount-total','quantity-reimbursed-cash',
 'quantity-reimbursed-inventory','quantity-reimbursed-total','original-reimbursement-id','original-reimbursement-type'];
tsv('reimbursements.txt', reiH, SKUS.map((s,i)=>[iso(ago(6+i))+' PDT', 'R'+(500000+i), 'C'+(900000+i),
 '171-'+String(4000000+i).padStart(7,'0')+'-'+String(3000000+i).padStart(7,'0'),
 ['Lost_Warehouse','Damaged_Warehouse','Lost_Inbound','Fee_Correction'][i], s[0], 'X00'+i, 'B0TEST'+i, s[1],
 'Sellable','EUR', s[2].toFixed(2), (s[2]*(i+1)).toFixed(2), String(i+1), '0', String(i+1), '', 'REIMBURSEMENT']));

/* 12 · VAT Transactions. Solo en inglés, y con las cabeceras en MAYÚSCULAS
   y guiones bajos, que es como las sirve la biblioteca de documentos fiscales. */
const vatH = ['UNIQUE_ACCOUNT_IDENTIFIER','ACTIVITY_PERIOD','SALES_CHANNEL','MARKETPLACE','PROGRAM',
 'TRANSACTION_EVENT_ID','ACTIVITY_TRANSACTION_ID','TRANSACTION_DEPART_DATE','TRANSACTION_ARRIVAL_DATE',
 'TRANSACTION_COMPLETE_DATE','TRANSACTION_TYPE','TRANSACTION_SELLER_VAT_NUMBER_COUNTRY','SELLER_SKU',
 'ASIN','ITEM_DESCRIPTION','QTY','TOTAL_ACTIVITY_VALUE_AMT_VAT_EXCL','TOTAL_ACTIVITY_VALUE_VAT_AMT',
 'TOTAL_ACTIVITY_VALUE_AMT_VAT_INCL','TRANSACTION_CURRENCY_CODE','PRICE_OF_ITEMS_VAT_RATE_PERCENT',
 'SALE_DEPART_COUNTRY','SALE_ARRIVAL_COUNTRY','ARRIVAL_POST_CODE','DEPARTURE_POST_CODE','TAXABLE_JURISDICTION'];
const vatPais = [['DE',19],['FR',20],['IT',22],['ES',21]];
tsv('vat-transactions.txt', vatH, SKUS.map((s,i)=>{
  const [pais,tipo] = vatPais[i];
  const sinIva = s[2]*20/(1+tipo/100);
  return ['AZ'+i,'2026-07','Amazon.'+pais.toLowerCase(),'Amazon.'+pais.toLowerCase(),'PAN_EU',
   'EV'+(700000+i),'AT'+(800000+i), iso(ago(20)), iso(ago(18)), iso(ago(18)),'SALE','ES', s[0], 'B0TEST'+i,
   s[1],'20', sinIva.toFixed(2), (sinIva*tipo/100).toFixed(2), (s[2]*20).toFixed(2),'EUR', String(tipo),
   'ES', pais, '10115','46001', pais];
}));

console.log('Fixtures creados en '+D+':');
fs.readdirSync(D).forEach(f=>console.log('  '+f+'  '+fs.statSync(D+'/'+f).size+' bytes'));
