#!/usr/bin/env python3
"""Restore a daily CSV into temporary SQLite and verify it without touching D1."""
import argparse
import csv
import datetime as dt
import json
import sqlite3
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

def verify(path, day):
    date = dt.date.fromisoformat(day)
    zone = ZoneInfo('Europe/Dublin')
    start = int(dt.datetime.combine(date, dt.time(), zone).timestamp())
    end = int(dt.datetime.combine(date + dt.timedelta(days=1), dt.time(), zone).timestamp())
    with path.open(newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        if 'epoch' not in headers or len(headers) != len(set(headers)):
            raise ValueError('CSV needs a unique epoch column and unique field names')
        if len(headers) > 80 or any(not h.replace('_', '').isalnum() for h in headers):
            raise ValueError('Unsupported field names')
        columns = ','.join('"' + h + '" TEXT' for h in headers)
        with tempfile.TemporaryDirectory(prefix='parknacross-restore-') as folder:
            connection = sqlite3.connect(str(Path(folder) / 'restore.sqlite'))
            try:
                connection.execute('CREATE TABLE restored (' + columns + ')')
                count, epochs = 0, set()
                for row in reader:
                    if None in row or any(value is None for value in row.values()):
                        raise ValueError('CSV row has the wrong number of fields')
                    epoch = int(row['epoch'])
                    if epoch in epochs or not start <= epoch < end:
                        raise ValueError('Duplicate epoch or observation outside the backup day')
                    epochs.add(epoch)
                    connection.execute('INSERT INTO restored VALUES (' + ','.join('?' for _ in headers) + ')',
                                       [None if row[h] == '' else row[h] for h in headers])
                    count += 1
                if not count:
                    raise ValueError('The backup contains no observations')
                connection.commit()
                restored = connection.execute('SELECT COUNT(*),MIN(CAST(epoch AS INTEGER)),MAX(CAST(epoch AS INTEGER)) FROM restored').fetchone()
                if restored != (count, min(epochs), max(epochs)):
                    raise ValueError('Restored row counts or timestamps differ from the CSV')
                if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('SQLite integrity check failed')
                slots = len({epoch // 300 for epoch in epochs})
                return {'day': day, 'rows_restored': count, 'first_epoch': min(epochs), 'last_epoch': max(epochs),
                        'actual_slots': slots, 'expected_slots': (end-start)//300,
                        'coverage_percent': round(100*slots/((end-start)//300), 1),
                        'integrity': 'ok', 'production_modified': False}
            finally:
                connection.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--day', required=True, help='Irish calendar date, YYYY-MM-DD')
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.csv, args.day), indent=2))
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, 'Backup verification failed: ' + str(error) + '\n')
