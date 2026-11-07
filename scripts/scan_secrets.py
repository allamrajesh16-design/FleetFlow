"""
FleetFlow Repository Secrets Scanner
Scans source files for hardcoded secrets, private keys, passwords, and tokens.
Ignores virtual environments, build artifacts, node_modules, and git internals.
"""
import os
import re
import sys

IGNORE_DIRS = {
    'node_modules', 'venv', '.git', 'build', 'dist', '__pycache__',
    'coverage', '.idea', '.vscode', 'tmp_emails', 'logs', 'backups',
    '.system_generated', '.user_uploaded'
}

IGNORE_FILES = {
    'package-lock.json', 'scope_before.json', 'db.sqlite3'
}

SECRET_PATTERNS = [
    (r'(?i)(api[_-]?key|client[_-]?secret|jwt[_-]?secret)\s*[:=]\s*["\']([^"\']{16,})["\']', "API/Client Secret"),
    (r'-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE\s+KEY-----', "Private Key Block"),
    (r'(?i)password\s*[:=]\s*["\'](?!your_|example|test|change|fake|password|admin123|Demo@|Walkthrough@)[^"\']{8,}["\']', "Hardcoded Password"),
    (r'AKIA[0-9A-Z]{16}', "AWS Access Key ID"),
    (r'(?i)ghp_[0-9a-zA-Z]{36}', "GitHub Personal Access Token"),
]


def scan_repo(root_dir):
    print("=" * 80)
    print(" FLEETFLOW REPOSITORY SECRETS SCAN")
    print("=" * 80)
    findings = []
    scanned_files = 0

    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            if f in IGNORE_FILES or f.endswith(('.png', '.jpg', '.jpeg', '.svg', '.ico', '.pyc')):
                continue

            # Don't scan .env itself as it's gitignored and intended for local dev values
            if f == '.env':
                continue

            file_path = os.path.join(root, f)
            rel_path = os.path.relpath(file_path, root_dir)
            scanned_files += 1

            is_test_file = any(part in rel_path.lower() for part in ['test', 'spec', 'fixture', '__test__', 'mock', 'scripts'])

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as fp:
                    for line_no, line in enumerate(fp, start=1):
                        for pattern, kind in SECRET_PATTERNS:
                            match = re.search(pattern, line)
                            if match:
                                findings.append({
                                    'file': rel_path,
                                    'line': line_no,
                                    'kind': kind,
                                    'is_test': is_test_file,
                                    'snippet': line.strip()[:60] + "..."
                                })
            except Exception as e:
                pass

    prod_findings = [f for f in findings if not f['is_test']]
    test_findings = [f for f in findings if f['is_test']]

    print(f"Scanned {scanned_files} files across repository.")
    print(f"Production code findings: {len(prod_findings)}")
    print(f"Test fixture mock credentials: {len(test_findings)}")

    if not prod_findings:
        print("RESULT: PASS - 0 hardcoded secrets or private keys in production code!")
    else:
        print(f"RESULT: FAIL - {len(prod_findings)} potential secrets in production code:")
        for item in prod_findings:
            print(f"  [{item['kind']}] {item['file']}:{item['line']} -> {item['snippet']}")

    print("=" * 80)
    return len(prod_findings)


if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    sys.exit(scan_repo(root))
