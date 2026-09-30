exports.up = (pgm) => {
  pgm.createTable('proposals', {
    id: { type: 'uuid', primaryKey: true },
    name: { type: 'text', notNull: true },
    data: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('cost_items', {
    id: { type: 'uuid', primaryKey: true },
    service_id: { type: 'text', notNull: true },
    quantity: { type: 'numeric', notNull: true },
    monthly_hours: { type: 'numeric', notNull: true },
    configuration: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('app_settings', {
    key: { type: 'text', primaryKey: true },
    value: { type: 'jsonb', notNull: true },
  });
  pgm.createTable('aws_cache', {
    key: { type: 'text', primaryKey: true },
    payload: { type: 'jsonb', notNull: true },
    fetched_at: { type: 'timestamptz', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('aws_cache');
  pgm.dropTable('app_settings');
  pgm.dropTable('cost_items');
  pgm.dropTable('proposals');
};
