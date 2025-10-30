Here is the Product Requirements Document (PRD) for the new Deposit and Withdrawal System.

# Product Requirements Document: Deposit & Withdrawal System

## 1. Introduction

This document outlines the requirements for a new, robust, and industry-standard Deposit and Withdrawal system for our iGaming platform. The goal is to create a secure, reliable, and user-friendly system that seamlePRDly integrates with our existing architecture, while also providing a framework for future expansion and compliance with regulatory standards.

## 2. Goals and Objectives

- **Primary Goal:** To implement a secure and efficient system for processing player deposits and withdrawals.
- **Key Objectives:**
  - Improve the user experience for both deposits and withdrawals.
  - Ensure the system is compliant with iGaming industry standards for security and anti-fraud.
  - Automate the deposit and withdrawal process as much as possible, reducing the need for manual intervention.
  - Integrate a flexible bonus system to incentivize deposits.
  - Provide clear and transparent transaction histories for both players and administrators.
  - Ensure accurate and real-time updates of player and operator balances.

## 3. User Personas & Stories

- **As a Player, I want to:**
  - Easily deposit funds into my account using various payment methods.
  - Receive bonuses, like XP and free spins, when I make a deposit.
  - See the status of my deposits and withdrawals in real-time.
  - Withdraw my winnings quickly and securely.
  - Have a clear understanding of any fees or limits associated with my transactions.

- **As an Operator, I want to:**
  - Have my balance updated accurately and in real-time when a player makes a deposit.
  - Be able to view and manage all player transactions.
  - Have a secure system that protects against fraud and chargebacks.

- **As an Administrator, I want to:**
  - Have a comprehensive back-office interface to manage the entire deposit and withdrawal system.
  - Be able to configure payment methods, transaction limits, and bonus rules.
  - Have access to detailed transaction logs for auditing and reporting purposes.
  - Be able to manually approve or reject transactions when necessary.

## 4. Functional Requirements

### 4.1. Deposit Flow

1.  **Initiation:**
    - The player selects a deposit method (e.g., CashApp, In-store Cash, In-store Card) and enters the desired amount.
    - A new transaction is created in the database with a **`PENDING`** status.
    - The `TransactionsSchema` will be used for this, with relevant fields populated.

2.  **Pending State:**
    - The player is provided with instructions on how to complete the payment (e.g., a CashApp tag, a barcode for in-store payment).
    - The operator's balance is **not** yet credited. The funds are considered to be in a holding state.

3.  **Confirmation (Webhook):**
    - An external service (e.g., a cashier system, a payment provider like CashApp) will send a webhook to our system to confirm the receipt of funds.
    - The webhook will contain a unique transaction identifier to match it with the pending transaction in our database.
    - The system will validate the webhook to ensure it's from a trusted source (e.g., by checking a shared secret, as seen in `cashapp.webhook.ts`).

4.  **Completion:**
    - Upon successful validation of the webhook, the transaction status is updated to **`COMPLETED`**.
    - The player's wallet balance is credited with the deposited amount. This will use the `creditToWallet` function from `wallet.service.ts`.
    - The corresponding operator's balance is also credited.
    - Any applicable deposit bonuses (XP, free spins) are triggered.

### 4.2. Withdrawal Flow

1.  **Initiation:**
    - The player requests a withdrawal, selecting a payout method and specifying the amount.
    - The system checks if the user is eligible for withdrawal using the logic in `wagering.service.ts` to ensure all wagering requirements are met.
    - A new transaction is created with a **`PENDING`** status.

2.  **Processing:**
    - The requested amount is debited from the player's wallet and placed in a 'pending withdrawal' state. This will utilize the `debitFromWallet` function.
    - The transaction is flagged for review in the admin back-office.

3.  **Approval/Rejection:**
    - An administrator reviews the withdrawal request.
    - If **approved**, the transaction status is updated to **`PROCESSING`**, and the funds are sent to the player via the selected payout method. Once the funds are sent, the status is updated to **`COMPLETED`**.
    - If **rejected**, the transaction status is updated to **`REJECTED`**, and the funds are returned to the player's wallet. The reason for the rejection is logged.

### 4.3. Bonus & Incentive System

- **Deposit XP Bonus:**
  - Upon a successful deposit, the system will calculate and award XP to the player.
  - This will integrate with the existing `vip.service.ts`, specifically the `addXpToUser` function.
  - The amount of XP awarded can be a fixed amount or a percentage of the deposit amount, configurable in the admin panel.

- **Free Spins Bonus:**
  - The system will have the ability to award free spins on specific games as a deposit bonus.
  - The number of free spins and the eligible games will be configurable.

- **First-Time Deposit Bonus:**
  - A special, more generous bonus can be configured for a player's first-ever deposit to incentivize new players.

## 5. Non-Functional Requirements

- **Security:**
  - All transactions must be processed over a secure (HTTPS) connection.
  - Sensitive data (like API keys for payment providers) must be encrypted at rest.
  - The system must include measures to prevent common fraud vectors, such as velocity checks and transaction limits.
- **Performance:**
  - The deposit and withdrawal initiation process should be fast and responsive, with a target response time of under 500ms.
  - Webhook processing should be highly efficient to ensure near real-time balance updates.
- **Reliability:**
  - The system should be highly available, with redundancy and failover mechanisms in place.
  - In case of a failure during a transaction, the system must be able to gracefully recover and ensure no funds are lost.

## 6. Technical Requirements & Integration

- **Database:** The system will use the existing database schema, with potential additions to the `transactions`, `users`, and `operators` tables to support the new features. The `drizzle-orm` setup in `src/db/index.ts` will be utilized.
- **API:** A new set of API endpoints will be created to handle deposit and withdrawal requests. These will be built using the existing Hono framework.
- **Webhooks:** A generic webhook handler will be created to process confirmations from various payment providers, expanding on the logic in `cashapp.webhook.ts`.
- **Real-time Notifications:** The system will integrate with the existing `realtime-notifications.service.ts` to send real-time updates to players about the status of their transactions.
- **Transaction Logging:** All deposit and withdrawal transactions will be logged using the `transaction-logging.service.ts`, ensuring a complete audit trail.
