# Notes on habits and goals: Memento plan node a5425eb8 (sub-idea 299fe21b) / scenario set 586a58ba
# User request 2026-10-31: "do notes on habits". Extends s16-todo-notes.feature (to-dos only) to daily
# habits and weekly goals, with the same field, limit, cleaning and look.
# Amends s16 "Habits and weekly goals have no Notes field".
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Saturday 2026-10-31 in America/Chicago.

Feature: Notes on daily habits and weekly goals
  As a habit tracker user,
  I need a short note on each habit and goal
  so that details like "20 minutes, before breakfast" sit right beside it.

  # --- Adding and editing ---

  @happy-path
  Scenario: Add a daily habit with a note
    When I tap "+", choose "Daily habit", type "Meditate" and "20 minutes, before breakfast" in "Notes" and tap "Save"
    Then Today shows "20 minutes, before breakfast" in small grey text under "Meditate"

  @happy-path
  Scenario: Add a weekly goal with a note
    When I add the weekly goal "Peloton ride" with 3 per week and the note "45-minute class"
    Then Today shows "45-minute class" under "Peloton ride"

  @happy-path
  Scenario: Every type shows the Notes field
    When I tap "+" and switch between "To-do", "Daily habit" and "Weekly goal"
    Then the "Notes" field is displayed for each, and what I typed in it stays when I switch

  @happy-path
  Scenario: Edit a habit's note from its page
    Given the daily habit "Meditate" has the note "20 minutes"
    When I open its page, tap "Edit", change "Notes" to "15 minutes, guided" and tap "Save"
    Then its page shows "15 minutes, guided" under the title "Meditate"

  @edge-case
  Scenario: Clearing a habit's note removes it
    Given the daily habit "Meditate" has the note "20 minutes"
    When I clear "Notes" in Edit and tap "Save"
    Then no note is shown for "Meditate" and the stored habit has no note field

  @edge-case
  Scenario: A habit without a note shows no empty line
    Given the daily habit "Stretch" has no note
    When I open Today
    Then the row for "Stretch" has no note text

  @edge-case
  Scenario: The note shows on the list page too
    Given the weekly goal "Peloton ride" in "Health" has the note "45-minute class"
    When I open the "Health" list page
    Then "45-minute class" is shown under "Peloton ride"

  @edge-case
  Scenario: A note stays when a habit becomes a weekly goal
    Given the daily habit "Gym" has the note "legs and back"
    When I change it to a weekly goal with 3 per week
    Then "legs and back" is shown under "Gym"

  @edge-case
  Scenario: A note stays when a to-do becomes a habit
    Given the to-do "Stretch" has the note "hamstrings"
    When I change it to a daily habit and confirm
    Then "hamstrings" is shown under "Stretch" on Today

  @error
  Scenario: A habit note longer than 200 characters is refused in the sheet
    When I add the daily habit "Meditate" with a 201-character note
    Then the sheet stays open with "Notes must be 200 characters or fewer" and nothing is saved

  @error
  Scenario: A habit note that can't be saved is reported
    Given IndexedDB rejects the next write
    When I add the daily habit "Meditate" with a note
    Then the sheet stays open with "Couldn't save. Your phone may be out of storage."

  # --- Accessibility and safety ---

  @custom-accessibility
  Scenario: The habit link keeps its name and is described by the note
    Given the daily habit "Meditate" has the note "20 minutes"
    Then the link named "Meditate details" has the description "20 minutes", and its checkbox is still named "Meditate"

  @security
  Scenario: Habit notes stay plain text
    Given a daily habit has the note "<img src=x onerror=alert(1)>"
    When I open Today and its page
    Then the note shows as text on both and no image element is created

  # --- Backups and performance ---

  @integration
  Scenario: Habit notes come back after a backup and restore
    Given the daily habit "Meditate" has the note "20 minutes"
    When I export a backup and restore it on a fresh install
    Then "Meditate" shows "20 minutes"

  @performance
  Scenario: Today with 100 noted habits opens without a visible wait
    Given 100 daily habits each with a 200-character note
    When I open Today
    Then all 100 notes are visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then saving a habit note goes through the repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then note rules stay in src/domain/items.ts for every type, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
