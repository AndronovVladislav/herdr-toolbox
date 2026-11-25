"""Check the Pomodoro event journal in a temporary directory."""

import importlib.util
import json
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'mods/taktik/journal.py'
SPEC = importlib.util.spec_from_file_location('taktik_journal', MODULE)
assert SPEC is not None and SPEC.loader is not None
journal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(journal)


def test_append__events_in_two_batches__preserves_order(tmp_path: Path) -> None:
    """Проверяет дозапись истории. Ожидание: прежние записи сохраняются, новые добавляются по порядку."""
    path = tmp_path / 'data/events.jsonl'
    events = [{'type': 'start', 'at': 1}, {'type': 'pause', 'at': 2}]
    assert journal.append(path, events[:1])
    assert journal.append(path, events[1:])
    assert [json.loads(line) for line in path.read_text().splitlines()] == events


def test_append__exact_limit__rejects_next_line_without_truncation(tmp_path: Path) -> None:
    """Проверяет лимит в байтах. Ожидание: ни обрезанной строки, ни удаления старой записи."""
    path = tmp_path / 'events.jsonl'
    record = {'text': 'Фокус'}
    encoded = (json.dumps(record, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
    assert journal.LIMIT == 10_000_000
    assert not journal.append(path, [record, record], limit=len(encoded))
    assert path.read_bytes() == encoded
