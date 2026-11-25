"""Append timer events under an exclusive lock, without rotating or truncating history."""

import fcntl
import json
import os
import sys
from pathlib import Path

LIMIT = 10_000_000


def append(path: Path, events: list[dict], limit: int = LIMIT) -> bool:
    lines = [(json.dumps(event, separators=(',', ':'), ensure_ascii=False) + '\n').encode() for event in events]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('ab', buffering=0) as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        size = os.fstat(stream.fileno()).st_size
        for line in lines:
            if size + len(line) > limit:
                return False

            stream.write(line)
            size += len(line)

    return True


if __name__ == '__main__':
    print('ok' if append(Path(sys.argv[1]), json.loads(sys.argv[2])) else 'full')
