import { lineageRoots, vehKey, opType, opTime } from './lineage.js';

/**
 * Cálculos de dinero del sistema.
 *
 * Una sola fórmula para la ganancia de una cadena (árbol), que usan la pantalla
 * del árbol, "Rendimiento por árbol" y los dos Excel:
 *
 *   ganancia = cobrado − pagado + plata puesta en los autos que siguen en mano − comisión
 *
 *   cobrado = ventas/remates: total − partes de pago RECIBIDAS (lo que no es auto)
 *   pagado  = compras/rescisiones: total − autos nuestros ENTREGADOS como parte de pago
 *   en mano = cada auto que entró en la cadena (compra, rescisión o parte de pago
 *             recibida) y no salió (venta o entregado en una compra), por la PLATA
 *             que se puso en él:
 *               - usado recibido como parte de pago: 0 (no salió plata por él)
 *               - compra: lo pagado en efectivo + la plata puesta en los autos
 *                 que se entregaron como parte de pago en esa compra
 *   comisión = 3% de cada venta
 *
 * Un usado recibido NO suma ganancia mientras no se venda: la ganancia es lo que
 * está en el bolsillo. Cuando el usado se vende, lo cobrado entra en "cobrado".
 * Antes se sumaba por su valuación (vender en 125.000 con un usado de 80.000
 * daba 80.000 de "ganancia" sin haber cobrado nada por él).
 *
 * Comprar A en 10.000 y después B en 25.000 entregando A sigue dando 0: B está
 * en mano por los 25.000 de plata que costó (15.000 + los 10.000 de A).
 *
 * El valor de los autos en mano a su valuación sigue en currentHoldingValue
 * (sólo informativo, no entra en la ganancia).
 */

const COMMISSION_RATE = 0.03;
const num = (x) => Number(x) || 0;
const isSaleType = (t) => t === 'venta' || t === 'remate';
const principalOf = (op) => (op?.vehicles || []).find(v => v && v.role === 'principal');
const tradeInsOf = (op) => (op?.vehicles || []).filter(v => v && v.role === 'parte_pago');

// Total de la operación; si no se cargó, el desglose (como muestra el árbol).
export const effectiveTotal = (op) =>
  num(op?.total_amount) ||
  (num(op?.delivery_amount) + num(op?.credit_amount) + tradeInsOf(op).reduce((s, v) => s + num(v.valuation), 0));

