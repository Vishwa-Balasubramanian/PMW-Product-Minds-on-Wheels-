import Database from 'better-sqlite3';
import path from 'node:path';

// The smoke suite may challenge requirements. Always work on a dedicated copy.
const source = path.resolve('..', 'db', 'pmw.sqlite');
const destination = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
  console.log('Prepared isolated smoke-test database.');
} finally {
  db.close();
}
