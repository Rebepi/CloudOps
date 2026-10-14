exports.up = (pgm) => {
  pgm.addColumns('cost_items', {
    unit_price: { type: 'numeric' },
    price_unit: { type: 'text' },
    price_sku: { type: 'text' },
    price_service_code: { type: 'text' },
    price_region: { type: 'text' },
    price_observed_at: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('cost_items', ['unit_price', 'price_unit', 'price_sku', 'price_service_code', 'price_region', 'price_observed_at']);
};
