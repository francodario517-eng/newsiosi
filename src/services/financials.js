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
  }
};
