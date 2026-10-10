import { DatabaseSync, backup } from 'node:sqlite';
import path from 'node:path';

// The smoke suite may challenge requirements. Always work on a dedicated copy.
const source = path.resolve('..', 'db', 'pmw.sqlite');
const destination = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  console.log('Prepared isolated smoke-test database.');
} finally {
  db.close();
}
