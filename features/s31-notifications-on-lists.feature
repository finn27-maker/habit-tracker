# Notifications on the Lists tab: Memento plan node 52505ce0
# Owner's choice 2026-11-23: "Lists tab section" - the Notifications switch moves out of the
# Assistant sheet (reached only by holding the version line) into a Notifications section on the
# Lists tab, above Backup. Amends s30: the section and its texts are unchanged, only where it lives.
# Family safety (decision 7ac92147): the section shows only on a paired, connected phone, and
# deciding that reads only the phone's own storage.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# The phone is paired and connected, and opened from the Home Screen.

Feature: Notifications switch on the Lists tab
  As a habit tracker owner,
  I need the Notifications switch on the Lists tab
  so that I can turn notifications on or off without the hidden hold.

  @happy-path
  Scenario: The Lists tab shows a Notifications section above Backup
    When I open the Lists tab
    Then a "Notifications" section is shown directly above the "Backup" section
    And it has a "Turn on notifications" button

  @happy-path
  Scenario: Turning on from the Lists tab
    When I tap "Turn on notifications" on the Lists tab and allow notifications
    Then the section says "On: new to-dos from your assistant, and a 7:00 am summary when something is due."
    And it shows a "Turn off notifications" button

  @happy-path
  Scenario: Turning off from the Lists tab
    Given notifications are on
    When I tap "Turn off notifications" on the Lists tab
    Then the section shows "Turn on notifications" again

  @happy-path
  Scenario: The Assistant sheet no longer has the switch
    When I hold the version line and the Assistant sheet opens
    Then it has no "Notifications" section
    And it still shows the pairing code field, Pair and Remove

  @edge-case
  Scenario: Pairing makes the section appear without reloading
    Given the phone is not paired
    When I pair in the Assistant sheet and close it
    Then the Lists tab shows the "Notifications" section

  @edge-case
  Scenario: Removing the pairing hides the section
    Given notifications are on
    When I tap "Remove" in the Assistant sheet and close it
    Then notifications are turned off before the code is forgotten
    And the Lists tab shows no "Notifications" section

  @edge-case
  Scenario: Blocked notifications explain where to fix them
    Given notifications were blocked in the phone's settings
    When I open the Lists tab
    Then the section says "Notifications are blocked. Turn them on in Settings, Notifications, under this app's Home Screen name."
    And no "Turn on notifications" button is shown

  @edge-case
  Scenario: A Safari tab says to open the app from the Home Screen
    Given the app is open in a Safari tab, where web push isn't available
    When I open the Lists tab
    Then the section says "To get notifications, open this app from your Home Screen."

  @error
  Scenario: A failed turn-on says so on the Lists tab
    Given the assistant can't be reached
    When I tap "Turn on notifications" and allow
    Then the section says "Couldn't turn on notifications. Check your connection and try again."

  @error
  Scenario: A refused code hides the section
    Given the assistant answers 401 when I turn notifications on
    Then the Lists tab shows no "Notifications" section
    And the Assistant sheet says "Not connected. Get a new code from your assistant and paste it here."

  @security
  Scenario: Family installs never see the section or contact the assistant
    Given the phone has never been paired
    When I open the Lists tab
    Then no "Notifications" section is shown and no request is made to the assistant

  @security
  Scenario: A disconnected phone does not see the section
    Given the assistant rejected the pairing code earlier
    When I open the Lists tab
    Then no "Notifications" section is shown

  @happy-path
  Scenario: The section is easy to use
    Then its buttons are at least 44 by 44 points and the Lists tab passes axe in light and dark mode

  @performance
  Scenario: The section does not slow the Lists tab
    When I open the Lists tab
    Then the lists show as fast as before, because the section reads only the phone's own storage

  @integration
  Scenario: Turning on from the Lists tab uses the same server contract
    When I turn notifications on from the Lists tab
    Then the same push address, time zone and due-day requests as s30 go to the assistant, with no titles

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the section uses the existing platform/push Result-returning calls and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the section is one UI component with no domain or data changes, and src/domain imports nothing from src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
