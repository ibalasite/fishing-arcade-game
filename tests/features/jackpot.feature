Feature: Jackpot System
  # DOC-REF: TEST-PLAN §3.5 — TC-JACK-001, TC-JACK-002
  # Covers: atomic jackpot claim, concurrent winner rejection, pool persistence across restart

  Background:
    Given a real PostgreSQL instance is available via Testcontainers
    And a real Redis instance is available via Testcontainers
    And the database has been migrated and seeded with reference data

  Scenario: Jackpot triggers and credits winner atomically
    # TC-JACK-001 (single winner path)
    Given the Redis key "game:jackpot:pool" is set to "100000"
    And a user "player-1" exists in the database with a valid wallet
    And "crypto.randomInt" is mocked to return 0 (forced win)
    When "JackpotManager.tryTrigger(100, 'player-1')" is called
    Then the call returns a non-null "JackpotResult" with "winnerId" = "player-1" and "amount" = 100000
    And exactly one row is inserted into "jackpot_history"
    And "user_wallets.gold" for "player-1" is incremented by 100000
    And the Redis key "game:jackpot:pool" is reset to the configured "JACKPOT_SEED_AMOUNT"

  Scenario: Concurrent jackpot claim is rejected (only one winner)
    # TC-JACK-001 (concurrent contention path)
    Given the Redis key "game:jackpot:pool" is set to "100000"
    And users "player-1" and "player-2" both exist in the database
    And "crypto.randomInt" is mocked to return 0 for both calls (both would win without atomicity)
    When "tryTrigger(100, 'player-1')" and "tryTrigger(100, 'player-2')" are executed simultaneously via Promise.all
    Then exactly one call returns a non-null "JackpotResult"
    And the other call returns null
    And exactly one row exists in "jackpot_history"
    And the Redis pool is not double-claimed and not zero after the winning claim

  Scenario: Jackpot pool persists across server restart
    # TC-JACK-002
    Given the "jackpot_pool" table row has "current_amount" = 75000
    And the Redis key "game:jackpot:pool" does not exist (simulating cold restart)
    And the JackpotManager singleton is reset ("_instance" and "_initPromise" set to null)
    When "JackpotManager.getInstance()" is called (triggering "restorePool")
    Then the Redis key "game:jackpot:pool" is set to "75000"
    And a subsequent "tryTrigger" call can read the restored pool value of 75000
