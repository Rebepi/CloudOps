exports.up = (pgm) => {
  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true },
    name: { type: 'text', notNull: true },
    client_name: { type: 'text' },
    description: { type: 'text', notNull: true, default: '' },
    application_type: { type: 'text', notNull: true },
    environment: { type: 'text', notNull: true, default: 'Sandbox' },
    region: { type: 'text', notNull: true, default: 'us-east-1' },
    status: { type: 'text', notNull: true, default: 'active' },
    technology_stack: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    source_mode: { type: 'text', notNull: true, default: 'none' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('security_assessments', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    assessment_type: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    region: { type: 'text', notNull: true },
    score: { type: 'integer' },
    coverage: { type: 'integer', notNull: true, default: 0 },
    confidence: { type: 'text', notNull: true, default: 'low' },
    summary: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    error_message: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });

  pgm.createTable('security_findings', {
    id: { type: 'uuid', primaryKey: true },
    assessment_id: { type: 'uuid', notNull: true, references: 'security_assessments', onDelete: 'CASCADE' },
    external_id: { type: 'text' },
    source: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'open' },
    resource: { type: 'text' },
    recommendation: { type: 'text', notNull: true },
    evidence: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addColumns('proposals', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'SET NULL' },
  });
  pgm.addColumns('cost_items', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'SET NULL' },
  });

  pgm.createIndex('security_assessments', ['project_id', 'started_at']);
  pgm.createIndex('security_findings', ['assessment_id', 'severity']);
  pgm.createIndex('proposals', 'project_id');
  pgm.createIndex('cost_items', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('cost_items', ['project_id']);
  pgm.dropColumns('proposals', ['project_id']);
  pgm.dropTable('security_findings');
  pgm.dropTable('security_assessments');
  pgm.dropTable('projects');
};
