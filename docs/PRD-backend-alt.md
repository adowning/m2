Here is the Product Requirements Document (PRD) for the AI agent, based on your request and the provided documents.

---

### **Product Requirements Document (PRD): Multi-Operator Casino Platform Backend**

#### 1. Overview

This document outlines the requirements for developing a high-performance, real-time backend server for a multi-operator online casino platform. The system will be built using the specified modern tech stack and will serve as the central nervous system for all player activities, financial transactions, and operator analytics.

The system is designed to be multi-tenant, where the "Platform" hosts services for multiple distinct "Operators" (casino brands). Player data, wallets, and transactions must be securely segregated by the operator they belong to.

This PRD incorporates and extends the requirements from two attached documents:

- `PRD-bets.md`: Governs the complete bet processing flow.
- `PRD-deposits.md`: Governs the deposit and withdrawal financial system.

#### 2. Goals and Objectives

- **Primary Goal:** To create a secure, scalable, and real-time backend API that powers a multi-operator iGaming platform.
- **Key Objectives:**
  - Implement a complete player lifecycle: authentication, wallets, betting, and VIP progression.
  - Integrate the detailed bet and deposit flows as specified in the attached PRDs.
  - Provide a robust, secure, and segregated administrative layer for operators to monitor their players and game performance in real-time.
  - Build an extensive seeding and bot system to generate realistic demo data for B2B sales.
  - Ensure all financial transactions are atomic, secure, and meticulously logged.

#### 3. Core Technology Stack

- **Runtime:** Bun
- **Web Framework / Routing:** Hono
- **Validation:** Zod (must be used for all incoming request bodies, params, and environment variables)
- **Authentication:** `betteer-auth` (or a similar robust, session-based auth library like Lucia)

#### 4. Key Personas

- **Player:** The end-user. Registers, logs in, manages their wallet, places bets, and progresses through VIP levels.
- **Operator Admin:** The B2B client. Logs into an admin panel (powered by these endpoints) to view _their_ players' transactions, manage games, and analyze performance/RTP.
- **Platform Admin (Super Admin):** Manages operators, platform-wide games, and has override-level access.
- **Bot:** A scripted agent that simulates player behavior to generate demo data.

---

#### 5. Functional Requirements

This section details the core features to be built.

### 5.1. System Architecture (Multi-Operator)

The entire system must be built around a multi-operator (multi-tenant) model.

- `Operator` Model: A central table defining each casino brand.
- `User` (Player) Model: Must have a mandatory foreign key to an `Operator_ID`. Players are always associated with one operator.
- `Wallet` Model: Must be unique per `User_ID` and `Operator_ID`, as defined in `PRD-bets.md`.
- Data Segregation: All API endpoints, especially for Operator Admins, must be strictly scoped to the authenticated user's `Operator_ID`. An operator must **never** see data from another operator.
- Shared Resources:
  - **Games:** Can be shared across the platform (e.g., `Game` table).
  - **VIP System:** VIP points are stored at the `User` level (globally), not per operator wallet, as specified in `PRD-bets.md`.
  - **Jackpots:** Jackpot pools are shared across operators, as specified in `PRD-bets.md`.

### 5.2. Authentication

Implement standard authentication endpoints using the `betteer-auth` library.

- `POST /auth/register`: Creates a new `User`. Requires email/username, password, and must associate the user with an `Operator_ID` (e.g., derived from the request domain or a body field).
- `POST /auth/login`: Authenticates a user and creates a session.
- `POST /auth/logout`: Destroys the user's session.
- `GET /auth/me`: Returns the details of the currently authenticated user.

### 5.3. Game Management (CRUD)

Provide Platform Admin endpoints for managing the game library.

- `GameCategory` Model: (e.g., "Slots", "Table Games", "New").
- `Game` Model: (e.g., `name`, `description`, `category_id`, `provider`, `thumbnail_url`).
- **Endpoints:**
  - `GET /games`: Publicly lists all active games, with filters for category.
  - `GET /games/:id`: Gets details for a single game.
  - `POST /admin/games`: (Platform Admin) Adds a new game.
  - `PUT /admin/games/:id`: (Platform Admin) Updates a game.
  - `POST /admin/categories`: (Platform Admin) Creates a new category.
  - `GET /admin/categories`: (Platform Admin) Lists all categories.

### 5.4. Financial System (Deposits & Withdrawals)

**Requirement:** Implement the **entire** deposit and withdrawal system as specified in the attached **`PRD-deposits.md`**.

- **Key Features to Implement:**
  - Deposit flow with `PENDING`, `COMPLETED` states.
  - Secure webhook handler for payment confirmation.
  - Withdrawal flow with `PENDING`, `APPROVED`, `REJECTED` states, requiring admin approval.
  - Integration with `wallet.service.ts` for atomic `creditToWallet` and `debitFromWallet` operations.
  - Triggering of deposit bonuses (XP and Free Spins) upon successful deposit.
  - Full transaction logging as specified.

