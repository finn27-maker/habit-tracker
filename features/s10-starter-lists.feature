# Shareable first launch: Memento plan node 8caee529 (sub-idea 63aa751f) / scenario set 3cfcc09d
# User request 2026-10-12: "getting a link I can send to friends and family so they can try it. On the
# default start up, I don't want my starting items on there. let's come up with 3 or 4 generic
# categories that they can see how it works and can change, add or edit later"
# User chose Health, Home, Work, Personal, with no example items.
# The link is the live site, https://finn27-maker.github.io/habit-tracker/. Every phone keeps its own
# data in its own browser storage, so friends never see the owner's items and the owner never sees theirs.
# Supersedes s2-lists.feature "First open shows four starter lists" (Fitness, Work, Side Business, Personal).
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Generic starter lists for people trying the shared link
  As a friend or family member opening the shared link,
  I need four generic, empty starter lists
  so that the app feels like mine from the first launch and I can rename, add or delete lists later.

  # --- First launch ---

  @happy-path
  Scenario: A fresh install shows the four generic lists in order
    Given the app is opened for the first time on a phone
    When I open the Lists tab
    Then I see 4 lists in this order: "Health", "Home", "Work", "Personal"
    And "Health" shows "💪" on orange, "Home" shows "🏡" on green, "Work" shows "💼" on blue and "Personal" shows "⭐" on purple

  @happy-path
  Scenario: The starter lists are empty
    Given the app is opened for the first time on a phone
    When I open Today
    Then Today shows the empty-state message and 0 items
    And each starter list's page shows 0 items

  @happy-path
  Scenario: Adding the first item offers the generic lists
    Given the app is opened for the first time on a phone
    When I tap "+" on Today
    Then the List picker offers "💪 Health", "🏡 Home", "💼 Work", "⭐ Personal" with "💪 Health" selected

  @happy-path
  Scenario: A starter list can be renamed and recolored
    Given the app is opened for the first time on a phone
    When I edit "Home" to the name "Family", the emoji "👨‍👩‍👧" and the color "teal" and tap "Save"
    Then the Lists tab shows "Family" in second place with "👨‍👩‍👧" on teal
    And after closing and reopening the app "Family" is still second

  # --- Existing installs ---

  @edge-case
  Scenario: A phone that already has lists keeps them
    Given the phone already has the lists "Fitness", "Work", "Side Business" and "Personal" from an earlier version
    When the updated app opens
    Then the Lists tab still shows exactly "Fitness", "Work", "Side Business", "Personal"
    And no "Health" or "Home" list is added

  @edge-case
  Scenario: Deleting every starter list does not bring them back
    Given I deleted all 4 starter lists
    When I close and reopen the app
    Then the Lists tab shows 0 lists

  @edge-case
  Scenario: Deleting one starter list does not bring it back
    Given I deleted "Work"
    When I close and reopen the app
    Then the Lists tab shows "Health", "Home", "Personal"

  # --- Error handling ---

  @error
  Scenario: Starter lists that can't be saved are reported
    Given IndexedDB rejects the first write with a "Connection to Indexed Database server lost" error
    When the app is opened for the first time
    Then the message "Couldn't save. Your phone may be out of storage." is displayed
    And no partial set of starter lists is stored

  # --- Security and privacy ---

  @security
  Scenario: The shared link carries none of the owner's data
    Given the owner's phone has the lists "Fitness" and "Side Business" and 20 items
    When a friend opens https://finn27-maker.github.io/habit-tracker/ on their own phone
    Then the friend sees only "Health", "Home", "Work", "Personal" with 0 items
    And the app's source files outside tests contain neither "Fitness" nor "Side Business"

  @security
  Scenario: Starting the app sends nothing anywhere
    Given the app is opened for the first time on a phone
    When the starter lists are created
    Then no network request other than loading the app's own files is made

  # --- Performance ---

  @performance
  Scenario: The first launch shows the lists without a visible wait
    Given the app is opened for the first time on a phone
    When I open the Lists tab
    Then the 4 starter lists are visible, with the time recorded as a test annotation and a pathological ceiling of 5 seconds

  # --- Integration ---

  @integration
  Scenario: Restoring a backup on a new phone replaces the starter lists
    Given a friend's fresh install shows "Health", "Home", "Work", "Personal"
    When they restore a backup that holds the lists "Garden" and "Reading"
    Then the Lists tab shows exactly "Garden", "Reading"
    And after closing and reopening the app no starter list reappears

  @integration
  Scenario: Items added to a starter list appear on Today grouped under it
    Given the app is opened for the first time on a phone
    When I add the daily habit "Drink water" to "Health"
    Then Today shows "Drink water" in the "Health" group

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the lists repository keeps returning Result<T> from ensureStarterLists and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the starter list names live only in src/domain/lists.ts, tests choose their own fixture lists through the repository's starters option, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
