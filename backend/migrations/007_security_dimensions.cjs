exports.up = (pgm) => {
  pgm.addColumns('security_findings', {
    dimension: { type: 'text' },
  });

  pgm.addColumns('security_assessments', {
    dimension_scores: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    control_results: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    engine_version: { type: 'text', notNull: true, default: '1.0.0' },
  });

  pgm.createTable('assessment_analyzers', {
    id: { type: 'uuid', primaryKey: true },
    assessment_id: { type: 'uuid', notNull: true, references: 'security_assessments', onDelete: 'CASCADE' },
    analyzer_id: { type: 'text', notNull: true },
    dimension: { type: 'text', notNull: true },
    state: { type: 'text', notNull: true },
    items_analyzed: { type: 'integer', notNull: true, default: 0 },
    findings_count: { type: 'integer', notNull: true, default: 0 },
    error: { type: 'text' },
    detail: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('security_findings', ['assessment_id', 'dimension']);
  pgm.createIndex('assessment_analyzers', ['assessment_id']);
  pgm.createIndex('assessment_analyzers', ['dimension']);
};

exports.down = (pgm) => {
  pgm.dropTable('assessment_analyzers');
  pgm.dropColumns('security_assessments', ['dimension_scores', 'control_results', 'engine_version']);
  pgm.dropColumns('security_findings', ['dimension']);
};
