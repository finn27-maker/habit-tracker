# Backup nudge: Memento plan node c3ea44fc (follow-up of S7) / scenario set 1a37c45d
# User request 2026-10-12: "add automatic iCloud backups". iOS home-screen web apps cannot run in
# the background, cannot write to iCloud Drive without a share-sheet tap, and have no iCloud access
# short of CloudKit (paid developer account, Apple ID sign-in, data leaving the phone). The user
# chose a one-tap reminder, weekly.
# Supersedes s7-backup.feature's reminder timing: 30 days becomes 7, and "Not now" hides for 1 day
# instead of 7. The card now also shows on Today.
# Today is Monday 2026-10-12 in America/Chicago.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Weekly one-tap backup nudge
  As a habit tracker user,
  I need a "Back up now" card on Today when my last backup is over a week old
  so that my copy in iCloud Drive is never more than about a week behind, with one tap and a Save.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Monday "2026-10-12"
    And I have at least one habit

  # --- When the card shows ---

  @happy-path
  Scenario: The card appears on Today after more than 7 days
    Given my last backup was on 2026-10-04
    When I open Today
    Then a card "It's been over a week since your last backup." with "Back up now" and "Not now" is shown above the lists

  @happy-path
  Scenario: The card suggests a first backup
    Given I have never backed up
    When I open Today
    Then a card "You haven't backed up yet." with "Back up now" and "Not now" is shown

  @edge-case
  Scenario: No card within a week of the last backup
    Given my last backup was on 2026-10-06
    When I open Today
    Then no backup card is shown

  @edge-case
  Scenario: Exactly 7 days is not yet overdue
    Given my last backup was exactly 7 days ago to the millisecond
    Then no backup card is shown

  @edge-case
  Scenario: No card with nothing to save
    Given no habits, goals or to-dos exist
    When I open Today
    Then no backup card is shown

  @edge-case
  Scenario: The same card shows on the Lists tab
    Given my last backup was on 2026-10-04
    When I open the Lists tab
    Then the backup card is shown there too

  # --- Backing up from the card ---

  @happy-path
  Scenario: Back up now opens the share sheet with today's backup
    Given the card is shown on Today and the phone can share files
    When I tap "Back up now"
    Then the share sheet opens with "habit-tracker-backup-2026-10-12.json"
    And after saving, the card disappears and the Lists tab shows "Last backup: Oct 12, 2026"

  @happy-path
  Scenario: The backup includes what I just checked off
    Given the card is shown on Today
    When I check off "Meditate" and then tap "Back up now"
    Then the shared file contains a completion for "Meditate" on 2026-10-12

  @edge-case
  Scenario: Closing the share sheet keeps the card
    Given sharing is cancelled with AbortError
    When I tap "Back up now"
    Then the card is still shown and the last backup date is unchanged

  @edge-case
  Scenario: Without file sharing the backup downloads
    Given the phone cannot share files
    When I tap "Back up now"
    Then the file downloads and the card disappears

  # --- Not now ---

  @happy-path
  Scenario: Not now hides the card for a day
    Given the card is shown
    When I tap "Not now"
    Then the card is hidden on Today and the Lists tab
    And it shows again from 2026-10-13 at the same time of day

  @edge-case
  Scenario: Not now survives closing the app
    Given I tapped "Not now"
    When I reload the app the same day
    Then no backup card is shown

  # --- Errors ---

  @error
  Scenario: A backup date that can't be saved is reported
    Given IndexedDB rejects the next write
    When I tap "Back up now" and save
    Then the message "Couldn't save. Your phone may be out of storage." is shown and the card stays

  @error
  Scenario: A backup that can't be prepared disables the button
    Given IndexedDB fails to read
    When I open Today
    Then "Back up now" is disabled

  # --- Security ---

  @security
  Scenario: The card never sends data anywhere by itself
    When the card is shown and I do nothing
    Then no network request is made and no file is created
    And data only leaves the phone through the share sheet I open

  @security
  Scenario: Names with HTML in the backup stay plain text in the card's screens
    Given a habit named "<img src=x onerror=alert(1)>"
    When the card is shown on Today
    Then 0 img elements exist

  # --- Performance ---

  @performance
  Scenario: Preparing the backup does not slow Today
    Given 20000 completions
    When Today opens
    Then the habits are shown before the backup file is built, and Today's rows appear within the existing launch budget

  # --- Integration ---

  @integration
  Scenario: Backing up from Today updates the Lists tab's backup section
    When I back up from the card on Today
    Then the Lists tab's Backup section shows "Last backup: Oct 12, 2026"

  @integration
  Scenario: Restore still works after a nudge backup
    Given I backed up from the card
    When I restore that file from the Lists tab
    Then the summary matches what is on the phone

  # --- Accessibility ---

  @accessibility
  Scenario: The card is labelled and its buttons are large enough
    Then the card is a complementary landmark named "Backup reminder" and "Back up now" and "Not now" are at least 44 CSS pixels tall
    And axe-core reports 0 WCAG 2.1 A/AA violations on Today with the card in light and dark

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the backup repository keeps returning Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the 7-day and 1-day rules live only in src/domain/backup.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
