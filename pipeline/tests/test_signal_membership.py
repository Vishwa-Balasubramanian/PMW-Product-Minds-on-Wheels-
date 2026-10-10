import sqlite3
import unittest

from pmw import db, signals


class SignalMembershipTests(unittest.TestCase):
    def test_complete_membership_is_not_the_display_sample(self):
        con = sqlite3.connect(':memory:')
        con.row_factory = sqlite3.Row
        self.addCleanup(con.close)
        con.executescript(db.SCHEMA)
        for i in range(65):
            fid = f'G70-{i:04d}'
            con.execute("INSERT INTO feedback VALUES (?,'G70','Source A','US','US',NULL,'Seat issue',NULL,NULL,1)", (fid,))
            con.executemany("INSERT INTO feedback_labels VALUES (?,?,'Seats',NULL,'bmw')", [(fid, 'Wants'), (fid, 'Defect')])
        signals.build(con, 'G70')
        self.assertEqual(con.execute('SELECT COUNT(*) FROM signal_feedback').fetchone()[0], 65)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM signal_evidence WHERE role='supports'").fetchone()[0], 40)
        self.assertEqual(con.execute('SELECT n_negative FROM signals').fetchone()[0], 65)
