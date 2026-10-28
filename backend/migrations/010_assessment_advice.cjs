exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE assessment_advice (
    id uuid PRIMARY KEY, assessment_id uuid NOT NULL REFERENCES security_assessments(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'groq', model text NOT NULL, prompt_version text NOT NULL,
    input_sha256 text NOT NULL, content jsonb NOT NULL,
    state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','rejected')),
    created_by uuid NOT NULL REFERENCES users(id), reviewed_by uuid REFERENCES users(id),
    review_note text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
  ); CREATE INDEX ON assessment_advice(assessment_id,created_at DESC);`);
};
exports.down = (pgm) => pgm.dropTable('assessment_advice');
