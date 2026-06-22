/**
 * Financial analysis logic for the Vehicle Tracking System.
 * Calculates realized and estimated profit across commercial chains.
 */

export const financials = {
  /**
   * Calculates total profit for an entire lineage (tree).
   * Logic: Sum of all Sales - Sum of all Initial Purchases
   */
  getTreeStats: (traceabilityData) => {
    const { nodes } = traceabilityData;
    if (!nodes || nodes.length === 0) {
      return { totalProfit: 0, tradeInCount: 0, totalInvestment: 0, totalRevenue: 0, unsoldTradeInValue: 0, unsoldTradeInCount: 0 };
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

    nodes.forEach(node => {
      const { operation_type, total_amount, trade_ins } = node.data;
      const amount = Number(total_amount) || 0;

      if (operation_type === 'venta') {
        totalRevenue += amount;
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

    const totalProfit = totalRevenue + currentHoldingValue - totalInvestment;
    return {
      totalProfit,
      totalInvestment,
      totalRevenue,
      tradeInCount,
      unsoldTradeInValue,
      unsoldTradeInCount,
      currentHoldingValue,
      status: totalProfit >= 0 ? 'ganancia' : 'perdida'
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

    filteredOperations.forEach(op => {
      const amount = Number(op.total_amount) || 0;
      if (op.operation_type === 'venta') filteredSales += amount;
      else if (op.operation_type === 'compra') filteredPurchases += amount;

      const tradeInCount = (op.vehicles || []).filter(v => v.role === 'parte_pago').length;
      if (tradeInCount > 0) {
        paymentDistribution['Canje']++;
      } else {
        const type = (op.payment_type || 'contado').toLowerCase();
        if (type.includes('crédito')) paymentDistribution['Crédito']++;
        else paymentDistribution['Contado']++;
      }
    });

    const timeline = Object.values(monthlyData).sort((a, b) => a.monthNum - b.monthNum);

    return {
      timeline,
      paymentMethods: Object.entries(paymentDistribution).map(([name, value]) => ({ name, value })),
      summary: {
        totalSales: filteredSales,
        totalPurchases: filteredPurchases,
        netProfit: filteredSales - filteredPurchases
      }
    };
  }
};
