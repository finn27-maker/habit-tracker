# Push notifications: Memento plan node e2e9ec0a
# Owner's choices 2026-11-20: "Both" kinds - a ping when the assistant sends new to-dos and a
# morning summary of to-dos due or overdue; "Dates only" - the phone tells the assistant server
# only WHICH days have open to-dos due, never their titles, and writes the titles into the
# notification itself; "7:00 am" for the summary.
# The server side (subscription storage, sending, the 7:00 cron) is Personalassistant's, requested
# through Developermgr (Habit Tracker-20261120-233500.json) under /api/habit-tracker/push/.
# Notifications are only offered to a paired, connected phone, so family installs never see them
# and never contact the server (decision 7ac92147).
# iOS only allows web push for an app opened from the Home Screen (iOS 16.4+).
# 2026-11-21: the owner renamed the Home Screen icon ("Accomplish"), and iOS lists the app in
# Settings under that name, so the app's messages no longer name it.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Friday 2026-11-20 in America/Chicago. The phone is paired and connected. Open to-dos:
# "Pay rent" (due 2026-11-18, overdue), "Send term sheet" (due today), "Call the bank" (due
# 2026-11-24) and "Update pitch deck" (no date).

Feature: Notifications while Habit Tracker is closed
  As a habit tracker owner,
  I need push notifications for due to-dos and new assistant to-dos
  so that I hear about them while the app is closed.

  # --- Turning notifications on and off ---

  @happy-path
  Scenario: The Assistant sheet offers notifications on a paired phone
    When I open the Assistant sheet
    Then a "Turn on notifications" button is shown under "Notifications"

  @happy-path
  Scenario: Turning on asks the phone's permission, then registers with the assistant
    When I tap "Turn on notifications" and allow notifications
    Then the phone's push address and time zone "America/Chicago" are sent to the assistant
    And the dates "2026-11-18", "2026-11-20" and "2026-11-24" are sent as due days
    And the sheet says "On: new to-dos from your assistant, and a 7:00 am summary when something is due."

  @happy-path
  Scenario: Turning off stops notifications
    Given notifications are on
    When I tap "Turn off notifications"
    Then the phone's push address is removed from the assistant and the phone
    And the sheet shows "Turn on notifications" again

  @edge-case
  Scenario: Declining the permission leaves notifications off
    When I tap "Turn on notifications" and choose "Don't Allow"
    Then nothing is sent to the assistant
    And the sheet says "Notifications are blocked. Turn them on in Settings, Notifications, under this app's Home Screen name."

  @edge-case
  Scenario: A phone that blocked notifications earlier is told where to fix it
    Given notifications were blocked for Habit Tracker in the phone's settings
    When I open the Assistant sheet
    Then no "Turn on notifications" button is shown
    And the sheet says "Notifications are blocked. Turn them on in Settings, Notifications, under this app's Home Screen name."

  @edge-case
  Scenario: Safari outside the Home Screen explains how to get notifications
    Given Habit Tracker is open in a Safari tab, where web push isn't available
    When I open the Assistant sheet
    Then the sheet says "To get notifications, open this app from your Home Screen."
    And no "Turn on notifications" button is shown

  @security
  Scenario: An unpaired phone is never offered notifications
    Given the phone has never been paired
    When I open the Assistant sheet
    Then no "Notifications" section is shown and no request is made to the assistant

  @security
  Scenario: A disconnected phone is not offered notifications
    Given the assistant rejected the pairing code
    When I open the Assistant sheet
    Then no "Turn on notifications" button is shown

  @happy-path
  Scenario: Removing the pairing turns notifications off first
    Given notifications are on
    When I tap "Remove" in the Assistant sheet
    Then the phone's push address is removed from the assistant before the code is forgotten

  # --- What leaves the phone ---

  @security
  Scenario: Due days carry dates only
    Given notifications are on
    When the due days are sent
    Then the request body contains only "days" and "timeZone", and no title, note or list name appears in it

  @happy-path
  Scenario: Due days are sent again after to-dos change
    Given notifications are on
    When I check off "Send term sheet" and leave the app
    Then the due days "2026-11-18" and "2026-11-24" are sent

  @edge-case
  Scenario: Unchanged due days are not sent again
    Given notifications are on and the due days were sent
    When I open the app again without changing any to-do
    Then no due-days request is made

  @edge-case
  Scenario: Due days skip completed, deleted and undated to-dos
    Given "Update pitch deck" has no date, "Old task" due 2026-11-19 is checked off and "Gone" due 2026-11-21 is deleted
    When the due days are worked out
    Then they are "2026-11-18", "2026-11-20" and "2026-11-24"

  @edge-case
  Scenario: Nothing due sends an empty list
    Given every open to-do has no date
    When the due days are sent
    Then the request body has "days" equal to []

  @edge-case
  Scenario: Due days are capped at 400 dates
    Given 500 open to-dos due on 500 different days
    When the due days are worked out
    Then the earliest 400 dates are sent

  @error
  Scenario: Offline, due days wait for the next open
    Given notifications are on and the phone is offline
    When I change a to-do's date and leave the app
    Then no request is made and the change is sent the next time the app opens online

  @error
  Scenario: A failed send is retried next time
    Given the assistant answers 500 to the due days
    When I open the app again
    Then the due days are sent again

  @error
  Scenario: The assistant rejecting the code stops notification requests
    Given the assistant answers 401 to a notifications request
    When the request finishes
    Then the Assistant sheet shows "Not connected. Get a new code from your assistant and paste it here."

  @error
  Scenario: Registering fails and says so
    Given the assistant can't be reached when I tap "Turn on notifications" and allow
    Then the sheet says "Couldn't turn on notifications. Check your connection and try again."
    And notifications stay off

  # --- What the notifications say ---

  @happy-path
  Scenario: The morning summary lists what's due, overdue first
    When the 7:00 am summary arrives for 2026-11-20
    Then the notification title is "2 to-dos due today (1 overdue)"
    And the body is "Pay rent, Send term sheet"

  @happy-path
  Scenario: A long summary names three and counts the rest
    Given 5 to-dos are due today
    When the 7:00 am summary arrives
    Then the body names the first 3 and ends with "and 2 more"

  @edge-case
  Scenario: Everything was done before the summary arrived
    Given I checked off every due to-do while offline, so the server still had their dates
    When the 7:00 am summary arrives
    Then the notification title is "All caught up" and the body is "Nothing is due today."

  @edge-case
  Scenario: A to-do that becomes overdue overnight is in the next summary
    Given "Send term sheet" is still open on 2026-11-21
    When the 7:00 am summary arrives for 2026-11-21
    Then the title is "2 to-dos due today (2 overdue)"

  @happy-path
  Scenario: New assistant to-dos are announced
    When the assistant sends "Call KeyBank" and "Send the memo"
    Then a notification titled "2 new to-dos from your assistant" says "Call KeyBank, Send the memo"

  @happy-path
  Scenario: Tapping a notification opens the right tab
    When I tap the morning summary
    Then Habit Tracker opens on Today
    When I tap an assistant notification
    Then Habit Tracker opens on Today and the new to-dos are synced

  @edge-case
  Scenario: An unreadable push still shows a notification
    When a push arrives whose content can't be read
    Then a notification titled "Habit Tracker" says "Open the app to see what's new."

  @security
  Scenario: Notification text is plain text
    Given a to-do titled "<img src=x onerror=alert(1)>"
    When it appears in a notification
    Then the notification shows those characters as text and no script runs

  # --- Performance ---

  @performance
  Scenario: The morning summary is built quickly from a big history
    Given 2,000 to-dos and 20,000 check-ins on the phone
    When the 7:00 am summary arrives
    Then the notification text is worked out in under 1 second in the unit test

  # --- Integration ---

  @integration
  Scenario: The offline app still works with the new service worker
    Given Habit Tracker was opened once online
    When I open it in Airplane Mode
    Then Today loads from the phone and no network request is needed

  @integration
  Scenario: An app update still waits for "Reload"
    When a new version of Habit Tracker is deployed
    Then the "A new version is ready" message appears and the update applies only after I tap "Reload"

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then every notifications request returns a typed result, never throws for expected failures, and is aborted after 10 seconds

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the due-day and notification-text rules live in src/domain/notify.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
