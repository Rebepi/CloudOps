exports.up = (pgm) => {
  pgm.addColumns('security_findings', {
    fingerprint: { type: 'text' },
    owner: { type: 'text' },
    due_date: { type: 'date' },
    justification: { type: 'text' },
    approved_by: { type: 'text' },
    framework: { type: 'text' },
    first_seen_assessment_id: { type: 'uuid', references: 'security_assessments', onDelete: 'SET NULL' },
    last_seen_assessment_id: { type: 'uuid', references: 'security_assessments', onDelete: 'SET NULL' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('security_finding_events', {
    id: { type: 'uuid', primaryKey: true },
    finding_id: { type: 'uuid', notNull: true, references: 'security_findings', onDelete: 'CASCADE' },
    event_type: { type: 'text', notNull: true },
    from_status: { type: 'text' },
    to_status: { type: 'text' },
    actor: { type: 'text' },
    comment: { type: 'text' },
    justification: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addColumns('security_assessments', {
    methodology_version: { type: 'text', notNull: true, default: '2026.10' },
  });

  pgm.addColumns('projects', {
    repo_provider: { type: 'text' },
    repo_owner: { type: 'text' },
    repo_name: { type: 'text' },
    repo_default_branch: { type: 'text' },
    repo_token_ref: { type: 'text' },
  });

  pgm.createTable('assessment_schedules', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    assessment_type: { type: 'text', notNull: true, default: 'aws-account' },
    cadence: { type: 'text', notNull: true, default: 'weekly' },
    timezone: { type: 'text', notNull: true, default: 'America/Lima' },
    next_run_at: { type: 'timestamptz', notNull: true },
    last_run_at: { type: 'timestamptz' },
    enabled: { type: 'boolean', notNull: true, default: true },
    notify_on: { type: 'text[]', notNull: true, default: pgm.func("'{new_finding,severity_increase,coverage_drop,failure}'::text[]") },
    notify_email: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('assessment_runs', {
    id: { type: 'uuid', primaryKey: true },
    schedule_id: { type: 'uuid', references: 'assessment_schedules', onDelete: 'CASCADE' },
    assessment_id: { type: 'uuid', references: 'security_assessments', onDelete: 'SET NULL' },
    status: { type: 'text', notNull: true, default: 'pending' },
    attempt: { type: 'integer', notNull: true, default: 1 },
    error_message: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });

  pgm.createIndex('security_findings', 'fingerprint');
  pgm.createIndex('security_findings', ['assessment_id', 'status']);
  pgm.createIndex('security_finding_events', ['finding_id', 'created_at']);
  pgm.createIndex('assessment_schedules', ['enabled', 'next_run_at']);
  pgm.createIndex('assessment_runs', ['schedule_id', 'started_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('assessment_runs');
  pgm.dropTable('assessment_schedules');
  pgm.dropColumns('projects', ['repo_provider', 'repo_owner', 'repo_name', 'repo_default_branch', 'repo_token_ref']);
  pgm.dropColumns('security_assessments', ['methodology_version']);
  pgm.dropTable('security_finding_events');
  pgm.dropColumns('security_findings', ['fingerprint', 'owner', 'due_date', 'justification', 'approved_by', 'framework', 'first_seen_assessment_id', 'last_seen_assessment_id', 'updated_at']);
};