### 5.5. Bet Processing System

**Requirement:** Implement the **entire** bet processing flow as specified in the attached **`PRD-bets.md`**.

- **Endpoint:** `POST /game/spin` (or similar)
- **Key Features to Implement:**
  - Atomic bet flow: Validate Bet -> Check/Deduct Balance (Real first, then Bonus) -> Jackpot Contribution -> Determine Outcome -> Update Balances/Add Wins.
  - Strict adherence to the Real/Bonus balance logic and wagering requirements (1x for deposit, Nx for bonus).
  - VIP point calculation and update (at the global user level).
  - GGR and Affiliate contribution logging.
  - Full transaction logging for every bet.
  - Real-time WebSocket notification to the client with the bet outcome.

### 5.6. VIP System

Implement the VIP system as described in `PRD-bets.md` and `PRD-deposits.md`.

- `User` model must have a global `vip_experience` field.
- `VipLevel` model defines the `xp_required` for each level and its associated benefits (e.g., cashback rate, free spins).
- The `VipService` (or similar) must be called by:
  1.  The **Betting System** (on wager).
  2.  The **Financial System** (on successful deposit).
- `GET /vip/status`: (Player) Returns the current user's VIP level, current XP, and XP needed for the next level.

### 5.7. Operator Admin Endpoints (Real-Time Analytics)

Provide a set of secure endpoints for Operator Admins to monitor their platform. **All data must be scoped to the operator.**

- `GET /operator/transactions`: Lists all financial transactions (deposits, withdrawals, bets) for the operator's players. Must support filtering by `player_id`, `date_range`, and `type`.
- `GET /operator/players`: Lists all players registered to the operator.
- `GET /operator/player/:id`: Gets a detailed view of a single player, including their wallet balances, transaction history, and VIP status.
- `GET /operator/analytics/games`: Lists performance for all games _for that operator_.
  - Response should include: `game_id`, `game_name`, `total_wagered`, `total_won`, `GGR` (Wager - Win), and `RTP` (Win / Wager).
- `GET /operator/analytics/rtp-summary`: Provides RTP breakdowns as requested.
  - **By Game:** `[{ game_id, name, rtp }, ...]`
  - **By Player:** `[{ player_id, username, rtp }, ...]`
- **Real-Time Requirement:** This data must be viewable in "real-time." The system must be designed for this, either via WebSocket push updates to the admin dashboard or highly optimized query endpoints (e.g., using materialized views or a suitable analytics DB) that provide data with sub-minute latency.

### 5.8. Seeding & Bot System

An extensive seeding system is required for development and sales demos.

1.  **Static Seeding (`bun run seed:static`)**
    - A script to populate the database with initial data.
    - Must create: At least 3 `Operators`, 1 `PlatformAdmin`, 20+ `Games`, and 5 `GameCategories`.
2.  **Bot Creation (`bun run seed:bots`)**
    - A script to create N "bot" `User` accounts (e.g., 100 bots) distributed across the static `Operators`.
3.  **Bot Activity Simulator (`bun run bots:start`)**
    - A long-running process that simulates realistic player behavior.
    - Bots must:
      - Log in.
      - Receive periodic "deposits" (e.g., via an internal admin endpoint or mock webhook).
      - Place bets on random games at realistic intervals and varying wager amounts.
      - Occasionally request withdrawals.
    - The goal is to generate thousands of transactions (bets, deposits, wins) to populate the operator dashboards for demo purposes.

#### 6. Non-Functional Requirements

- **Security:**
  - All endpoints must be protected.
  - All inputs (bodies, params, queries) must be validated with Zod.
  - Use `https-only` secure cookies for sessions.
  - Protect against standard web vulnerabilities (CSRF, XSS, SQLi).
- **Atomicity:** All operations involving balance changes (bet, win, deposit, withdrawal) **must** be atomic, preferably using database transactions to prevent race conditions and partial updates.
- **Performance:**
  - Bet processing (`/game/spin`) must have a target response time of < 500ms.
  - Operator analytics queries must be optimized to avoid locking tables and return data quickly.
- **Logging:** All financial transactions, bets, and significant events (e.g., level up, login failure) must be logged.

#### 7. High-Level Data Models

The AI agent must define and create schemas (e.g., for Drizzle ORM) for at least the following models, ensuring all relations are correctly established.

- `User` (Player)
- `Session` (for auth)
- `Operator`
- `Wallet` (links `User` and `Operator`)
- `Transaction` (for deposits/withdrawals)
- `BetLog` (for all bets/wins)
- `Game`
- `GameCategory`
- `VipLevel`
- `BonusTask` (tracks active bonus wagering requirements)
- `JackpotPool`
