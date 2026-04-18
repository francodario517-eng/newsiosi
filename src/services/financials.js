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
    if (!nodes || nodes.length === 0) return { totalProfit: 0, tradeInCount: 0 };

    let totalRevenue = 0;
    let totalInvestment = 0;
    let tradeInCount = 0;

    nodes.forEach(node => {
      const { operation_type, total_amount, trade_ins } = node.data;
      const amount = Number(total_amount) || 0;
      
      if (operation_type === 'venta') {
        totalRevenue += amount;
        if (trade_ins) tradeInCount += trade_ins.length;
      } else if (operation_type === 'compra') {
        totalInvestment += amount;
      }
    });

    const totalProfit = totalRevenue - totalInvestment;
    return {
      totalProfit,
      totalInvestment,
      totalRevenue,
      tradeInCount,
      status: totalProfit >= 0 ? 'ganancia' : 'perdida'
    };
  },

  /**
   * Aggregates global operations for the StatsDashboard.
   * Returns a timeline organized by Month and payment distribution.
   */
  getGlobalMetrics: (operations) => {
    const monthlyData = {};
    const paymentDistribution = { 'Contado': 0, 'Crédito': 0, 'Canje': 0 };
    const stockStats = { totalValue: 0, count: 0 };
    
    // Sort operations by date to ensure chronological timeline
    const sortedOps = [...operations].sort((a, b) => {
      const parseDate = (d) => {
        if (!d) return new Date(0);
        const parts = d.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) return new Date(parts[0], parts[1] - 1, parts[2]);
          return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(d);
      };
      return parseDate(a.date) - parseDate(b.date);
    });

    sortedOps.forEach(op => {
      // 1. Month grouping
      const dateStr = op.date || '';
      const parts = dateStr.split(/[-/]/);
      let monthLabel = 'N/A';
      
      if (parts.length === 3) {
        // Handle DD/MM/YYYY or YYYY-MM-DD
        const monthIndex = parts[0].length === 4 ? parseInt(parts[1]) - 1 : parseInt(parts[1]) - 1;
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        monthLabel = `${monthNames[monthIndex]} ${year}`;
      }

      if (!monthlyData[monthLabel]) {
        monthlyData[monthLabel] = { name: monthLabel, ventas: 0, compras: 0, profit: 0 };
      }

      const amount = Number(op.total_amount) || 0;
      if (op.operation_type === 'venta') {
        monthlyData[monthLabel].ventas += amount;
      } else if (op.operation_type === 'compra') {
        monthlyData[monthLabel].compras += amount;
      }
      
      // Calculate instantaneous profit for the chart
      monthlyData[monthLabel].profit = monthlyData[monthLabel].ventas - monthlyData[monthLabel].compras;

      // 2. Payment Distribution
      const tradeInCount = (op.vehicles || []).filter(v => v.role === 'parte_pago').length;
      if (tradeInCount > 0) {
        paymentDistribution['Canje']++;
      } else {
        const type = (op.payment_type || 'contado').toLowerCase();
        if (type.includes('crédito')) paymentDistribution['Crédito']++;
        else paymentDistribution['Contado']++;
      }
    });

    // Convert monthlyData object to sorted array for Recharts
    const timeline = Object.values(monthlyData);

    return {
      timeline,
      paymentMethods: Object.entries(paymentDistribution).map(([name, value]) => ({ name, value })),
      summary: {
        totalSales: timeline.reduce((sum, m) => sum + m.ventas, 0),
        totalPurchases: timeline.reduce((sum, m) => sum + m.compras, 0),
        netProfit: timeline.reduce((sum, m) => sum + m.ventas - m.compras, 0)
      }
    };
  }
};
