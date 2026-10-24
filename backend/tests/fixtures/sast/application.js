function unsafeSql(req, db) {
  const name = req.query.name;
  const sql = "SELECT * FROM users WHERE name = '" + name + "'";
  db.query(sql);
}

function safeSql(req, db) {
  db.query("SELECT * FROM users WHERE name = ?", [req.query.name]);
}

function unsafeCommand(req) {
  const value = req.query.command;
  exec("echo " + value);
}

function unsafeHtml(req, res) {
  res.send("<div>" + req.query.name + "</div>");
}

function unsafeHttp(req) {
  fetch(req.query.url);
}