export const chainStats = (ops) => {
  const list = (ops || []).filter(Boolean);
  let totalRevenue = 0, totalInvestment = 0, totalCommission = 0;
  let tradeInCount = 0, salesCount = 0, purchasesCount = 0, purchasesWithoutCost = 0;
  const entries = new Map();   // auto -> [{ cost, cash, kind, t, created }]
  const exits = new Map();     // auto -> cantidad de salidas
  const noKey = [];            // entradas sin chasis/chapa: no se pueden seguir, quedan en mano

  const addEntry = (key, item) => {
    if (!key) { noKey.push(item); return; }
    if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push(item);
  };
  const addExit = (key) => { if (key) exits.set(key, (exits.get(key) || 0) + 1); };

  // Plata puesta en un auto que se entrega como parte de pago: la de su entrada
  // más reciente en la cadena. Si no entró en la cadena no sabemos su costo y se
  // toma su valuación (esos casos ya cuentan en missingCostCount).
  const cashInVehicle = (v) => {
    const prev = entries.get(vehKey(v));
    return prev && prev.length ? prev[prev.length - 1].cash : num(v.valuation);
  };

  // En orden de fecha, para que una compra encuentre la entrada anterior del auto
  // que se entrega como parte de pago.
  const chronological = [...list].sort((a, b) =>
    (opTime(a) - opTime(b)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  chronological.forEach(op => {
    const t = opType(op);
    const total = effectiveTotal(op);
    const trade = tradeInsOf(op);
    const tradeTotal = trade.reduce((s, v) => s + num(v.valuation), 0);
    const principal = principalOf(op);
    const when = { t: opTime(op), created: op.created_at || '' };

    if (isSaleType(t)) {
      salesCount++;
      totalRevenue += total - tradeTotal;
      totalCommission += total * COMMISSION_RATE;
      tradeInCount += trade.length;
      addExit(vehKey(principal));
      trade.forEach(v => addEntry(vehKey(v), { cost: num(v.valuation), cash: 0, kind: 'parte_pago', ...when }));
    } else {
      purchasesCount++;
      if (total <= 0) purchasesWithoutCost++;
      totalInvestment += total - tradeTotal;
      const cashFromTradeIns = trade.reduce((s, v) => s + cashInVehicle(v), 0);
      trade.forEach(v => addExit(vehKey(v)));
      if (principal) addEntry(vehKey(principal), { cost: total, cash: total - tradeTotal + cashFromTradeIns, kind: 'compra', ...when });
    }
  });

  // De cada auto quedan en mano las entradas MÁS RECIENTES que sobran después
  // de descontar sus salidas (igual que la pantalla de Inventario).
  const held = [...noKey];
  let salesWithoutCost = 0;
  entries.forEach((items, key) => {
    const out = exits.get(key) || 0;
    const remaining = items.length - out;
    if (remaining > 0) {
      const newestFirst = [...items].sort((a, b) => (b.t - a.t) || String(b.created).localeCompare(String(a.created)));
      held.push(...newestFirst.slice(0, remaining));
    }
  });
  exits.forEach((out, key) => {
    const ins = (entries.get(key) || []).length;
    if (out > ins) salesWithoutCost += out - ins; // vendido sin compra cargada en la cadena
  });

  const currentHoldingValue = held.reduce((s, h) => s + h.cost, 0);
  const heldCashValue = held.reduce((s, h) => s + h.cash, 0);
  const unsold = held.filter(h => h.kind === 'parte_pago');
  const totalProfit = totalRevenue + heldCashValue - totalInvestment - totalCommission;

  return {
    totalProfit,
    totalInvestment,
    totalRevenue,
    totalCommission,
    currentHoldingValue,
    heldCashValue,
    tradeInCount,
    unsoldTradeInValue: unsold.reduce((s, h) => s + h.cost, 0),
    unsoldTradeInCount: unsold.length,
    salesCount,
    purchasesCount,
    salesWithoutCost,
    purchasesWithoutCost,
    // Compras sin precio o ventas sin compra cargada: la ganancia sale inflada.
    missingCostCount: salesWithoutCost + purchasesWithoutCost,
    status: totalProfit >= 0 ? 'ganancia' : 'perdida',
  };
};

export const financials = {
  // Comisión y gastos varios estimados por cada venta (3% del monto total).
  COMMISSION_RATE,

  chainStats,

  // Estadísticas del árbol que está en pantalla (nodos de db.getVehicleTraceability).
  getTreeStats: (traceabilityData) => {
    const nodes = traceabilityData?.nodes || [];
    return chainStats(nodes.map(n => n.data?.raw_data).filter(Boolean));
  },

  /**
   * Rendimiento por árbol (cadena comercial), con el mismo linaje que el árbol
   * en pantalla (services/lineage.js) y la misma fórmula (chainStats).
   */
  getTreesOverview: (allOperations) => {
    const ops = Array.isArray(allOperations) ? allOperations : [];
    if (ops.length === 0) return { trees: [], totalTrees: 0, profitable: 0, losing: 0, aggregateProfit: 0 };

    const roots = lineageRoots(ops);
    const groups = new Map();
    ops.forEach(op => {
      const r = roots.get(op.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(op);
    });

    const trees = [];
    groups.forEach((groupOps, rootId) => {
      const s = chainStats(groupOps);
      const labelOp = groupOps.find(o => o.id === rootId) || groupOps[0];
      const labelPrincipal = principalOf(labelOp) || labelOp.vehicles?.[0] || {};
      const times = groupOps.map(opTime).filter(t => t > 0);
      trees.push({
        id: labelOp.id,
        label: labelPrincipal.description || labelPrincipal.chapa || labelPrincipal.chasis || 'Sin vehículo',
        chapa: labelPrincipal.chapa || labelPrincipal.chasis || '',
        opsCount: groupOps.length,
        ventasCount: s.salesCount,
        comprasCount: s.purchasesCount,
        totalInvestment: s.totalInvestment,
        totalRevenue: s.totalRevenue,
        holding: s.currentHoldingValue,
        totalProfit: s.totalProfit,
        missingCostCount: s.missingCostCount,
        status: s.status,
        firstTime: times.length ? Math.min(...times) : 0,
        lastTime: times.length ? Math.max(...times) : 0,
        vehicleId: (labelPrincipal.chasis || labelPrincipal.chapa || '').trim(),
      });
    });

    trees.sort((a, b) => b.totalProfit - a.totalProfit);
    return {
      trees,
      totalTrees: trees.length,
      profitable: trees.filter(t => t.status === 'ganancia').length,
      losing: trees.filter(t => t.status === 'perdida').length,
      aggregateProfit: trees.reduce((s, t) => s + t.totalProfit, 0),
    };
  },

  /**
   * Métricas de Analítica.
   * - Ventas Totales: ventas y remates menos rescisiones (una rescisión deshace una venta).
   * - Utilidad Cash Flow: cobrado − pagado, sin contar los autos recibidos o
   *   entregados como parte de pago (antes se sumaban como si fueran plata, y el
   *   mismo auto contaba otra vez al revenderse).
   * - El gráfico mensual muestra el año de la operación más RECIENTE del filtro.
   */
  getGlobalMetrics: (allOperations, filteredOperations) => {
    const monthlyData = {};
    const paymentDistribution = { 'Contado': 0, 'Crédito': 0, 'Canje': 0 };
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const cashOf = (op) => effectiveTotal(op) - tradeInsOf(op).reduce((s, v) => s + num(v.valuation), 0);
    const localDate = (op) => {
      const m = String(op?.date || '').match(/^(\d+)-(\d{1,2})-(\d{1,2})/);
      return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(op?.date);
    };

    const filteredTimes = filteredOperations.map(o => localDate(o).getTime()).filter(t => !isNaN(t) && t > 0);
    const targetYear = (filteredTimes.length ? new Date(Math.max(...filteredTimes)) : new Date()).getFullYear();

    allOperations.forEach(op => {
      const date = localDate(op);
      if (isNaN(date.getTime()) || date.getFullYear() !== targetYear) return;
      const monthIndex = date.getMonth();
      const monthLabel = `${monthNames[monthIndex]} ${targetYear}`;
      if (!monthlyData[monthLabel]) monthlyData[monthLabel] = { name: monthLabel, ventas: 0, compras: 0, profit: 0, monthNum: monthIndex };
      const row = monthlyData[monthLabel];
      const t = opType(op);
      const amount = effectiveTotal(op);
      if (isSaleType(t)) { row.ventas += amount; row.profit += cashOf(op); }
      else if (t === 'rescision') { row.ventas -= amount; row.profit -= cashOf(op); }
      else { row.compras += amount; row.profit -= cashOf(op); }
    });

    let grossSales = 0, rescinded = 0, filteredPurchases = 0;
    let salesCount = 0, purchasesCount = 0, rescissionsCount = 0;
    let cashIn = 0, cashOut = 0;
    let totalCommission = 0, totalCredit = 0, totalDelivery = 0, creditSalesCount = 0;
    const sellerMap = {};

    filteredOperations.forEach(op => {
      const amount = effectiveTotal(op);
      const t = opType(op);

      if (isSaleType(t)) {
        grossSales += amount;
        cashIn += cashOf(op);
        salesCount++;
        totalCommission += amount * COMMISSION_RATE;
        totalCredit += num(op.credit_amount);
        totalDelivery += num(op.delivery_amount);
        if (num(op.installments) > 0) creditSalesCount++;
        const seller = (op.seller_name || '').trim();
        if (seller) {
          const k = seller.toUpperCase();
          if (!sellerMap[k]) sellerMap[k] = { name: seller, count: 0, volume: 0 };
          sellerMap[k].count++;
          sellerMap[k].volume += amount;
        }
      } else if (t === 'rescision') {
        rescinded += amount;
        cashOut += cashOf(op);
        rescissionsCount++;
      } else {
        filteredPurchases += amount;
        cashOut += cashOf(op);
        purchasesCount++;
      }

      if (tradeInsOf(op).length > 0) paymentDistribution['Canje']++;
      else {
        const type = (op.payment_type || 'contado').toLowerCase();
        if (type.includes('crédito') || type.includes('credito')) paymentDistribution['Crédito']++;
        else paymentDistribution['Contado']++;
      }
    });

    const totalSales = grossSales - rescinded;
    const netProfit = cashIn - cashOut;
    return {
      timeline: Object.values(monthlyData).sort((a, b) => a.monthNum - b.monthNum),
      paymentMethods: Object.entries(paymentDistribution).map(([name, value]) => ({ name, value })),
      sellers: Object.values(sellerMap).sort((a, b) => b.volume - a.volume),
      summary: {
        totalSales,
        totalPurchases: filteredPurchases,
        netProfit,
        salesCount,
        purchasesCount,
        rescissionsCount,
        avgTicket: salesCount > 0 ? grossSales / salesCount : 0,
        totalCommission,
        netAfterCommission: netProfit - totalCommission,
        totalCredit,
        totalDelivery,
        creditSalesCount,
        contadoSalesCount: salesCount - creditSalesCount,
      },
    };
  },
};
