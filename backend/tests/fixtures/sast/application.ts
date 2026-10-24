function unsafeSql(req: any, db: any) {
  const value = req.query.name;
  db.query("SELECT * FROM users WHERE name = '" + value + "'");
}

function safeSql(req: any, db: any) {
  db.query("SELECT * FROM users WHERE name = ?", [req.query.name]);
}
