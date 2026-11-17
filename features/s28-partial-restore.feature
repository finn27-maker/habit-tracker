# Partial restore: Memento plan node a23e18de / scenario set 92d82610
# Owner's choice 2026-11-14: "Pick lists, add back missing" - after choosing a backup file, tick
# lists; anything in them that isn't on the phone now comes back with its check-ins; nothing on
# the phone changes. "Replace everything" stays as the other option (s7-backup).
# Amends s7-backup: choosing a file now opens the pick sheet first; Replace is one tap further.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# The backup is from Nov 10, 2026. The phone has lists "KeyBank", "Personal" and "Fitness".

Feature: Add back what's missing from a backup
  As a habit tracker user,
  I need to pick lists from a backup and add back only what's missing
  so that I can recover lost items without losing what I've done since.

  # --- The pick sheet ---

  @happy-path
  Scenario: Choosing a backup file opens the pick sheet
    When I tap "Restore from file" and choose the backup from Nov 10
    Then a dialog named "Restore from backup (Nov 10, 2026)" lists each list in the backup with a checkbox, and shows "Add back", "Replace everything instead" and "Cancel"

  @happy-path
  Scenario: Each list says what it would add back
    Given the backup's "KeyBank" has 3 to-dos the phone doesn't have, and "Personal" has nothing missing
    When the pick sheet opens
    Then "KeyBank" reads "3 to add back" and "Personal" reads "nothing missing" with its checkbox disabled

  @happy-path
  Scenario: Check-ins are counted with the items
    Given the backup's "Fitness" has the habit "Stretch" with 212 check-ins, and the phone has no "Stretch"
    When the pick sheet opens
    Then "Fitness" reads "1 to add back (212 check-ins)"

  @happy-path
  Scenario: Adding back the ticked lists
    Given I tick "KeyBank" and "Fitness"
    When I tap "Add back 4 items"
    Then the sheet closes, "Added back 4 items from the backup of Nov 10, 2026." is shown, and the 3 to-dos and "Stretch" with its 212 check-ins are on the phone

  @happy-path
  Scenario: Nothing on the phone changes
    Given "KeyBank" on the phone has a to-do "Call the bank" that I renamed and ticked since the backup
    When I add back "KeyBank"
    Then "Call the bank" keeps its new name and stays ticked, and no list, item or check-in that was already on the phone is changed

  @happy-path
  Scenario: The button counts what's ticked
    When I tick nothing
    Then "Add back" is disabled, and ticking "KeyBank" changes it to "Add back 3 items"

  @happy-path
  Scenario: Replace everything is still one tap away
    When I tap "Replace everything instead"
    Then the familiar confirmation "Replace everything on this phone with the backup from Nov 10, 2026?" appears, and "Replace" works as before

  @happy-path
  Scenario: Cancel changes nothing
    When I tap "Cancel" on the pick sheet
    Then the sheet closes and the phone's lists, items and check-ins are exactly as before

  # --- What counts as missing ---

  @edge-case
  Scenario: A list deleted since the backup comes back whole
    Given the phone no longer has the backup's list "Side Hustle" with 2 habits
    When the pick sheet opens
    Then "Side Hustle" reads "deleted list · 2 to add back", and adding it back puts the list at the end of my lists with both habits

  @edge-case
  Scenario: Items in Recently deleted are left there
    Given the backup's "KeyBank" has "Old task", which is in Recently deleted on the phone
    When I add back "KeyBank"
    Then "Old task" stays in Recently deleted and isn't counted

  @edge-case
  Scenario: Items already deleted in the backup don't come back
    Given the backup itself has "Gone task" deleted
    When I add back its list
    Then "Gone task" is not added

  @edge-case
  Scenario: An assistant to-do already on the phone isn't duplicated
    Given the backup has assistant to-do "Pay Xcel bill" and the phone has the same assistant to-do under a different id
    When I add back its list
    Then the phone still has exactly one "Pay Xcel bill"

  @edge-case
  Scenario: Added items go to the end of an existing list in their backup order
    Given the phone's "KeyBank" has 2 open to-dos
    When I add back 3 to-dos to "KeyBank"
    Then they appear after the 2, in the order they had in the backup

  @edge-case
  Scenario: A weekly goal comes back with its targets
    Given the backup's goal "Peloton ride" with a target of 3 per week is missing from the phone
    When I add back its list
    Then "Peloton ride" shows 3 per week and its past weeks' results

  @edge-case
  Scenario: A finished to-do comes back finished
    Given the backup's "KeyBank" has a completed to-do "Filed taxes" missing from the phone
    When I add back "KeyBank"
    Then "Filed taxes" is in "KeyBank"'s Completed section

  @edge-case
  Scenario: A backup with nothing missing says so
    Given every item in the backup is already on the phone
    When the pick sheet opens
    Then every list reads "nothing missing" and "Add back" stays disabled

  # --- Errors and safety ---

  @error
  Scenario: Adding back that can't be saved changes nothing
    Given IndexedDB rejects the next write
    When I tap "Add back 4 items"
    Then "Couldn't save. Your phone may be out of storage." is shown and no list, item or check-in is added

  @error
  Scenario: A damaged file still says so before any sheet
    When I choose a file that isn't a Habit Tracker backup
    Then "This file isn't a Habit Tracker backup." is shown and no sheet opens

  @security
  Scenario: List names in the sheet stay plain text
    Given the backup has a list named "<img src=x onerror=alert(1)>"
    When the pick sheet opens
    Then the name shows as text and no image element is created

  @security
  Scenario: Adding back never touches the pairing code
    Given the phone is paired with the assistant
    When I add back any lists
    Then the pairing code and connection are unchanged

  # --- Integration and performance ---

  @integration
  Scenario: Screens show what came back without a reload
    When I add back "Fitness"
    Then Today and the Lists tab show "Stretch" straight away

  @performance
  Scenario: Adding back a large list is quick
    Given a backup list with 500 missing items and 20,000 check-ins
    When I add it back
    Then the add completes in under 5 seconds in the unit test, with the time recorded

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then adding back goes through the backup repository's Result<T> in one transaction and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then deciding what is missing lives in src/domain as pure functions, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
