const bcrypt = require('bcryptjs');

exports.up = async (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    nombre: { type: 'text', notNull: true },
    rol: { type: 'text', notNull: true, default: 'super_admin' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('sessions', {
    id: { type: 'text', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });

  // Seed super admin user: renzobendezu51@gmail.com / Admin2026!#
  const passwordHash = bcrypt.hashSync('Admin2026!#', 10);
  pgm.sql(`
    INSERT INTO users (email, password_hash, nombre, rol, is_active)
    VALUES ('renzobendezu51@gmail.com', '${passwordHash}', 'Renzo Bendezú', 'super_admin', true)
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      rol = 'super_admin',
      is_active = true,
      updated_at = now();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('sessions');
  pgm.dropTable('users');
};
