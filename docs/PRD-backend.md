# Product Requirements Document (PRD): Backend Server for Online Casino Platform

## 1. Introduction

This PRD outlines the requirements for developing a backend server for a multi-operator online casino platform. The backend will handle authentication, game management, betting processing, financial transactions (deposits and withdrawals), VIP progression, administrative oversight, and data seeding for testing and demonstrations. The system is designed to be secure, scalable, and compliant with iGaming standards, integrating seamlessly with frontend clients and external services (e.g., payment providers).

The development will use the following technologies:

- **Bun**: As the runtime and server for high-performance execution.
- **Hono**: For routing and handling HTTP requests.
- **Zod**: For schema validation and type-safe input/output handling.
- **Better-Auth**: For authentication and session management.
- **ORM** drizzle

This backend will support real-money operations, multiple operators (each with isolated financials but shared platform features like jackpots and VIP), and AI-driven bots for data seeding. It builds upon the betting flow from "PRD-bets.md" and the deposit/withdrawal system from "PRD-deposits.md".

Assumptions:

- The backend assumes integration with a relational database (e.g., PostgreSQL) for persistent storage.
- Regulatory compliance (e.g., RNG certification, AML) is implied but not detailed; focus on functional implementation.
- Frontend integration via RESTful APIs; real-time features via WebSockets.

## 2. Goals and Objectives

- **Primary Goal:** Build a robust backend server that powers the core operations of an online casino, enabling secure user interactions, financial processing, and administrative control.
- **Key Objectives:**
  - Implement secure authentication and user management.
  - Provide CRUD operations for managing categorized games.
  - Integrate a comprehensive betting system with balance handling, jackpots, and logging as per "PRD-bets.md".
  - Develop a financial system for deposits and withdrawals, including bonus incentives, as per "PRD-deposits.md".
  - Create a VIP system for player progression and rewards.
  - Enable multi-operator support with admin interfaces for transaction visibility and performance metrics (e.g., RTP tracking).
  - Implement an extensive seeding system for database initialization and bot-driven simulations to generate realistic demo data.
  - Ensure real-time data visibility and updates where applicable (e.g., via WebSockets for admin dashboards).
  - Maintain high performance, security, and scalability for handling concurrent users and bots.

## 3. User Personas & Stories

- **As a Player, I want to:**

  - Register, log in/out, and retrieve my user details securely.
  - Browse and play categorized games.
  - Place bets on games, with automatic balance deductions, outcomes, and updates (as per betting flow).
  - Make deposits and request withdrawals, receiving bonuses like XP and free spins.
  - Earn VIP XP from activities, unlocking bonuses and benefits.
  - View my transaction history (bets, deposits, withdrawals).

- **As an Operator (Admin), I want to:**

  - Access admin endpoints to view real-time transactions (deposits, withdrawals, bets) for my players.
  - Monitor individual game performances, including RTP broken down by player and game.
  - Manage games (CRUD) within categories.
  - View financial interactions between my operator and players.
  - Use seeded demo data to evaluate the platform.

- **As a Platform Administrator, I want to:**

  - Oversee all operators, users, and system-wide metrics.
  - Trigger or manage the seeding system for database population and bot simulations.
  - Configure system settings (e.g., RTP thresholds, bonus rules, jackpot rates).

- **As a Developer/AI Agent, I want to:**
  - Have clear API endpoints and schemas for implementation.
  - Use bots to simulate real-player behavior for testing and demos.

## 4. Functional Requirements

### 4.1. Authentication Endpoints

Using Better-Auth for session-based auth with JWT or cookies.

- **Register**: POST /auth/register – Validate input with Zod (e.g., email, password, username). Create user record, hash password.
- **Login**: POST /auth/login – Validate credentials; return session token.
- **Logout**: POST /auth/logout – Invalidate session.
- **Get User Details**: GET /auth/user – Protected route; return user profile (e.g., ID, VIP level, balances per operator).
- Role-based access: Players (standard), Operators (admin privileges for their scope), Platform Admins (full access).

### 4.2. Game Management (CRUD Endpoints)

Games categorized (e.g., slots, table games). Each game has metadata (ID, name, category, RTP config, jackpot group).

- **Create Game**: POST /games – Admin-only; Zod-validated body (name, category, paytable, RTP).
- **Read Games**: GET /games?category=optional – Return list or filtered by category.
- **Update Game**: PUT /games/:id – Admin-only; Update details.
- **Delete Game**: DELETE /games/:id – Admin-only.
- Integration: Games link to betting flow; track performance metrics (e.g., total wagers, wins).

### 4.3. Betting System

Fully implement the flow from "PRD-bets.md", including:

- **Place Bet Endpoint**: POST /bets – Player-initiated (after "spin"). Validate session, wager, game ID.
  - Balance check/deduction (real/bonus wallets per operator).
  - Jackpot contribution (if applicable; shared pools).
  - RNG outcome via integrated provider (simulate or use certified RNG).
  - Update balances, wagering progress, VIP points (global).
  - Log GGR contribution, affiliate shares.
  - Realtime notification via WebSocket.
