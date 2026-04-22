@e2e @jackpot
Feature: Jackpot UI
  As a player of the fishing arcade game
  I want to see jackpot information clearly and receive exciting feedback when the jackpot is won
  So that the jackpot mechanic feels transparent, fair, and rewarding

  Background:
    Given the game server is running at "http://localhost:7456"
    And the player has accepted the privacy consent
    And the player is authenticated and in a "PLAYING" game room with 4 players

  # E2E-JACK-001 — Jackpot pool counter increments in real-time
  Scenario: Jackpot pool counter increments in real-time
    Given the "jackpot-pool-counter" is visible in the game HUD
    And the current jackpot pool amount is displayed in "jackpot-pool-counter"
    When any player in the room fires a cannon shot
    Then the "jackpot-pool-counter" should update within 1 second
    And the new displayed amount should be greater than or equal to the previous amount
    And the counter update should use a smooth animation (not a hard jump)
    When multiple players fire shots in rapid succession
    Then the "jackpot-pool-counter" should reflect each incremental contribution
    And no intermediate state should show a value lower than before

  # E2E-JACK-002 — Jackpot win triggers full-screen celebration animation
  Scenario: Jackpot win triggers full-screen celebration animation
    Given the jackpot pool has been seeded to the minimum trigger threshold
    And all 4 players in the room can see the game canvas
    When the jackpot win event is triggered for a player in the room
    Then the "jackpot-celebration" overlay should appear on ALL 4 players' screens within 3 seconds
    And the "jackpot-celebration" overlay should cover the full screen
    And the winning player's nickname should be displayed in "jackpot-winner-name"
    And the jackpot payout amount should be displayed in "jackpot-winner-amount"
    And a celebration animation (fireworks/particles) should play
    And the winner's "gold-balance-display" should update to reflect the jackpot payout
    When the celebration animation completes (after approximately 5 seconds)
    Then the "jackpot-celebration" overlay should automatically dismiss
    And the game should resume to the "PLAYING" state
    And the "jackpot-pool-counter" should reset to the seed amount

  # E2E-JACK-003 — Jackpot odds modal displays correct odds table
  Scenario: Jackpot odds modal displays correct odds table
    Given the "jackpot-info-btn" is visible in the game HUD
    When the player clicks the "jackpot-info-btn"
    Then the "jackpot-odds-modal" should appear
    And the "jackpot-odds-modal" should be visible and fully rendered
    And the odds table should display the following cannon multiplier tiers:
      | cannon_multiplier | odds_display     |
      | 1x                | 1 in 500,000     |
      | 2x                | 1 in 250,000     |
      | 5x                | 1 in 100,000     |
      | 10x               | 1 in 50,000      |
    And the modal should display the current jackpot pool amount pulled live from "jackpot-pool-counter"
    And the modal should contain a "jackpot-odds-close-btn" to dismiss it
    When the player clicks "jackpot-odds-close-btn"
    Then the "jackpot-odds-modal" should be hidden
    And the game HUD should be fully interactive again
