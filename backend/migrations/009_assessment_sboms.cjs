exports.up = (pgm) => {
  pgm.createTable('assessment_sboms', {
    assessment_id: { type: 'uuid', primaryKey: true, references: 'security_assessments', onDelete: 'CASCADE' },
    format: { type: 'text', notNull: true },
    spec_version: { type: 'text', notNull: true },
    sha256: { type: 'text', notNull: true },
    content: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => { pgm.dropTable('assessment_sboms'); };
