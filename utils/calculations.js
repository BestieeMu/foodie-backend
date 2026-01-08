/**
 * Calculate the price of a single item including options (size, add-ons, extras)
 */
function calcItemPrice(item, choice = {}) {
  let base = Number(item.price);
  
  // Ensure options exist
  const options = item.options || {};
  
  // Size priceDelta
  if (choice.sizeId && Array.isArray(options.sizes)) {
    const found = options.sizes.find((s) => s.id === choice.sizeId);
    if (found) base += Number(found.priceDelta || 0);
  }
  
  // Add-ons
  if (Array.isArray(choice.addOnIds) && Array.isArray(options.addOns)) {
    for (const id of choice.addOnIds) {
      const add = options.addOns.find((a) => a.id === id);
      if (add) base += Number(add.priceDelta || 0);
    }
  }
  
  // Extras
  if (Array.isArray(choice.extraIds) && Array.isArray(options.extras)) {
    for (const id of choice.extraIds) {
      const ex = options.extras.find((e) => e.id === id);
      if (ex) base += Number(ex.priceDelta || 0);
    }
  }
  
  return Number(base.toFixed(2));
}

/**
 * Calculate total order price based on item prices and quantities
 */
function calcOrderTotal(items) {
  if (!Array.isArray(items)) return 0;
  const total = items.reduce((sum, it) => sum + (Number(it.price) * (Number(it.quantity) || 1)), 0);
  return Number(total.toFixed(2));
}

module.exports = {
  calcItemPrice,
  calcOrderTotal
};
