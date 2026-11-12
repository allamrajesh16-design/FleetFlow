# Contributing to FleetFlow

Thank you for contributing to FleetFlow! To ensure security, quality, and maintainability, please adhere to these guidelines.

## Branching Model
- `main`: Production-ready code, tagged with releases.
- `develop`: Primary integration branch for active development.
- Feature branches: `feature/your-feature-name` branched off `develop`.
- Hotfix branches: `hotfix/issue-description` branched off `main`.

## Development Guidelines
1. **Never commit secrets**: Verify that `.env`, `.pem`, and credentials are never staged or committed. Run `python scripts/scan_secrets.py` before committing.
2. **Follow Scope Locks**: Any architectural or security enhancements must not break existing user interfaces or regressions.
3. **Run All Tests**: Before opening a PR, ensure all tests pass:
   ```powershell
   .\scripts\test_all.ps1
   ```
4. **Code Quality**:
   - Backend: Python 3.12, PEP8 compliant, Type annotations where possible.
   - Frontend: React 18, WCAG 2.1 AA accessibility standards, zero serious/critical axe issues.

## Submitting Pull Requests
- Use the provided PR template.
- Link relevant issues and detail testing evidence.
- Request review from project maintainers.

