/**
 * Financial analysis logic for the Vehicle Tracking System.
 * Calculates realized and estimated profit across commercial chains.
 */

export const financials = {
  /**
   * Calculates total profit for an entire lineage (tree).
   * Logic: Sum of all Sales - Sum of all Initial Purchases
   */
  // Comisión y gastos varios estimados por cada venta (3% del monto total).
  COMMISSION_RATE: 0.03,

  getTreeStats: (traceabilityData) => {
    const { nodes } = traceabilityData;
    if (!nodes || nodes.length === 0) {
      return { totalProfit: 0, tradeInCount: 0, totalInvestment: 0, totalRevenue: 0, unsoldTradeInValue: 0, unsoldTradeInCount: 0, totalCommission: 0 };
    }

    // Convierte la fecha ya formateada del nodo (es-PY, ej "18/6/2026") a Date
    const parseNodeDate = (d) => {
      if (!d) return new Date(0);
      const parts = d.split('/').map(Number);
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    };

    let totalRevenue = 0;
    let tradeInCount = 0;
    let unsoldTradeInValue = 0; // Valor acumulado de partes de pago aún no revendidas
    let unsoldTradeInCount = 0;
    let totalCommission = 0; // Comisión y gastos varios (3% de cada venta)

    nodes.forEach(node => {
      const { operation_type, total_amount, trade_ins } = node.data;
      const amount = Number(total_amount) || 0;

      if (operation_type === 'venta') {
        // Un vehículo que ingresa como parte de pago todavía no es efectivo —
        // es un auto que pasa a stock. Se resta del Monto Total para que la
        // ganancia solo refleje la parte realmente cobrada (contado + crédito).
        const tradeInReceivedTotal = (trade_ins || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        totalRevenue += amount - tradeInReceivedTotal;
        totalCommission += amount * financials.COMMISSION_RATE;
        if (trade_ins) {
          tradeInCount += trade_ins.length;
          trade_ins.forEach(t => {
            if (!t.isSold) {
              unsoldTradeInValue += Number(t.amount) || 0;
              unsoldTradeInCount += 1;
            }
          });
        }
      }
    });

    // La Inversión Inicial es el costo de la COMPRA más antigua de la cadena
    // (la entrada real de capital). Las compras posteriores que se pagan
    // entregando un vehículo ya comprado antes NO se suman aparte, porque
    // ese costo ya está contado en la compra original — sumarlas de nuevo
    // duplicaría el monto.
    const compraNodes = nodes.filter(n => n.data.operation_type === 'compra');
    const ventaNodes = nodes.filter(n => n.data.operation_type === 'venta');
    const totalInvestment = compraNodes.length > 0
      ? Number(compraNodes.reduce((oldest, n) =>
          parseNodeDate(n.data.date) < parseNodeDate(oldest.data.date) ? n : oldest
        ).data.total_amount) || 0
      : 0;

    // Valor del vehículo que hoy seguís teniendo en mano (ganancia "en papel"
    // aunque todavía no se vendió): la compra cuyo vehículo NO fue entregado
    // como parte de pago en otra compra, ni vendido en una venta.
    const getVehKey = (chasis, chapa) => (chasis || chapa || '').trim().toUpperCase();

    const givenAwayIds = new Set();
    compraNodes.forEach(n => {
      (n.data.trade_ins || []).forEach(t => {
        const key = getVehKey(t.chasis, t.chapa);
        if (key) givenAwayIds.add(key);
      });
    });

    const soldIds = new Set();
    ventaNodes.forEach(n => {
      const key = getVehKey(n.data.chasis, n.data.chapa);
      if (key) soldIds.add(key);
    });

    let currentHoldingValue = 0;
    compraNodes.forEach(n => {
      const key = getVehKey(n.data.chasis, n.data.chapa);
      if (key && !givenAwayIds.has(key) && !soldIds.has(key)) {
        currentHoldingValue += Number(n.data.total_amount) || 0;
      }
    });

    const totalProfit = totalRevenue + currentHoldingValue - totalInvestment - totalCommission;
    return {
      totalProfit,
      totalInvestment,
      totalRevenue,
      tradeInCount,
      unsoldTradeInValue,
      unsoldTradeInCount,
      currentHoldingValue,
      totalCommission,
      status: totalProfit >= 0 ? 'ganancia' : 'perdida'
    };
  },

  /**
   * Rendimiento por árbol (cadena comercial).
   * Agrupa TODAS las operaciones en árboles conectados (por vehículo compartido
   * y por parent_id) y calcula, con la misma lógica que getTreeStats, la
   * inversión / ingresos / utilidad de cada cadena. Devuelve la lista ordenada
   * por utilidad y un resumen agregado. Es "global" (histórico completo).
   */
  getTreesOverview: (allOperations) => {
    const ops = Array.isArray(allOperations) ? allOperations : [];
    if (ops.length === 0) return { trees: [], totalTrees: 0, profitable: 0, losing: 0, aggregateProfit: 0 };

    const norm = (v) => ((v && (v.chasis || v.chapa)) || '').replace(/\s+/g, '').toUpperCase();
    const parseDate = (d) => {
      if (!d) return new Date(0);
      const parts = d.toString().split(/[-/]/).map(Number);
      if (parts.length === 3) {
        if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2]); // YYYY-MM-DD
        return new Date(parts[2], parts[1] - 1, parts[0]); // DD-MM-YYYY
      }
      const p = new Date(d);
      return isNaN(p.getTime()) ? new Date(0) : p;
    };

    // Union-Find para agrupar operaciones en cadenas conectadas.
    const idIndex = new Map();
    ops.forEach((op, i) => idIndex.set(op.id, i));
    const parent = ops.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    // Unir operaciones que comparten un mismo vehículo (por chasis/chapa)…
    const vehToOps = new Map();
    ops.forEach((op, i) => {
      (op.vehicles || []).forEach(v => {
        const id = norm(v);
        if (!id) return;
        if (!vehToOps.has(id)) vehToOps.set(id, []);
        vehToOps.get(id).push(i);
      });
    });
    vehToOps.forEach(list => { for (let k = 1; k < list.length; k++) union(list[0], list[k]); });
    // …y las enlazadas por parent_id.
    ops.forEach((op, i) => {
      const pid = op.parent_id || op.parentId;
      if (pid && idIndex.has(pid)) union(i, idIndex.get(pid));
    });

    const groups = new Map();
    ops.forEach((op, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(op);
    });

    const trees = [];
    groups.forEach(groupOps => {
      let totalRevenue = 0, totalCommission = 0, ventasCount = 0, comprasCount = 0;
      const compras = [];
      groupOps.forEach(op => {
        const type = (op.operation_type || '').toLowerCase();
        const amount = Number(op.total_amount) || 0;
        if (type === 'venta') {
          ventasCount++;
          const tradeInReceived = (op.vehicles || []).filter(v => v && v.role === 'parte_pago').reduce((s, t) => s + (Number(t.valuation) || 0), 0);
          totalRevenue += amount - tradeInReceived;
          totalCommission += amount * financials.COMMISSION_RATE;
        } else if (type === 'compra') {
          comprasCount++;
          compras.push(op);
        }
      });

      // Inversión = la COMPRA más antigua de la cadena (la entrada real de capital).
      const oldestCompra = compras.length
        ? compras.reduce((o, n) => (parseDate(n.date) < parseDate(o.date) ? n : o))
        : null;
      const totalInvestment = oldestCompra ? (Number(oldestCompra.total_amount) || 0) : 0;

      // Valor "en mano": compras cuyo vehículo no se entregó ni se vendió aún.
      const givenAway = new Set();
      compras.forEach(op => (op.vehicles || []).filter(v => v && v.role === 'parte_pago').forEach(t => { const k = norm(t); if (k) givenAway.add(k); }));
      const sold = new Set();
      groupOps.filter(op => (op.operation_type || '').toLowerCase() === 'venta').forEach(op => {
        const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
        const k = norm(principal); if (k) sold.add(k);
      });
      let holding = 0;
      compras.forEach(op => {
        const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
        const k = norm(principal);
        if (k && !givenAway.has(k) && !sold.has(k)) holding += Number(op.total_amount) || 0;
      });

      const totalProfit = totalRevenue + holding - totalInvestment - totalCommission;

      const labelOp = oldestCompra || groupOps[0];
      const labelPrincipal = (labelOp.vehicles || []).find(v => v && v.role === 'principal') || labelOp.vehicles?.[0] || {};
      const label = labelPrincipal.description || labelPrincipal.chapa || labelPrincipal.chasis || 'Sin vehículo';
      const chapa = labelPrincipal.chapa || labelPrincipal.chasis || '';
      const times = groupOps.map(o => parseDate(o.date).getTime()).filter(t => t > 0);

      trees.push({
        id: labelOp.id,
        label, chapa,
        opsCount: groupOps.length,
        ventasCount, comprasCount,
        totalInvestment, totalRevenue, holding, totalProfit,
        status: totalProfit >= 0 ? 'ganancia' : 'perdida',
        firstTime: times.length ? Math.min(...times) : 0,
        lastTime: times.length ? Math.max(...times) : 0,
        vehicleId: (labelPrincipal.chasis || labelPrincipal.chapa || '').trim()
      });
    });

    trees.sort((a, b) => b.totalProfit - a.totalProfit);

    return {
      trees,
      totalTrees: trees.length,
      profitable: trees.filter(t => t.status === 'ganancia').length,
      losing: trees.filter(t => t.status === 'perdida').length,
      aggregateProfit: trees.reduce((s, t) => s + t.totalProfit, 0)
    };
  },

  /**
   * Aggregates global operations for the StatsDashboard.
   * Returns a timeline organized by Month and payment distribution.
   * @param {Array} allOperations - Used for the broad timeline (Annual context)
   * @param {Array} filteredOperations - Used for the summary cards
   */
  getGlobalMetrics: (allOperations, filteredOperations) => {
    const monthlyData = {};
    const paymentDistribution = { 'Contado': 0, 'Crédito': 0, 'Canje': 0 };
    
    const parseDateHelper = (d) => {
      if (!d) return new Date(0);
      const parts = d.toString().split(/[-/]/).map(Number);
      if (parts.length === 3) {
        // YYYY-MM-DD
        if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2]);
        // DD-MM-YYYY
        return new Date(parts[2], parts[1] - 1, parts[0]);
      }
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    };

    // 1. Calculate Timeline (Annual context from allOperations)
    // We'll show the last 12 months of activity to provide a broad "annual" view
    const sortedAll = [...allOperations].sort((a, b) => parseDateHelper(a.date) - parseDateHelper(b.date));
    
    // To keep it "Annual", we'll focus on the year of the latest filtered operation
    const latestFilteredDate = filteredOperations.length > 0 
      ? parseDateHelper(filteredOperations[filteredOperations.length - 1].date)
      : new Date();
    const targetYear = latestFilteredDate.getFullYear();

    sortedAll.forEach(op => {
      const date = parseDateHelper(op.date);
      if (date.getFullYear() !== targetYear) return; // Keep "Annual" to the relevant year

      const monthIndex = date.getMonth();
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthLabel = `${monthNames[monthIndex]} ${targetYear}`;

      if (!monthlyData[monthLabel]) {
        monthlyData[monthLabel] = { name: monthLabel, ventas: 0, compras: 0, profit: 0, monthNum: monthIndex };
      }

      const amount = Number(op.total_amount) || 0;
      if (op.operation_type === 'venta') {
        monthlyData[monthLabel].ventas += amount;
      } else if (op.operation_type === 'compra') {
        monthlyData[monthLabel].compras += amount;
      }
      monthlyData[monthLabel].profit = monthlyData[monthLabel].ventas - monthlyData[monthLabel].compras;
    });

    // 2. Calculate Summary and Payments (from filteredOperations only)
    let filteredSales = 0;
    let filteredPurchases = 0;
    let salesCount = 0;
    let purchasesCount = 0;
    let totalCommission = 0;
    let totalCredit = 0;      // Monto de crédito otorgado en ventas
    let totalDelivery = 0;    // Entrega contado recibida en ventas
    let creditSalesCount = 0;
    const sellerMap = {};     // asesor -> { count, volume }

    filteredOperations.forEach(op => {
      const amount = Number(op.total_amount) || 0;
      const isVenta = op.operation_type === 'venta';
      const isCompra = op.operation_type === 'compra';

      if (isVenta) {
        filteredSales += amount;
        salesCount++;
        totalCommission += amount * financials.COMMISSION_RATE;
        totalCredit += Number(op.credit_amount) || 0;
        totalDelivery += Number(op.delivery_amount) || 0;
        if ((Number(op.installments) || 0) > 0) creditSalesCount++;

        const seller = (op.seller_name || '').trim();
        if (seller) {
          if (!sellerMap[seller]) sellerMap[seller] = { name: seller, count: 0, volume: 0 };
          sellerMap[seller].count++;
          sellerMap[seller].volume += amount;
        }
      } else if (isCompra) {
        filteredPurchases += amount;
        purchasesCount++;
      }

      const tradeInCount = (op.vehicles || []).filter(v => v.role === 'parte_pago').length;
      if (tradeInCount > 0) {
        paymentDistribution['Canje']++;
      } else {
        const type = (op.payment_type || 'contado').toLowerCase();
        if (type.includes('crédito') || type.includes('credito')) paymentDistribution['Crédito']++;
        else paymentDistribution['Contado']++;
      }
    });

    const timeline = Object.values(monthlyData).sort((a, b) => a.monthNum - b.monthNum);
    const netProfit = filteredSales - filteredPurchases;
    const sellers = Object.values(sellerMap).sort((a, b) => b.volume - a.volume);

    return {
      timeline,
      paymentMethods: Object.entries(paymentDistribution).map(([name, value]) => ({ name, value })),
      sellers,
      summary: {
        totalSales: filteredSales,
        totalPurchases: filteredPurchases,
        netProfit,
        salesCount,
        purchasesCount,
        avgTicket: salesCount > 0 ? filteredSales / salesCount : 0,
        totalCommission,
        netAfterCommission: netProfit - totalCommission,
        totalCredit,
        totalDelivery,
        creditSalesCount,
        contadoSalesCount: salesCount - creditSalesCount
      }
    };
  }
};
