"""Acceptance tests execute the repository checker in disposable Git projects."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


CHECKER = Path(__file__).resolve().parents[2] / "scripts/check_repository.py"
VALID = "---\nname: example\ndescription: A useful skill\n---\n\n# Example\n"


class RepositoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "--quiet")

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.root, check=True, capture_output=True, text=True
        )

    def skill(self, content, tracked=True):
        path = self.root / ".agents/skills/example/SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        if tracked:
            self.git("add", ".agents")

    def run_checker(self):
        return subprocess.run(
            [sys.executable, str(CHECKER)], cwd=self.root,
            capture_output=True, text=True, timeout=10,
        )

    def test_valid_skill_with_extra_metadata_passes(self):
        self.skill(VALID.replace("description:", "metadata:\n  owner: test\ndescription:"))
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Validated 1 skill", result.stdout)

    def test_invalid_metadata_fails_with_file_diagnostic(self):
        for content in (
            "# Missing frontmatter\n",
            "---\nname: [broken\n---\n",
            "---\n- not-a-mapping\n---\n",
            VALID.replace("name: example", "name: other"),
            VALID.replace("A useful skill", '""'),
            VALID.replace("A useful skill", "false"),
            "---\nname: example\ndescription: Missing closing delimiter\n",
        ):
            with self.subTest(content=content):
                self.skill(content)
                result = self.run_checker()
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn(".agents/skills/example/SKILL.md", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_untracked_skills_do_not_satisfy_inventory(self):
        self.skill(VALID, tracked=False)
        result = self.run_checker()
        self.assertEqual(result.returncode, 1)
        self.assertIn("No tracked skills", result.stderr)

    def test_untracked_invalid_skill_does_not_break_valid_inventory(self):
        self.skill(VALID)
        other = self.root / ".agents/skills/local/SKILL.md"
        other.parent.mkdir(parents=True)
        other.write_text("not a skill", encoding="utf-8")
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_changed_line_whitespace_gate_rejects_bad_commit(self):
        self.git("config", "user.name", "CI Test")
        self.git("config", "user.email", "ci-test@example.invalid")
        self.skill(VALID)
        self.git("commit", "--quiet", "-m", "valid baseline")
        base = self.git("rev-parse", "HEAD").stdout.strip()
        self.skill(VALID + "Trailing space \n")
        self.git("commit", "--quiet", "-am", "invalid whitespace")
        result = subprocess.run(
            ["git", "diff", "--check", base, "HEAD"], cwd=self.root,
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("trailing whitespace", result.stdout)

    def test_not_a_git_repository_reports_error(self):
        import shutil
        shutil.rmtree(self.root / ".git")
        result = self.run_checker()
        self.assertEqual(result.returncode, 1)
        self.assertIn("Git", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
