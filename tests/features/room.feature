Feature: GameRoom Lifecycle
  # DOC-REF: TEST-PLAN §3.2 — TC-ROOM-001, TC-ROOM-002
  # Covers: room join, state transitions, reconnection, rejection, and disposal

  Background:
    Given a Colyseus test server is running in-process
    And the database has been migrated and seeded with reference data

  Scenario: 4 players join and room transitions to PLAYING
    # TC-ROOM-001 (partial — join flow only)
    Given 4 users with valid JWTs and non-zero gold balances exist in the database
    When players 1 through 4 each call "joinOrCreate('game_room', { token, nickname })" concurrently
    Then all 4 players successfully join the same room
    And the room "playerCount" equals 4
    And the room state transitions to "PLAYING"
    And the "game_sessions" table row has "player_count" = 4 and "room_state" = "PLAYING"

  Scenario: Player disconnects unexpectedly and reconnects within 10s
    # TC-ROOM-002
    Given a room is in PLAYING state with 2 connected clients
    And player 1 has "gold" = 5000 in their wallet
    When player 1 closes their WebSocket connection with close code 1001
    Then the room "playerCount" remains at 2 during the disconnection window
    And player 1's "isConnected" flag is false
    When player 1 reconnects using their "reconnectionToken" within 10 seconds
    Then player 1's "isConnected" returns to true
    And player 1's "gold" still equals 5000

  Scenario: 5th player is rejected with room full error
    # TC-ROOM-001 (rejection path)
    Given a game room already has 4 connected players and is in PLAYING state
    When a 5th player calls "joinOrCreate('game_room', { token, nickname })"
    Then the 5th player receives a connection error indicating the room is full
    And the room "playerCount" remains at 4

  Scenario: Room disposes and persists jackpot pool
    # Covers room disposal with ongoing jackpot pool state
    Given a room is in PLAYING state with at least 1 connected player
    And the Redis key "game:jackpot:pool" is set to "50000"
    When all players disconnect and the room reaches its disposal timeout
    Then the room is disposed
    And the "jackpot_pool" table row retains "current_amount" = 50000
    And the Redis key "game:jackpot:pool" still reflects the correct pool value
