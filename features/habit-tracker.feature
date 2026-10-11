# Habit Tracker: BDD scenarios (written before any code)
# Memento idea 74de084f / plan node a8253657 / scenario set d187691e
#
# Conventions used throughout:
#   - The device timezone is America/Chicago unless a scenario says otherwise.
#   - "today" is controlled by an injectable clock in tests.
#   - Weeks run Sunday-Saturday. 2026-10-11 is a Sunday, so the week of
#     Wednesday 2026-10-14 is 2026-10-11 .. 2026-10-17.
#   - A "dayKey" is a local calendar date in YYYY-MM-DD form.
#   - Slice tags (@S1..@S8) map each scenario to the vertical slice that implements it.

Feature: Habit Tracker
  As a person juggling a day job, a side business, fitness goals and new habits,
  I need daily habits, weekly goals and to-dos in one home-screen app
  so that every commitment I've made to myself lives in one trusted place and I can see what to do today.

  Background:
    Given the app is installed to the iPhone Home Screen
    And the device timezone is "America/Chicago"

  # =====================================================================
  # S1: Walking skeleton (install, offline, onboarding)
  # =====================================================================

  @S1 @happy-path
  Scenario: Installed app launches offline to the Today view
    Given the app has been opened once while online
    And the device is in airplane mode
    When I open the app from the Home Screen
    Then the "Today" screen is displayed within 1000 ms
    And no network request for app files fails

  @S1 @edge-case
  Scenario: Safari-tab visitors are told to add the app to the Home Screen
    Given I open the app URL in a Safari tab
    And navigator.standalone is false
    When the Today screen loads
    Then a banner reads "Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen."
    And the banner explains that data in a Safari tab is separate from the installed app

  @S1 @edge-case
  Scenario: Install hint is not shown inside the installed app
    Given navigator.standalone is true
    When the Today screen loads
    Then no "Add to Home Screen" banner is displayed

  @S1 @integration
  Scenario: Persistent storage is requested on first run
    Given the app has never been opened on this device
    When I open the app for the first time
    Then navigator.storage.persist() is called exactly once

  @S1 @integration
  Scenario: A new version is picked up without losing data
    Given I have 3 lists and 12 items saved
    And a new app version has been deployed to GitHub Pages
    When I open the app and accept the "New version available, Reload" prompt
    Then the new version is running
    And I still have 3 lists and 12 items

  # =====================================================================
  # S2: Lists
  # =====================================================================

  @S2 @happy-path
  Scenario: Create a list with a name, color and icon
    Given I have no lists
    When I create a list named "Fitness" with color "orange" and icon "figure.run"
    Then the Lists screen shows exactly 1 list named "Fitness"
    And the "Fitness" list shows an orange icon

  @S2 @error
  Scenario: A list name cannot be blank
    When I try to create a list with the name "   "
    Then the list is not saved
    And the message "List name can't be empty" is displayed

  @S2 @edge-case
  Scenario: Reordering lists is persisted
    Given I have lists "Fitness", "Work", "Side Business" in that order
    When I drag "Side Business" to the top
    And I close and reopen the app
    Then the lists are ordered "Side Business", "Fitness", "Work"

  @S2 @edge-case
  Scenario: Deleting a list that contains items requires confirmation
    Given the list "Work" contains 4 items
    When I delete the list "Work"
    Then a confirmation reads "Delete "Work" and its 4 items? Their history will be archived."
    And the list is removed only after I tap "Delete"

  # =====================================================================
  # S3: Daily habits and the Today view
  # =====================================================================

  @S3 @happy-path
  Scenario: Check off a daily habit with one tap
    Given the list "Personal" has a daily habit "Read 10 pages"
    And today is "2026-10-14"
    When I tap "Read 10 pages" on the Today screen
    Then "Read 10 pages" shows as completed for "2026-10-14"
    And the visual check state changes within 100 ms of the tap

  @S3 @happy-path
  Scenario: A daily habit resets automatically the next day
    Given the daily habit "Read 10 pages" was completed on "2026-10-14"
    When the date becomes "2026-10-15"
    Then "Read 10 pages" shows as not completed on the Today screen
    And its current streak still shows 1

  @S3 @happy-path
  Scenario: Consecutive days build a streak
    Given the daily habit "Meditate" was completed on "2026-10-11", "2026-10-12", "2026-10-13"
    And today is "2026-10-14"
    When I tap "Meditate"
    Then the current streak for "Meditate" is 4

  @S3 @edge-case
  Scenario: Today not yet done keeps yesterday's streak, shown "at risk"
    Given the daily habit "Meditate" was completed on "2026-10-12" and "2026-10-13"
    And today is "2026-10-14" and "Meditate" is not completed today
    When I view the Today screen
    Then the current streak for "Meditate" is 2
    And the streak badge is styled "at risk"
    And the streak badge's accessible label includes "not done today"

  @S3 @edge-case
  Scenario: Missing a day resets the streak to 0 (strict)
    Given the daily habit "Meditate" was completed on "2026-10-11" and "2026-10-12"
    And it was not completed on "2026-10-13"
    And today is "2026-10-14" and "Meditate" is not completed today
    Then the current streak for "Meditate" is 0

  @S3 @edge-case
  Scenario: Tapping a completed daily habit again un-checks it
    Given the daily habit "Meditate" is completed today with a streak of 5
    When I tap "Meditate" again
    Then "Meditate" shows as not completed today
    And the current streak for "Meditate" is 4

  @S3 @edge-case
  Scenario: The app rolls over at midnight while left open
    Given the app is open on the Today screen at "2026-10-14 23:59:50"
    And the daily habit "Meditate" is completed today
    When the clock passes "2026-10-15 00:00:00"
    Then within 2 seconds "Meditate" shows as not completed
    And the date header reads "Thursday, October 15"

  @S3 @edge-case
  Scenario: Reopening the app after midnight recomputes today
    Given the app was last visible at "2026-10-14 22:00"
    When I bring the app back to the foreground at "2026-10-15 07:00"
    Then the Today screen shows items for "2026-10-15"

  @S3 @edge-case
  Scenario Outline: Daylight saving changes never break a streak
    Given the daily habit "Meditate" was completed every day from "<start>" to "<end>"
    And today is "<end>"
    Then the current streak for "Meditate" is <streak>

    Examples:
      | start      | end        | streak |
      | 2026-03-06 | 2026-03-10 | 5      |
      | 2026-10-30 | 2026-11-03 | 5      |

  @S3 @edge-case
  Scenario: Traveling to another timezone counts the local day you tapped
    Given the device timezone changes to "America/Los_Angeles"
    And the local time is "2026-10-14 23:30"
    When I tap the daily habit "Meditate"
    Then a completion is stored for dayKey "2026-10-14"

  @S3 @happy-path
  Scenario: Today view groups items by list
    Given "Fitness" has daily habit "Stretch" and "Work" has daily habit "Inbox zero"
    When I view the Today screen
    Then I see a "Fitness" section containing "Stretch"
    And I see a "Work" section containing "Inbox zero"

  @S3 @edge-case
  Scenario: Empty state on first run
    Given I have no lists and no items
    When I view the Today screen
    Then the message "Nothing here yet. Tap + to add your first habit or to-do." is displayed

  # =====================================================================
  # S4: Weekly N-times goals
  # =====================================================================

  @S4 @happy-path
  Scenario: Each tap increments the weekly count
    Given the list "Fitness" has a weekly goal "Peloton ride" with target 3
    And "Peloton ride" was completed once on "2026-10-12"
    And today is "2026-10-14"
    When I tap "Peloton ride"
    Then the progress ring for "Peloton ride" shows "2/3"
    And the accessible label reads "Peloton ride, 2 of 3 this week"

  @S4 @happy-path
  Scenario: Hitting the target marks the week as met
    Given the weekly goal "Peloton ride" with target 3 has 2 completions this week
    When I tap "Peloton ride"
    Then the progress ring shows "3/3" with a met checkmark

  @S4 @edge-case
  Scenario: Completions beyond the target are all counted
    Given the weekly goal "Peloton ride" with target 3 has 4 completions this week
    When I tap "Peloton ride"
    Then the progress ring shows "5/3"

  @S4 @edge-case
  Scenario: Two completions on the same day both count
    Given the weekly goal "Peloton ride" with target 3 has 0 completions this week
    When I tap "Peloton ride" twice on "2026-10-14"
    Then the progress ring shows "2/3"

  @S4 @edge-case
  Scenario: Undo the last weekly completion
    Given the weekly goal "Peloton ride" has 2 completions this week, the latest on "2026-10-14"
    When I long-press "Peloton ride" and choose "Undo last"
    Then the progress ring shows "1/3"

  @S4 @happy-path
  Scenario: Weekly goals reset on Sunday
    Given the weekly goal "Peloton ride" with target 3 has 3 completions in the week of "2026-10-11"
    When the date becomes Sunday "2026-10-18"
    Then the progress ring for "Peloton ride" shows "0/3"

  @S4 @edge-case
  Scenario: Saturday completions count toward the week that is ending
    Given today is Saturday "2026-10-17" at 23:58
    When I tap "Peloton ride"
    Then the completion counts toward the week starting "2026-10-11"

  @S4 @happy-path
  Scenario: Weeks in a row build a weekly streak
    Given the weekly goal "Peloton ride" with target 3 met its target in the weeks starting "2026-09-20", "2026-09-27", "2026-10-04"
    And today is "2026-10-14" with 1 completion this week
    Then the weekly streak for "Peloton ride" shows "3 weeks"
    And the current week is shown as in progress, not failed

  @S4 @edge-case
  Scenario: Missing a weekly target resets the weekly streak
    Given the weekly goal "Peloton ride" with target 3 met its target in the week starting "2026-09-27"
    And had only 2 completions in the week starting "2026-10-04"
    When the date is "2026-10-14"
    Then the weekly streak for "Peloton ride" is 0 weeks

  @S4 @edge-case
  Scenario: Raising the target does not rewrite past weeks
    Given the weekly goal "Peloton ride" had target 3 and met it in the weeks starting "2026-09-27" and "2026-10-04" with exactly 3 rides each
    When I change the target to 4 on "2026-10-14"
    Then the target for the week starting "2026-10-11" is 4
    And the weeks starting "2026-09-27" and "2026-10-04" are still counted as met
    And the weekly streak is not reset by the edit

  # =====================================================================
  # S5: One-time to-dos
  # =====================================================================

  @S5 @happy-path
  Scenario: Add a to-do with a due date
    When I add a to-do "Send invoice to client" to "Side Business" due "2026-10-16"
    Then "Send invoice to client" appears in "Side Business" with the label "Fri, Oct 16"

  @S5 @happy-path
  Scenario: Add a to-do without a due date
    When I add a to-do "Clean garage" to "Personal" with no due date
    Then "Clean garage" appears in "Personal" with no date label
    And "Clean garage" does not appear on the Today screen

  @S5 @happy-path
  Scenario: Due and overdue to-dos appear on Today; overdue first
    Given today is "2026-10-14"
    And to-do "Renew license" is due "2026-10-12"
    And to-do "Call accountant" is due "2026-10-14"
    And to-do "Book flights" is due "2026-10-20"
    When I view the Today screen
    Then the first to-do shown is "Renew license" styled as overdue with "2 days overdue"
    And "Call accountant" is shown
    And "Book flights" is not shown

  @S5 @happy-path
  Scenario: Completing a to-do moves it to Completed
    Given the list "Work" has an open to-do "Submit expense report"
    When I check off "Submit expense report"
    Then "Submit expense report" is no longer shown in the "Work" open items
    And the "Work" list's "Completed" section contains "Submit expense report"

  @S5 @happy-path
  Scenario: Restore a completed to-do
    Given "Submit expense report" is in the "Work" list's Completed section
    When I uncheck "Submit expense report" in Completed
    Then "Submit expense report" is back in the "Work" open items

  @S5 @edge-case
  Scenario: The Completed section is collapsed by default
    Given the list "Work" has 7 completed to-dos
    When I open the "Work" list
    Then a collapsed row reads "Completed (7)"

  # =====================================================================
  # S6: Item detail, history and stats
  # =====================================================================

  @S6 @happy-path
  Scenario: Item detail shows current and best streak
    Given the daily habit "Meditate" had a 12-day run ending "2026-09-30" and a current run of 4 days
    When I open the detail screen for "Meditate"
    Then "Current streak" shows 4
    And "Best streak" shows 12

  @S6 @happy-path
  Scenario: Backfill a missed day from the calendar repairs the streak
    Given the daily habit "Meditate" was completed on "2026-10-11", "2026-10-12" and "2026-10-14"
    And today is "2026-10-14"
    When I open the "Meditate" calendar and tap "2026-10-13"
    Then "2026-10-13" is marked done
    And the current streak for "Meditate" is 4

  @S6 @error
  Scenario: Future days cannot be checked off
    Given today is "2026-10-14"
    When I tap "2026-10-15" in the "Meditate" calendar
    Then no completion is stored
    And the day cell is not interactive

  @S6 @happy-path
  Scenario: Heatmap shades days by completion
    Given the weekly goal "Peloton ride" has 2 completions on "2026-10-12" and 1 on "2026-10-14"
    When I open the heatmap for "Peloton ride"
    Then the cell for "2026-10-12" is shaded level 2
    And the cell for "2026-10-14" is shaded level 1
    And the cell for "2026-10-13" is shaded level 0
    And the heatmap has a text alternative listing completions per day

  @S6 @happy-path
  Scenario: Weekly and monthly completion rates for a daily habit
    Given the daily habit "Meditate" was completed on 20 of the 30 days in September 2026
    When I open the stats for "Meditate"
    Then "September 2026" shows "67%"

  @S6 @happy-path
  Scenario: Weekly goal rate counts weeks met
    Given the weekly goal "Peloton ride" met its target in 3 of the last 4 completed weeks
    When I open the stats for "Peloton ride"
    Then "Last 4 weeks" shows "3 of 4 weeks met (75%)"

  @S6 @performance
  Scenario: Stats for a year of history render quickly
    Given the daily habit "Meditate" has 365 days of completions
    When I open the detail screen for "Meditate"
    Then the streaks, calendar, heatmap and rates are computed in under 50 ms

  # =====================================================================
  # S7: Backup export and import
  # =====================================================================

  @S7 @happy-path
  Scenario: Export a backup through the iOS share sheet
    Given I have 4 lists, 18 items and 240 completions
    When I tap "Export backup" in Settings
    Then the iOS share sheet opens with a file named "habit-tracker-backup-2026-10-14.json"
    And the file contains schemaVersion, 4 lists, 18 items and 240 completions
    And "Last backup" in Settings reads "Today"

  @S7 @happy-path
  Scenario: Import a backup onto a new phone
    Given a new phone has the app installed with no data
    When I import "habit-tracker-backup-2026-10-14.json" and confirm "Replace all data"
    Then I have 4 lists, 18 items and 240 completions
    And the current streak for "Meditate" equals the streak shown before export

  @S7 @error
  Scenario: An invalid backup file is rejected without changing data
    Given I have 4 lists saved
    When I import a file that is not valid Habit Tracker JSON
    Then the message "This file isn't a Habit Tracker backup. Nothing was changed." is displayed
    And I still have 4 lists

  @S7 @error
  Scenario: A backup from a newer app version is rejected
    When I import a backup whose schemaVersion is higher than the app supports
    Then the message "This backup is from a newer version. Update the app and try again." is displayed
    And no data is changed

  @S7 @edge-case
  Scenario: Remind me when the last backup is old
    Given the last backup was on "2026-09-29"
    And today is "2026-10-14"
    When I open Settings
    Then a notice reads "Last backup 15 days ago. Export a backup to keep your data safe."

  # =====================================================================
  # S8: Editing, archive and polish
  # =====================================================================

  @S8 @happy-path
  Scenario: Moving an item to another list keeps its history
    Given the daily habit "Stretch" in "Personal" has a current streak of 9
    When I move "Stretch" to "Fitness"
    Then "Stretch" appears in "Fitness" with a current streak of 9

  @S8 @happy-path
  Scenario: Deleting an item archives it by default
    When I delete the daily habit "Stretch" and choose "Archive"
    Then "Stretch" no longer appears on Today or in any list
    And "Stretch" appears under Settings > Archived with its full history

  @S8 @edge-case
  Scenario: Permanently deleting an item removes its history
    Given "Stretch" is archived with 40 completions
    When I choose "Delete permanently" and confirm
    Then "Stretch" and its 40 completions are removed from the database

  @S8 @happy-path
  Scenario: Appearance follows the iPhone light/dark setting
    Given the iPhone is set to Dark Mode
    When I open the app
    Then the app uses the dark theme
    And all body text has a contrast ratio of at least 4.5:1

  # =====================================================================
  # Security
  # =====================================================================

  @security
  Scenario: Item titles containing HTML are displayed as plain text
    When I create a to-do titled "<img src=x onerror=alert(1)>"
    Then the title is displayed literally as "<img src=x onerror=alert(1)>"
    And no script executes

  @security
  Scenario: A malicious backup cannot inject script
    When I import a structurally valid backup whose list name is "<script>alert(1)</script>"
    Then the list name is displayed literally
    And no script executes

  @security
  Scenario: The app never sends user data over the network
    Given I have 18 items
    When I use every screen in the app for 5 minutes while monitoring network traffic
    Then zero requests contain any item title, list name or completion data
    And no request is made to any origin other than the app's own GitHub Pages origin

  @security
  Scenario: Content Security Policy blocks third-party scripts
    When the app loads
    Then the Content-Security-Policy includes "default-src 'self'"
    And no inline script is executed

  @security @error
  Scenario: Oversized import files are refused
    When I import a file larger than 10 MB
    Then the message "This file is too large to be a Habit Tracker backup." is displayed
    And no data is changed

  # =====================================================================
  # Performance
  # =====================================================================

  @performance
  Scenario: The JavaScript bundle stays small
    When the production build runs
    Then the total gzipped JavaScript is under 100 KB

  @performance
  Scenario: The Today view stays fast with lots of data
    Given I have 10 lists, 150 items and 3 years of completions
    When I open the app from the Home Screen
    Then the Today screen is interactive within 1000 ms on an iPhone 12-class device

  # =====================================================================
  # Accessibility
  # =====================================================================

  @accessibility
  Scenario: VoiceOver reads complete status for a weekly goal
    Given the weekly goal "Peloton ride" has 2 of 3 completions and a 4-week streak
    When VoiceOver focuses "Peloton ride"
    Then it announces "Peloton ride, 2 of 3 this week, 4 week streak, button"

  @accessibility
  Scenario: Tap targets are large enough
    When I measure every check-off control on the Today screen
    Then each is at least 44 by 44 points

  @accessibility
  Scenario: Reduced motion disables the check animation
    Given "Reduce Motion" is on in iOS settings
    When I check off a habit
    Then no check animation plays

  # =====================================================================
  # Engineering rules (Memento mandatory assertions, adapted for TypeScript)
  # =====================================================================

  @process
  Scenario: BDD scenarios written before code
    Given this feature file is committed
    Then no file under "src/" exists in the same or an earlier commit

  @process
  Scenario: Build verification and test coverage >=95% gate every deploy
    When CI runs on a push to main
    Then lint, typecheck, unit tests and build all succeed before deploy
    And line and branch coverage is at least 95% overall and 100% for "src/domain"
    And the deploy job does not run if any step fails

  @process
  Scenario: No mocks in production code
    When I search "src/" excluding test files for test doubles
    Then no mock, stub or fake implementations are found
    And fake-indexeddb is imported only from test files

  @process
  Scenario: Repository operations return a Result type (ServiceResult<T> pattern)
    When a repository write fails, for example IndexedDB quota exceeded
    Then the repository returns { ok: false, error } instead of throwing
    And the UI shows "Couldn't save. Your phone may be out of storage."

  @process
  Scenario: Async/await with cancellation for long operations
    When an import is in progress and I tap "Cancel"
    Then the import's AbortSignal is triggered
    And the database transaction is rolled back with no partial data written

  @process
  Scenario: SOLID principles and Clean Architecture boundaries
    When the dependency checker runs
    Then no file in "src/domain" imports from "src/data" or "src/ui"
    And no file in "src/data" imports from "src/ui"
    And no single module exceeds 300 lines

  @process
  Scenario: Proactive observation of code issues
    When a reviewer or Claude notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
