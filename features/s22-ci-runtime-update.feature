# CI runtime update: Memento plan node f3bf9398 / scenario set d0323f7a
# User request 2026-11-01: "let's update github". CI run 41354343188 warned that an action
# (upload-artifact inside upload-pages-artifact@v4) targets the deprecated Node.js 20 runtime, and
# that ubuntu-latest moves to Ubuntu 26.04 between 2026-10-19 and 2026-11-19.
# Researched: checkout v7.0.1, setup-node v7.1.0 and deploy-pages v5.0.1 declare runs.using node24;
# upload-pages-artifact v5.0.0 uses upload-artifact v7.0.0; Playwright 1.64 ships ubuntu26.04-x64 builds.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: CI runs on current GitHub runtimes
  As the app's owner,
  I need the test-and-deploy workflow on supported GitHub runtimes
  so that a deprecation never turns into a surprise red build or a stalled deploy.

  # --- Workflow ---

  @happy-path
  Scenario: Every action is on its Node.js 24 major version
    When I read .github/workflows/deploy.yml
    Then it uses actions/checkout@v7, actions/setup-node@v7, actions/upload-pages-artifact@v5 and actions/deploy-pages@v5, and no other action

  @happy-path
  Scenario: Both jobs run on Ubuntu 26.04 deliberately
    When I read .github/workflows/deploy.yml
    Then the "test" and "deploy" jobs both say runs-on: ubuntu-26.04 and neither says ubuntu-latest

  @happy-path
  Scenario: A push to main still tests and then deploys
    When the update is pushed to main
    Then the "test" job and the "deploy" job both conclude "success" and the live app at https://finn27-maker.github.io/habit-tracker/ is the new build

  @integration
  Scenario: Playwright's browsers install on Ubuntu 26.04
    When the "test" job runs "npx playwright install --with-deps webkit chromium"
    Then the step concludes "success" and the e2e step runs every test on iphone-webkit and chromium

  @integration
  Scenario: The Pages artifact still reaches deploy-pages
    When upload-pages-artifact@v5 uploads dist and deploy-pages@v5 publishes it
    Then the deploy job's page_url output is https://finn27-maker.github.io/habit-tracker/

  # --- Warnings ---

  @regression
  Scenario: The Node.js 20 deprecation warning is gone
    When the run finishes
    Then the test job's annotations contain no message mentioning "Node.js 20"

  @regression
  Scenario: The Ubuntu migration notice is gone
    When the run finishes
    Then the test job's annotations contain no message mentioning "ubuntu-latest"

  # --- Edge cases and errors ---

  @edge-case
  Scenario: Pull requests still test without deploying
    When a pull request runs the workflow
    Then the "deploy" job is skipped and the "test" job runs every step

  @edge-case
  Scenario: Hidden files stay out of the Pages artifact
    Given upload-pages-artifact@v5 leaves include-hidden-files at its default of false
    Then dist is published exactly as before, with no dotfiles added

  @error
  Scenario: A failing step still blocks the deploy
    Given any test step fails on Ubuntu 26.04
    Then the "deploy" job is skipped and the live app keeps the previous build

  # --- Security and performance ---

  @security
  Scenario: Permissions stay least-privilege
    When I read .github/workflows/deploy.yml
    Then the workflow keeps permissions contents: read, and only the deploy job has pages: write and id-token: write

  @performance
  Scenario: The pipeline is not slower on the new runner
    When the run finishes
    Then the Playwright summary reports a duration under 5 minutes, against 1.8 minutes on the previous runner

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the workflow change
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then no file under src/ changes in this update

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the only changed file outside features/ is .github/workflows/deploy.yml

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
