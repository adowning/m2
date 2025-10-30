### Product Requirements Document (PRD): Online Casino Bet Processing Flow

#### 1. Overview
This PRD outlines the detailed flow, calculations, and system requirements for processing a player's bet in a real-money online casino after they hit the "spin" button on a slot machine. The system incorporates the following key assumptions and features:
- **Real-Money Casino**: All transactions involve actual currency, with regulatory compliance implied (e.g., anti-money laundering checks, but not detailed here).
- **Affiliate System**: Affiliates receive a percentage of weekly Gross Gaming Revenue (GGR), calculated as (total wagers - total wins - bonuses/promo costs). For each bet, the system logs contributions to GGR for weekly aggregation.
- **Jackpots**: If the slot game belongs to a jackpot group, a small percentage (e.g., 1-5%, configurable) of the wager contributes to one or more jackpot pools (e.g., mini, minor, major, grand).
- **Operators and Platform Relationship**: Based on the provided context, the platform is the central software provider hosting games, user data, and shared services. Operators are individual casino brands using the platform. Players can join multiple operators, each with a separate wallet. Shared elements include VIP points (stored at the user level, not per operator) and jackpot pools. Financially, revenue from bets is primarily operator-specific (e.g., house edge), but costs for VIP benefits and platform maintenance are shared proportionally (e.g., based on operator's player activity). Bets only affect the active operator's wallet.
- **VIP System**: Players gain experience points (VIP points) based on wagers. Points accumulate at the user level (not per operator). Reaching VIP levels unlocks benefits (e.g., cashback, free spins, higher limits). Costs for these benefits (e.g., funding cashback) are shared between all operators (proportional to player activity across them) and the platform (e.g., platform covers infrastructure costs).
- **Wallets and Balances**: Each player has a wallet per operator. Only the active wallet (selected by the player or default) is used for bets. Wallets track:
  - **Real Balance**: Deposited money + wins from real bets (requires 1x wagering for withdrawal).
  - **Bonus Balance**: Promo funds with wagering requirements (e.g., 20x-50x multiplier based on promotion). Multiple bonuses can be active.
- **Bonus and Withdrawal Rules** (from provided Q&A):
  - Real balance is used by default if sufficient.
  - Bets with bonus balance advance wagering progress; bets with real do not.
  - Deposits require 1x wagering on real balance for withdrawal.
  - Bonuses convert to real balance upon completing wagering.
  - Players can waive bonuses to withdraw real balance (after 1x wagering).
  - If bonus balance drops below minimum bet, its task is deleted.
  - Some games restrict bonus use.
  - Wagering progress doesn't advance if using real balance or on restricted games.
- **Transaction Logging**: Every bet creates a log entry with details (e.g., timestamp, wager, outcome, balances).
- **Realtime Notifications**: Post-bet, send updates to the client (e.g., via WebSocket) for UI refresh (balances, outcome, VIP progress).
- **Scope**: This flow starts after the player hits "spin" and assumes a valid session (logged in, game loaded). It does not cover cashout (separate flow), but includes bonus/wagering impacts.

The system must ensure atomicity (e.g., via database transactions) to prevent partial updates in case of failures.

#### 2. High-Level Flow Chart
The bet processing flow is a sequential process with conditional branches for balance checks, jackpot contributions, outcome determination, and updates. Below is a text-based representation of the flow chart (described as a step-by-step sequence with branches). For visualization, this could be implemented in tools like Lucidchart or Mermaid syntax:

```
Start: Player Hits "Spin" Button (Wager Amount Specified)

1. Validate Bet Request
   - Check session validity, game eligibility, and wager limits.
   - If invalid → Error Notification → End

2. Balance Check and Deduction
   - Identify active operator wallet.
   - Check Real Balance >= Wager?
     - Yes → Deduct from Real Balance. Set Bet_Type = "Real".
     - No → Check Bonus Balance(s) >= Wager and Game Allows Bonus?
       - Yes → Deduct from Bonus Balance (FIFO if multiple). Set Bet_Type = "Bonus".
       - No → Insufficient Funds Error → End

3. Jackpot Contribution (If Game in Jackpot Group)
   - Calculate Contribution = Wager * Jackpot_Percentage (e.g., 2%).
   - Add to Jackpot Pool(s) (shared across platform/operators).
   - Log Contribution.

4. Game Outcome Determination
   - Invoke RNG (Random Number Generator) via game provider API.
   - Calculate Win Amount (based on paytable, RTP).
   - If Jackpot Win → Add Jackpot Payout to Win Amount; Reset/Adjust Pool.

5. Update Balances
   - Add Win Amount to:
     - Real Balance (if Bet_Type = "Real").
     - Bonus Balance (if Bet_Type = "Bonus").
   - Net Change = Win - Wager (for GGR logging).

6. Wagering Progress Updates
   - If Bet_Type = "Real" → Advance 1x Deposit Wagering (track progress toward withdrawal eligibility).
   - If Bet_Type = "Bonus" → Advance Bonus Wagering Requirement (e.g., add Wager to progress for active bonus task).
     - If Progress >= Requirement → Convert Bonus to Real Balance; Delete Task.
     - If Bonus Balance < Min_Bet → Delete Task.
   - Check for Multiple Bonuses: Update each independently.

7. VIP Points Calculation and Update
   - Calculate Points = Wager * VIP_Multiplier (e.g., 1 point per $1 wagered, configurable per level/game).
   - Add to User's Global VIP Experience (stored at user level).
   - Check for Level Up:
     - If New Level Reached → Unlock Benefits (e.g., notify player).
     - Log Shared Costs (e.g., allocate to operators/platform based on activity).

8. GGR and Affiliate Logging
   - Log Bet for Weekly GGR: GGR_Contribution = Wager - Win.
   - Attribute to Affiliate (if player referred): For weekly payout calculation (Affiliate_Share = GGR * Affiliate_Percentage).

9. Transaction Logging
   - Create Log Entry: Timestamp, Player_ID, Operator_ID, Game_ID, Wager, Win, Bet_Type, Balances (pre/post), Jackpot_Contribution, VIP_Points_Added, etc.

10. Realtime Notification
    - Send to Client: Outcome (win/loss animation), Updated Balances, VIP Progress, Wagering Status.

End: Flow Complete. Client UI Updates.
```

**Branches and Error Handling**:
- Errors (e.g., insufficient funds, network issues) trigger rollback and client notification.
- Parallel Processes: Jackpot updates and notifications can run asynchronously if non-critical.

#### 3. Detailed Calculations
All calculations must be precise (use decimal arithmetic to avoid floating-point errors) and configurable via admin settings (e.g., percentages, multipliers).

- **Balance Deduction**:
  - Real_Balance_Post = Real_Balance_Pre - Wager (if using real).
  - Bonus_Balance_Post = Bonus_Balance_Pre - Wager (if using bonus; deduct from oldest active bonus first if multiple).
  - If multiple bonuses: Prorate deduction if needed, but prefer full from one.

- **Jackpot Contribution**:
  - Contribution = Wager * Jackpot_Rate (e.g., 0.02 for 2%; rate per jackpot level if multiple).
  - Total_Jackpot_Pool += Contribution (distributed if multi-level, e.g., 50% to major, 30% to minor).
  - If Jackpot Win: Payout = Current_Pool_Value; Pool_Reset = Seed_Amount (funded by platform/operators).

- **Game Outcome**:
  - Win = Wager * Multiplier_From_Paytable (determined by RNG outcome).
  - RTP (Return to Player) enforced over time (e.g., 96% average), but individual spins random.
  - House_Edge = Wager - Expected_Win (logged for reporting).

- **Wagering Progress**:
  - For Deposit (1x): Deposit_Wagered += Wager (if real); Eligible if Deposit_Wagered >= Deposited_Amount.
  - For Bonus: Bonus_Wagered += Wager (if bonus); Progress = Bonus_Wagered / (Bonus_Amount * Wagering_Multiplier).
    - Example: $10 bonus at 20x → Requirement = $200 wagered with bonus.
    - Conversion: If Progress >= 1, Real_Balance += Remaining_Bonus; Bonus_Task = Deleted.
  - Handle Multiple Tasks: Update only the bonus used for the bet.

- **VIP Points**:
  - Points_Added = Wager * Points_Per_Unit (e.g., 1 per $1; bonus bets may earn at reduced rate, e.g., 0.5x).
  - Total_Experience += Points_Added.
  - Level_Thresholds: e.g., Level 1: 0-1000 pts; Level 2: 1001-5000, etc.
  - Cost Sharing: Benefit_Cost (e.g., $5 cashback) allocated as Operator_Share = (Player's Bets with Operator / Total Bets) * Cost; Platform covers fixed % (e.g., 20%).

- **GGR Contribution**:
  - Bet_GGR = Wager - Win (negative if win > wager).
  - Weekly_GGR = Sum(Bet_GGR) across players - Promo_Costs.
  - Affiliate_Payout = Weekly_GGR * Affiliate_Rate (e.g., 5%; paid weekly).

- **Transaction Log Fields** (Example Schema):
  | Field | Type | Description |
  |-------|------|-------------|
  | Log_ID | UUID | Unique identifier. |
  | Timestamp | Datetime | UTC time of bet. |
  | Player_ID | Integer | User identifier. |
  | Operator_ID | Integer | Active operator. |
  | Game_ID | Integer | Slot game ID. |
  | Wager | Decimal | Bet amount. |
  | Win | Decimal | Payout amount. |
  | Bet_Type | String | "Real" or "Bonus". |
  | Pre_Real_Balance | Decimal | Before bet. |
  | Post_Real_Balance | Decimal | After bet/win. |
  | Pre_Bonus_Balance | Decimal | Before bet. |
  | Post_Bonus_Balance | Decimal | After bet/win. |
  | Jackpot_Contribution | Decimal | Amount added to pool. |
  | VIP_Points_Added | Integer | Experience gained. |
  | Wagering_Progress | JSON | Updates to bonus/deposit tasks. |
  | Affiliate_ID | Integer | If applicable. |
  | GGR_Contribution | Decimal | Wager - Win. |

#### 4. System Requirements
- **Technical**:
  - Backend: Microservices (e.g., Bet Service, Wallet Service, VIP Service, Notification Service).
  - Database: Relational (e.g., PostgreSQL) for wallets/logs; NoSQL for realtime notifications.
  - API: REST/GraphQL for game integration; WebSocket for notifications.
  - Security: Encryption for balances; Audit trails; RNG certified by third-party (e.g., eCOGRA).
  - Scalability: Handle 1000+ concurrent bets/sec; Use queues for async tasks (e.g., logging).
- **User Experience**:
  - Client-Side: Immediate spin animation; Post-notification updates UI without refresh.
  - Errors: User-friendly messages (e.g., "Insufficient bonus balance for this game").
- **Compliance and Edge Cases**:
  - Handle interruptions (e.g., disconnect: rollback bet).
  - Restricted Games: Flag if bonus not allowed → Force real balance or block.
  - Multi-Bonus: FIFO processing; Auto-delete invalid tasks.
  - Zero Wager/Win: Still log and notify.
  - Jackpot Wins: Rare; Trigger platform-wide notifications if progressive.
- **Testing**:
  - Unit: Calculations (e.g., wagering progress).
  - Integration: End-to-end bet flow.
  - Load: Simulate high-volume betting.
- **Metrics**:
  - Track: Bet processing time (<500ms), Error rate, GGR per day.

This PRD provides a comprehensive blueprint. Implementation should involve stakeholders for refinements (e.g., exact percentages).