- Atomic transactions for atomicity.
- Logging: Comprehensive transaction logs (as in schema from PRD-bets).
- VIP Integration: Award XP = Wager \* Multiplier; check level-ups.

### 4.4. Financial System (Deposits & Withdrawals)

Implement as per "PRD-deposits.md":

- **Deposit Endpoint**: POST /deposits – Initiate pending transaction; provide instructions (e.g., CashApp tag).
- **Webhook Handler**: POST /webhooks/:provider – Validate and complete deposits; credit wallets, award bonuses (XP, free spins).
- **Withdrawal Endpoint**: POST /withdrawals – Initiate pending; check eligibility (wagering requirements).
- **Admin Approval**: PUT /admin/withdrawals/:id – Approve/reject; update status, debit/credit accordingly.
- Bonus Triggers: On deposit completion, add XP via VIP service; award free spins.
- Wallets: Per operator; track real/bonus balances.
- Transaction Logging: Full audit trail.

### 4.5. VIP System

- **XP Awarding**: Integrated into bets/deposits. Endpoint: POST /vip/add-xp (internal or via betting/financial flows).
- **Get VIP Status**: GET /vip/user – Return current XP, level, unlocked bonuses (e.g., cashback, free spins).
- **Level-Up Logic**: Threshold-based; unlock benefits (e.g., auto-apply cashback on losses).
- Costs: Shared between operators/platform based on player activity.
- Bonuses: Convert XP to rewards; integrate with bonus balances.

### 4.6. Admin Endpoints for Operators

Protected routes for operators (scoped to their ID).

- **View Transactions**: GET /admin/transactions?type=deposits|withdrawals|bets&playerId=optional – Real-time list (use WebSockets for updates).
- **View Game Performance**: GET /admin/games/:id/performance – Metrics: Total wagers, wins, RTP (calculated as (total wins / total wagers) \* 100), broken down by player.
- **RTP Tracking**: GET /admin/rtp?gameId=optional&playerId=optional – Real-time RTP views; aggregate over sessions.
- **Financial Overview**: GET /admin/financials – Operator-specific: Player balances, GGR, affiliate payouts.
- Real-time: Use WebSockets for push updates on new transactions/metrics.

### 4.7. Seeding System

Extensive system for database seeding and bot simulations.

- **Database Seeding**: Script/Endpoint: POST /seed/database – Populate initial data (users, operators, games, jackpots, VIP levels).
- **Bot Creation & Simulation**:
  - Create Bots: POST /seed/bots?count=N – Generate bot users (mirror real players: varied behaviors, e.g., frequent bettors, high-rollers).
  - Simulate Actions: POST /seed/simulate?duration=minutes&intensity=low|medium|high – Bots perform actions:
    - Place bets (random wagers, games; follow betting flow).
    - Make deposits (simulate webhooks for completion).
    - Request withdrawals (auto-approve for demos).
  - Realism: Bots vary in frequency, amounts, win/loss patterns to mimic real data (e.g., 80% small bets, 20% large).
  - Purpose: Generate demo data for operators; ensure system runs with populated DB.
- Logging: Bot actions flagged as "seeded" for distinction.

## 5. Non-Functional Requirements

- **Security:**
  - Use HTTPS; encrypt sensitive data.
  - Rate limiting, input validation with Zod.
  - Auth checks on all protected routes.
  - Fraud prevention: Velocity checks on transactions.
- **Performance:**
  - Handle 1000+ requests/sec; async processing for webhooks/bets.
  - Response times <500ms.
- **Reliability:**
  - Atomic DB transactions; error handling with rollbacks.
  - Logging for all actions (use a service like transaction-logging).
- **Scalability:**
  - Microservices-ready; queue async tasks (e.g., bot simulations).
- **Compliance:**
  - Audit trails; RNG integration for fairness.
- **Real-Time:**
  - WebSockets for notifications and admin updates.

## 6. Technical Requirements & Integration

- **Framework/Stack:**
  - Bun: Server runtime.
  - Hono: Routing (e.g., app.get('/path', handler)).
  - Zod: Validate all inputs/outputs (e.g., z.object({ ... })).
  - Better-Auth: Auth middleware.
- **Database:** PostgreSQL; use ORM like Drizzle for schemas (users, operators, transactions, games, wallets, vip_levels).
- **API:** RESTful with Hono; JSON responses.
- **WebSockets:** Integrate for real-time (e.g., via Hono's ws support).
- **External Integrations:** Payment webhooks; RNG API.
- **Seeding Scripts:** Bun scripts for bots (e.g., cron-like simulations).
- **Testing:** Unit (calculations), Integration (flows), Load (concurrent bots).
- **Deployment:** Containerized (Docker); CI/CD ready.

This PRD serves as a blueprint for AI agents to implement the backend. Refinements can be made based on stakeholder feedback.
