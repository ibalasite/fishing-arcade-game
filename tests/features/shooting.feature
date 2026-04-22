Feature: Bullet Hit Detection
  # DOC-REF: TEST-PLAN §3.3 — TC-FISH-001, TC-FISH-002, TC-FISH-003 | §3.4 — TC-RTP-001
  # Covers: valid shot debit, duplicate bulletId idempotency, insufficient gold rejection, RTP band simulation

  Background:
    Given a Colyseus test server is running in-process
    And the database has been migrated
    And a room is in PLAYING state with at least 1 connected player
    And fish "fish-001" of type "normal" with hp 1 is alive in the room state

  Scenario: Player shoots fish with sufficient gold
    # TC-FISH-001
    Given player 1 has "gold" = 1000 in their wallet
    And the cannon multiplier is 1
    When player 1 sends a "shoot" message with "bulletId" = "bullet-1", "fishId" = "fish-001", "betAmount" = 100, "cannonMultiplier" = 1
    Then a "shoot_result" message is received by player 1 within 200ms
    And "user_wallets.gold" for player 1 is decremented by 100
    And exactly one new row exists in "rtp_logs" for this room and player

  Scenario: Duplicate bulletId is silently dropped
    # TC-FISH-002
    Given player 1 has "gold" = 1000 in their wallet
    When player 1 sends two "shoot" messages with the same "bulletId" = "dup-bullet-1" concurrently via Promise.all
    Then "user_wallets.gold" is decremented by the "betAmount" exactly once
    And "rtp_logs" contains exactly one row for this "bulletId" sequence
    And no error or disconnect message is sent to player 1

  Scenario: Shot with insufficient gold is rejected
    # TC-FISH-003
    Given player 1 has "gold" = 50 in their wallet
    When player 1 sends a "shoot" message with "betAmount" = 100
    Then no gold is deducted from player 1's wallet
    And no row is inserted into "rtp_logs"
    And player 1 does not receive a "shoot_result" message within 500ms

  Scenario Outline: Fish type hit rates over 100K shots stay within RTP band
    # TC-RTP-001 — GATE-RTP (blocks merge)
    Given a fresh RTPEngine instance initialised with production RTP_CONFIG
    And no prior adjudication state exists ("totalBet" = 0)
    When 100000 calls to "adjudicate(<fishType>, 10, 1)" are executed
    Then "engine.currentRtp" is greater than or equal to 0.92
    And "engine.currentRtp" is less than or equal to 0.96
    And no NaN or Infinity values are produced

    Examples:
      | fishType |
      | normal   |
      | elite    |
      | boss     |
