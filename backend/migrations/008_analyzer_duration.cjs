exports.up = (pgm) => {
  pgm.addColumns('assessment_analyzers', {
    duration_ms: { type: 'integer' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('assessment_analyzers', ['duration_ms']);
};
