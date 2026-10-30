# Assistant to-dos: Memento plan node 857320bd (idea 348280da, parent idea 1d0cbbe8)
# The owner's Personal Assistant (https://app.80dventures.com) queues to-dos; only the owner's
# paired Home Screen install pulls them. Family members install from the same public link and
# never pair, so an unpaired app must behave exactly as before and make no outside requests.
# Server contract: Personal Assistant decision 29aac2be (GET /api/habit-tracker/todos, POST
# /api/habit-tracker/ack, Authorization: Bearer <code>).
# Amends habit-tracker.feature "The app never sends user data over the network": it still holds
# for every unpaired install; a paired install talks only to app.80dventures.com and sends only
# its code and the ids of to-dos it saved.

Feature: To-dos from my assistant
  As a habit tracker owner,
  I need my paired Habit Tracker to pull my assistant's to-dos into my lists
  so that I never retype them while family installs stay untouched.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Friday "2026-10-30"
    And I have the lists "Personal", "Bills & Deadlines" and "Work"

  # --- The hidden way in ---

  @happy-path
  Scenario: Holding the version line opens the assistant screen
    When I press and hold "Version 0.1.0" at the bottom of the Lists tab for 3 seconds
    Then a sheet titled "Assistant" opens with a "Pairing code" field and a "Pair" button

  @security
  Scenario: A tap or short press on the version line does nothing
    When I tap "Version 0.1.0"
    And I press and hold it for 2 seconds
    Then 0 dialogs are open
    And the Lists tab looks exactly as before

  @custom-accessibility
  Scenario: The hold also works from a keyboard and with VoiceOver
    When I focus "Version 0.1.0" and hold Enter for 3 seconds
    Then the "Assistant" sheet opens
    And with VoiceOver on, a double-tap and hold for 3 seconds on "Version 0.1.0" opens it too

  # --- Pairing ---

  @happy-path
  Scenario: Pairing with a code from the assistant
    Given the assistant has 1 pending to-do "Pay Xcel bill" for list "Bills & Deadlines" due "2026-11-03"
    When I paste the 43-character pairing code and tap "Pair"
    Then the sheet says "Connected to your assistant"
    And "Pay Xcel bill" appears in "Bills & Deadlines" due Nov 3
    And the sheet shows "Last synced" with the current time

  @error
  Scenario: A code that isn't a pairing code is refused
    When I paste "hello" and tap "Pair"
    Then the message "That doesn't look like a pairing code. Copy it again from your assistant." is announced
    And no request is made

  @security
  Scenario: Remove stops all requests
    Given I am paired and "Pay Xcel bill" was received
    When I open the Assistant sheet and tap "Remove"
    Then the sheet says "Not paired"
    And "Pay Xcel bill" is still in "Bills & Deadlines"
    And reopening the app makes 0 requests to "app.80dventures.com"

  # --- Receiving ---

  @happy-path @integration
  Scenario: New to-dos arrive when the app opens
    Given I am paired
    And the assistant has pending to-dos "Call Dave" for "Work" and "Renew passport" with no list
    When I open the app
    Then "Call Dave" appears in "Work"
    And "Renew passport" appears in a list named "Assistant", created if missing
    And both ids are acknowledged to the assistant

  @edge-case
  Scenario: List names match regardless of case and spaces
    Given I am paired
    When a to-do for list " bills & deadlines " arrives
    Then it is added to "Bills & Deadlines"

  @edge-case
  Scenario: A to-do never appears twice
    Given I am paired and "Pay Xcel bill" was saved but its acknowledgement was lost
    When the assistant sends "Pay Xcel bill" again
    Then "Pay Xcel bill" appears exactly once
    And its id is acknowledged again

  @edge-case
  Scenario: Long titles are shortened to fit
    Given I am paired
    When a to-do with a 75-character title arrives
    Then it is saved with its first 59 characters followed by "…"

  @security
  Scenario: Malformed to-dos are skipped and not acknowledged
    Given I am paired
    When the assistant sends a to-do with no title and one with due date "11/03/2026"
    Then neither is saved
    And neither id is acknowledged

  @edge-case
  Scenario: Offline, the app doesn't try
    Given I am paired and the phone is offline
    When I open the app
    Then no request is made
    And no error is shown

  @error
  Scenario: A replaced or revoked code stops syncing
    Given I am paired
    When the assistant answers 401
    Then the Assistant sheet says "Not connected. Get a new code from your assistant and paste it here."
    And reopening the app makes 0 requests until a new code is paired

  @error
  Scenario: The assistant being down changes nothing
    Given I am paired
    When the assistant answers 503
    Then no to-do is saved, nothing is acknowledged and no error is shown
    And opening the app again 1 minute later makes exactly 1 new request

  @performance
  Scenario: Syncing never slows down Today
    Given I am paired and the assistant takes 5 seconds to answer
    When I open the app
    Then Today is interactive within 1000 ms
    And at most one request is made per minute however often I switch back to the app

  # --- Family safety and privacy ---

  @security
  Scenario: An unpaired app makes no outside requests
    Given I have never paired
    When I use every screen and hold nothing
    Then no request is made to any origin other than the app's own GitHub Pages origin

  @security
  Scenario: A paired app sends nothing of mine
    Given I am paired and have 18 items
    When the app syncs
    Then requests go only to "https://app.80dventures.com"
    And no request contains any list name, item title or completion

  @security
  Scenario: The pairing code is never in a backup
    Given I am paired
    When I export a backup
    Then the backup file does not contain the pairing code
    And after restoring a backup file that contains a "meta" section, the sheet still says "Connected to your assistant" with the same code

  @security
  Scenario: The security policy allows only the assistant
    When the app loads
    Then the Content-Security-Policy connect-src is exactly "'self' https://app.80dventures.com"
