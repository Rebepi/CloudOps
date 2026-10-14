exports.up = (pgm) => {
  pgm.createTable('project_artifacts', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    original_name: { type: 'text', notNull: true },
    sha256: { type: 'text', notNull: true },
    size_bytes: { type: 'bigint', notNull: true },
    entry_count: { type: 'integer' },
    uncompressed_bytes: { type: 'bigint' },
    status: { type: 'text', notNull: true, default: 'pending' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    uploaded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    scanned_at: { type: 'timestamptz' },
  });

  pgm.addColumns('security_assessments', {
    artifact_id: { type: 'uuid', references: 'project_artifacts', onDelete: 'SET NULL' },
  });

  pgm.createIndex('project_artifacts', ['project_id', 'uploaded_at']);
  pgm.createIndex('project_artifacts', ['project_id', 'sha256']);
  pgm.createIndex('security_assessments', 'artifact_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('security_assessments', ['artifact_id']);
  pgm.dropTable('project_artifacts');
};
