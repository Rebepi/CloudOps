const { db } = require('../dist/db.js');

async function main() {
  const penalties = { CRITICAL: 20, HIGH: 12, MEDIUM: 6, LOW: 2, INFORMATIONAL: 0 };
  const assessments = await db.query('SELECT id, score FROM security_assessments');
  console.log(`Checking ${assessments.rows.length} assessments...`);

  for (const a of assessments.rows) {
    const fRes = await db.query('SELECT severity, category FROM security_findings WHERE assessment_id = $1', [a.id]);
    const rawSum = fRes.rows.reduce((sum, f) => sum + (f.category === 'coverage' ? 0 : (penalties[f.severity] || 0)), 0);
    
    let calculatedScore;
    if (fRes.rows.length === 0) {
      calculatedScore = 100;
    } else if (rawSum <= 50) {
      calculatedScore = Math.max(0, 100 - rawSum);
    } else {
      const excess = rawSum - 50;
      calculatedScore = Math.max(5, Math.round(50 / (1 + excess / 180)));
    }

    if (a.score === 0 || a.score !== calculatedScore) {
      console.log(`Updating assessment ${a.id}: oldScore=${a.score} -> newScore=${calculatedScore} (findings: ${fRes.rows.length}, rawSum: ${rawSum})`);
      await db.query('UPDATE security_assessments SET score = $1 WHERE id = $2', [calculatedScore, a.id]);
    }
  }

  console.log('Successfully recalculated all assessment scores!');
  await db.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
