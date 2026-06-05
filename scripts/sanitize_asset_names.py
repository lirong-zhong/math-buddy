import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "data" / "parsed"
ASSET_DIR = PARSED_DIR / "assets"

SAFE_RE = re.compile(r"^[a-zA-Z0-9._/-]+$")


def safe_name(index, path):
    suffix = path.suffix.lower() or ".png"
    return f"asset_{index:04d}{suffix}"


def build_mapping():
    files = sorted([p for p in ASSET_DIR.glob("*") if p.is_file()], key=lambda p: p.name)
    mapping = {}
    used = set()
    for index, path in enumerate(files, 1):
        if SAFE_RE.match(path.name) and path.name.startswith("asset_"):
            used.add(path.name)
            continue
        name = safe_name(index, path)
        while name in used:
            index += 1
            name = safe_name(index, path)
        used.add(name)
        mapping[path.name] = name
    return mapping


def rename_files(mapping):
    temp_suffix = ".renaming"
    for old, new in mapping.items():
        old_path = ASSET_DIR / old
        temp_path = ASSET_DIR / f"{new}{temp_suffix}"
        old_path.rename(temp_path)
    for old, new in mapping.items():
        temp_path = ASSET_DIR / f"{new}{temp_suffix}"
        temp_path.rename(ASSET_DIR / new)


def update_references(mapping):
    text_files = [
        *PARSED_DIR.glob("*.json"),
        *PARSED_DIR.glob("*.sql"),
    ]
    replacements = {
        f"data/parsed/assets/{old}": f"data/parsed/assets/{new}"
        for old, new in mapping.items()
    }
    for path in text_files:
        text = path.read_text(encoding="utf-8")
        original = text
        for old_ref, new_ref in replacements.items():
            text = text.replace(old_ref, new_ref)
        if text != original:
            path.write_text(text, encoding="utf-8")


def verify():
    unsafe_files = [p.name for p in ASSET_DIR.glob("*") if p.is_file() and not SAFE_RE.match(p.name)]
    refs_missing = []
    for path in PARSED_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        stack = [data]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                if isinstance(item.get("path"), str) and item["path"].startswith("data/parsed/assets/"):
                    asset = ROOT / item["path"]
                    if not asset.exists():
                        refs_missing.append((str(path.relative_to(ROOT)), item["path"]))
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    return unsafe_files, refs_missing


def main():
    if not ASSET_DIR.exists():
        raise SystemExit(f"Missing assets dir: {ASSET_DIR}")
    mapping = build_mapping()
    if mapping:
        rename_files(mapping)
        update_references(mapping)
    unsafe_files, refs_missing = verify()
    result = {
        "renamed": len(mapping),
        "assets": len([p for p in ASSET_DIR.glob("*") if p.is_file()]),
        "unsafe_files": unsafe_files,
        "missing_references": refs_missing[:20],
        "missing_reference_count": len(refs_missing),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if unsafe_files or refs_missing:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
