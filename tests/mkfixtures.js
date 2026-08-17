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

console.log('Fixtures creados en '+D+':');
fs.readdirSync(D).forEach(f=>console.log('  '+f+'  '+fs.statSync(D+'/'+f).size+' bytes'));
