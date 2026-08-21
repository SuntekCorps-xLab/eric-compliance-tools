# Recommended repository settings

Repository administrators should configure these controls after the GitHub repository is created:

- set `main` as the default branch;
- require a pull request and at least one approval from an ERiC maintainer;
- require the `CI / quality`, `CI / browser`, and `CodeQL` checks;
- dismiss stale approvals after new commits;
- require conversation resolution;
- block force pushes and branch deletion;
- enable private vulnerability reporting, secret scanning, push protection, and Dependabot alerts;
- create or select the ERiC maintainer team, then add a valid `.github/CODEOWNERS` entry;
- allow automatic deletion of merged branches;
- use signed commits or vigilant mode where organization policy requires it.

These are administrator actions and are not considered enabled merely because this document exists.
