@e2e @game-room
Feature: Game Room UI Flow
  As a player of the fishing arcade game
  I want to join a game room and interact with the game UI
  So that I can shoot fish, earn gold, and enjoy the full game experience

  Background:
    Given the game server is running at "http://localhost:7456"
    And the Colyseus server is running at "ws://localhost:2567"
    And the player has accepted the privacy consent

  # E2E-ROOM-001 — Player joins room and sees waiting overlay
  Scenario: Player joins room and sees waiting overlay
    Given a fresh authenticated player with nickname "阿凱"
    And the game room has fewer than 4 players
    When the player navigates to the game lobby
    And the player clicks the "join-room-btn" button
    Then the "waiting-overlay" should be visible
    And the "waiting-overlay" should display the current player count
    And the "game-canvas" should NOT be visible yet
    And the "room-state-indicator" should display "WAITING"

  # E2E-ROOM-002 — Room reaches 4 players and game starts
  Scenario: Room reaches 4 players and game starts
    Given 3 other authenticated players are already in the room
    And the room state is "WAITING"
    When the 4th player joins the room via "join-room-btn"
    Then the "waiting-overlay" should disappear within 3 seconds
    And the "game-canvas" should become visible
    And the "room-state-indicator" should display "PLAYING"
    And each player's gold balance should be shown in the "gold-balance-display"
    And fish should start appearing on the "game-canvas"

  # E2E-ROOM-003 — Player fires cannon and sees payout animation
  Scenario: Player fires cannon and sees payout animation
    Given 4 players are in the room and the room state is "PLAYING"
    And fish are visible on the "game-canvas"
    And the player has sufficient gold balance
    When the player clicks the "cannon-fire-btn"
    Then a bullet animation should play on the "game-canvas"
    And the "shoot-result-toast" should appear within 2 seconds
    And if the shot is a hit:
      | outcome         | UI element                  | expected action                        |
      | fish killed     | "payout-animation"          | visible with the payout amount shown   |
      | fish killed     | "gold-balance-display"      | updated to reflect the earned payout   |
      | fish killed     | "game-canvas"               | fish removed from the visible scene    |
    And if the shot is a miss:
      | outcome         | UI element                  | expected action                        |
      | fish survived   | "shoot-result-toast"        | shows miss indication                  |
      | fish survived   | "game-canvas"               | fish remains visible                   |

  # E2E-ROOM-004 — Player disconnects and sees reconnecting overlay
  Scenario: Player disconnects and sees reconnecting overlay
    Given 4 players are in the room and the room state is "PLAYING"
    And player 1 is actively playing
    When player 1 loses network connectivity (goes offline)
    Then the "reconnecting-overlay" should appear on player 1's screen within 3 seconds
    And the "reconnecting-overlay" should display a reconnecting spinner
    And the "reconnecting-overlay" should display a countdown or status message
    When player 1 regains network connectivity within 10 seconds
    Then the "reconnecting-overlay" should disappear within 12 seconds
    And the "game-canvas" should be visible again
    And player 1's gold balance should be preserved from before the disconnection
    And player 1's room state should be "PLAYING"
