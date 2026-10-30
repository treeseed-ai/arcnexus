"""Validate tracked skill metadata. Run from the repository root."""

from pathlib import Path
import re
import subprocess
import sys

import yaml


def check_skill(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise ValueError("missing closing frontmatter delimiter") from None
    metadata = yaml.safe_load("\n".join(lines[1:end]))
    if not isinstance(metadata, dict):
        raise ValueError("frontmatter must be a mapping")
    name = metadata.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        raise ValueError("name must use lowercase letters, digits, and hyphens")
    if name != path.parent.name:
        raise ValueError("name must match the skill directory")
    description = metadata.get("description")
    if not isinstance(description, str) or not description.strip():
        raise ValueError("description must be a nonempty string")


def main():
    try:
        result = subprocess.run(
            ["git", "ls-files", "-z", "--", ".agents/skills/*/SKILL.md"],
            check=True, capture_output=True, text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Git inventory failed: {error}", file=sys.stderr)
        return 1
    paths = [Path(name) for name in result.stdout.split("\0") if name]
    if not paths:
        print("No tracked skills found", file=sys.stderr)
        return 1
    errors = []
    for path in paths:
        try:
            check_skill(path)
        except (OSError, UnicodeError, ValueError, yaml.YAMLError) as error:
            errors.append(f"{path}: {error}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(paths)} skills")
    return 0


if __name__ == "__main__":
    sys.exit(main())
