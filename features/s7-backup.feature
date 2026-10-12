# S7 backup: Memento plan node db8ea147 / sub-idea ac5ef5e0 / scenario set c14bb386
# User choices 2026-10-12: Backup section at the bottom of the Lists tab; export through the
# iPhone share sheet; restore replaces everything after a confirmation; a gentle banner after
# 30 days without a backup (no notifications).
# Today is Wednesday 2026-10-14 in America/Chicago unless a scenario says otherwise.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Back up and restore
  As a habit tracker user,
  I need to save all my data to a file and restore it from that file
  so that I never lose my streaks and history when I change phones or the app's data is cleared.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  # --- Export ---

  @happy-path
  Scenario: The Backup section sits at the bottom of the Lists tab
    When I open the Lists tab
    Then below the lists a section headed "Backup" shows "Last backup: Never"
    And it has the buttons "Export backup" and "Restore from file"

  @happy-path
  Scenario: Export opens the share sheet with a dated file
    Given the phone can share files
    When I tap "Export backup"
    Then the share sheet is opened with one file named "habit-tracker-backup-2026-10-14.json" of type "application/json"
    And after sharing, the section shows "Last backup: Oct 14, 2026"

  @happy-path
  Scenario: The file holds everything, including deleted items and their history
    Given 4 lists, a daily habit with 3 check-ins, a weekly goal with 2 logs and a target, a to-do and an archived habit
    When the backup is built
    Then it has app "habit-tracker", version 1, an exportedAt time, and data with 4 lists, 4 items, 5 completions and 1 target record

  @edge-case
  Scenario: Without file sharing, the backup downloads instead
    Given the phone cannot share files
    When I tap "Export backup"
    Then a download of "habit-tracker-backup-2026-10-14.json" starts and "Last backup: Oct 14, 2026" is shown

  @edge-case
  Scenario: A refused share falls back to a download
    Given sharing the file is refused with NotAllowedError
    When I tap "Export backup"
    Then a download of the same file starts and the last backup date is updated

  @edge-case
  Scenario: Closing the share sheet does not count as a backup
    Given sharing is cancelled with AbortError
    When I tap "Export backup"
    Then "Last backup: Never" is still shown and no message appears

  @error
  Scenario: A backup that can't be read from storage is reported
    Given IndexedDB fails to read
    When the Lists tab opens
    Then the "Export backup" button is disabled and the message "Couldn't prepare the backup. Close and reopen the app." is shown

  # --- Restore ---

  @happy-path
  Scenario: Restore shows what the file holds before changing anything
    Given a valid backup file from 2026-10-12 with 4 lists, 5 habits and goals, 3 to-dos and 120 check-ins
    When I choose it with "Restore from file"
    Then an alert dialog says "Replace everything on this phone with the backup from Oct 12, 2026? It has 4 lists, 5 habits and goals, 3 to-dos and 120 check-ins. What's on this phone now will be lost."
    And it offers "Cancel" and "Replace"
    And storage is unchanged

  @happy-path
  Scenario: Replace restores the backup exactly
    Given I chose a valid backup file and the summary is shown
    When I tap "Replace"
    Then storage holds exactly the lists, items, completions and target records from the file
    And the message "Restored the backup from Oct 12, 2026." is shown
    And Today shows the restored habits with their streaks

  @happy-path
  Scenario: Cancel leaves everything as it was
    Given I chose a valid backup file and the summary is shown
    When I tap "Cancel"
    Then the dialog closes and storage is unchanged

  @edge-case
  Scenario: The starter lists do not come back after restoring a backup without them
    Given a backup whose only list is "Reading"
    When I restore it and reopen the app
    Then the Lists tab shows only "Reading"

  @edge-case
  Scenario: Restoring onto a fresh install brings back streaks
    Given a fresh install with only the starter lists
    When I restore a backup where "Meditate" was done on 2026-10-12 to 2026-10-14
    Then Today shows "Meditate" with the badge "3 day streak"

  @edge-case
  Scenario: Restoring keeps the last backup date of this phone
    Given this phone's last backup was on 2026-10-01
    When I restore a backup made on 2026-10-12
    Then "Last backup: Oct 1, 2026" is still shown

  # --- Restore: bad files ---

  @error
  Scenario Outline: Files that aren't valid backups are refused with a clear message
    When I choose a file that <problem>
    Then the message "<message>" is shown and storage is unchanged

    Examples:
      | problem                                         | message                                                          |
      | is not JSON                                     | This file isn't a Habit Tracker backup.                          |
      | is JSON from another app                        | This file isn't a Habit Tracker backup.                          |
      | is a backup with version 2                      | This backup is from a newer version of the app. Update the app first. |
      | has a completion on day "2026-02-30"            | This backup file is damaged and can't be restored.               |
      | has an item whose list is missing               | This backup file is damaged and can't be restored.               |
      | has a completion for a missing item             | This backup file is damaged and can't be restored.               |
      | has two lists with the same id                  | This backup file is damaged and can't be restored.               |
      | is larger than 20 MB                            | This file is too large to be a Habit Tracker backup.             |

  @error
  Scenario: A restore that fails partway leaves the old data in place
    Given IndexedDB rejects a write during the restore
    When I tap "Replace"
    Then storage still holds the data from before the restore
    And the message "Couldn't save. Your phone may be out of storage." is shown

  # --- Reminder ---

  @happy-path
  Scenario: A banner reminds me after 30 days without a backup
    Given the last backup was on 2026-09-13 and I have at least one habit
    When I open the Lists tab
    Then a banner says "It's been over 30 days since your last backup." with "Back up now" and "Not now"

  @happy-path
  Scenario: A banner suggests a first backup once there is something to save
    Given I have never backed up and I have at least one habit
    When I open the Lists tab
    Then a banner says "You haven't backed up yet." with "Back up now" and "Not now"

  @edge-case
  Scenario: No banner with nothing to save or a recent backup
    Given either no habits, goals or to-dos exist, or the last backup was on 2026-09-20
    When I open the Lists tab
    Then no backup banner is shown

  @edge-case
  Scenario: "Not now" hides the banner for 7 days
    Given the banner is shown
    When I tap "Not now"
    Then the banner is hidden, and it stays hidden until 2026-10-21

  @happy-path
  Scenario: "Back up now" exports right away
    Given the banner is shown and the phone can share files
    When I tap "Back up now"
    Then the share sheet opens with the backup file and, after sharing, the banner is gone

  # --- Security ---

  @security
  Scenario: Text in a restored file is shown as plain text
    Given a valid backup with the list name "<img src=x onerror=alert(1)>"
    When I restore it
    Then the Lists tab shows the name literally and 0 img elements exist

  @security
  Scenario: Unknown fields in a backup are not stored
    Given a valid backup whose list record also has the field "evil": "x"
    When I restore it
    Then the stored list record has no "evil" field

  @security
  Scenario: Backups never go into the code repository
    Then ".gitignore" ignores files matching "*backup*.json"

  # --- Performance ---

  @performance
  # Revised 2026-10-12 after CI run 38199996229: Linux WebKit on GitHub's runner took ~7 s to
  # restore 20000 completions where macOS WebKit took under 3 s. Neither is an iPhone, so the
  # 3-second phone target is a manual check; CI only guards against a pathological slowdown.
  Scenario: Three years of history backs up and restores without hanging
    Given 10 lists, 60 items and 20000 completions
    When the backup is built, validated and restored
    Then building and validating each finish under 500 ms
    And "Restoring…" is shown and both backup buttons are disabled until the restore ends
    And in the CI browsers restoring finishes under 15 seconds, with the time recorded

  # --- Integration ---

  @integration
  Scenario: A backup made here restores to an identical copy
    Given data with lists, daily habits, weekly goals with changed targets, to-dos with due dates and completed to-dos
    When I export it, wipe the app and restore the file
    Then every stored list, item, completion and target record equals the original

  # --- Accessibility ---

  @accessibility
  Scenario: Backup controls are labelled and large enough
    Then "Export backup", "Restore from file", "Back up now" and "Not now" are each at least 44 CSS pixels tall
    And the restore confirmation is an alert dialog named by its message

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the slice's code
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the backup repository returns Result<T> for every call and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then backup format, validation and reminder rules live in src/domain/backup.ts, file sharing lives in src/platform, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
