import hashlib
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

GITVIEW = Path(__file__).resolve().parents[1] / "integrations/herdr-gitview"
BUNDLE = "herdr-gitview-app-test"


@pytest.fixture
def bundle(tmp_path: Path) -> Path:
    subprocess.run([GITVIEW / "herdr-app/bundle.sh", sys.executable, "test", tmp_path], check=True)
    return tmp_path / f"{BUNDLE}.tar.gz"


def test_bundle__distributable__includes_license_source_and_installer(bundle: Path) -> None:
    """
    Проверяет содержимое архива и контрольную сумму.

    Ожидание: вместе с бинарником и модами доставляются лицензия, ссылка на исходник и установщик.
    """
    checksum = bundle.with_name(bundle.name + ".sha256").read_text().split()[0]
    assert hashlib.sha256(bundle.read_bytes()).hexdigest() == checksum

    with tarfile.open(bundle) as archive:
        for relative in ("LICENSE", "TOOLBOX.md", "install.sh", "herdr-app/install.sh"):
            member = archive.extractfile(f"{BUNDLE}/{relative}")
            assert member is not None
            assert member.read() == (GITVIEW / relative).read_bytes()

        linked = archive.getmember(f"{BUNDLE}/herdr-app/mods/gitview-ask/engine.js")
        assert linked.isfile()
        assert archive.getmember(f"{BUNDLE}/bin/herdr-gitview").mode & 0o111


@pytest.mark.parametrize("checksum_present", [True, False])
def test_install__unverified_bundle__fails_before_installing(bundle: Path, checksum_present: bool) -> None:
    """
    Проверяет защиту от повреждённого или неполного скачивания.

    Ожидание: без верной контрольной суммы установщик не распаковывает архив.
    """
    broken_bundle = bundle.with_name("broken.tar.gz")
    broken_bundle.write_bytes(b"not an archive")

    if checksum_present:
        broken_bundle.with_name(broken_bundle.name + ".sha256").write_bytes(
            bundle.with_name(bundle.name + ".sha256").read_bytes(),
        )

    result = subprocess.run(
        [GITVIEW / "install.sh", "--bundle", broken_bundle],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "nothing installed" in result.stderr
    assert result.stdout == ""
