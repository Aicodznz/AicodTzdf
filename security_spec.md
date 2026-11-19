# OILCOM SUPER APP — Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every user-owned document (`users`, `customer_profiles`, `customer_addresses`, `rewards_accounts`, `rewards_transactions`, `vouchers`, `gas_orders`, `payments`, `notifications`, `audit_logs`) must bind its owner field (`uid`, `userId`, `customerId`, `actorId`) strictly to `request.auth.uid` on creation and keep it immutable on update.
2. **No Self-Assigned Privileges**: A user registering in `/users/{userId}` can ONLY create their profile with `role == 'customer'` and `status == 'active'`. Only a verified Admin can promote a user to `'business'`, `'agent'`, or `'admin'`, or suspend an account.
3. **Protected Loyalty Points**: Customers can NEVER update `/rewards_accounts/{userId}` (`pointsBalance`, `lifetimePoints`, `tier`). Only Admins or Approved Agents (after backend QR signature verification) may credit or deduct points. Customers may only submit `'redeem_request'` entries with `status == 'pending'`.
4. **Protected Payment Status**: Customers can create `/payments/{paymentId}` ONLY in `'SANDBOX_TEST'` mode with `status == 'pending'` and `callbackVerified == false`. Customers can NEVER mark a payment `'successful'`, `'failed'`, or `'refunded'`.
5. **Order State Integrity & Terminal Locking**: Customers can create `/gas_orders/{orderId}` ONLY with `status == 'pending'` and `paymentStatus == 'pending'`. Customers can only cancel while `existing().status in ['pending', 'confirmed']`. Once an order reaches `'delivered'` or `'cancelled'`, non-admin updates are strictly blocked.
6. **PII Isolation**: `/users/{userId}` and `/customer_addresses/{addressId}` and `/payments/{paymentId}` restrict `get` and `list` exclusively to the document owner or verified Admin.
7. **Temporal Integrity**: All `createdAt` fields must equal `request.time` on creation and remain immutable on update; all `updatedAt` fields must equal `request.time`.
8. **Size & ID Poisoning Guards**: All document IDs match `^[a-zA-Z0-9_\-]+$` with length `<= 128`, and every string field enforces explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Role Escalation**: Customer attempts `POST /users/{uid}` with `role: 'admin'`. -> **Expected: PERMISSION_DENIED**
2. **Profile Role Mutation**: Existing customer attempts `PATCH /users/{uid}` changing `role` from `'customer'` to `'agent'`. -> **Expected: PERMISSION_DENIED**
3. **Self-Crediting Loyalty Points**: Customer attempts `PATCH /rewards_accounts/{uid}` setting `pointsBalance: 999999`. -> **Expected: PERMISSION_DENIED**
4. **Fake Earned Points Transaction**: Customer attempts `POST /rewards_transactions/{txId}` with `type: 'earn'`, `status: 'completed'`, `points: 5000`. -> **Expected: PERMISSION_DENIED**
5. **Spoofed Payment Confirmation**: Customer attempts `POST /payments/{payId}` with `status: 'successful'`, `callbackVerified: true`. -> **Expected: PERMISSION_DENIED**
6. **Client Payment Status Tampering**: Customer attempts `PATCH /payments/{payId}` changing `status` from `'pending'` to `'successful'`. -> **Expected: PERMISSION_DENIED**
7. **Shadow Field Injection**: User includes unexpected ghost field `isVerified: true` on `/gas_orders/{orderId}`. -> **Expected: PERMISSION_DENIED**
8. **Post-Delivery Order Reversal**: Customer attempts `PATCH /gas_orders/{orderId}` to change `status` from `'delivered'` to `'cancelled'`. -> **Expected: PERMISSION_DENIED**
9. **Business Self-Approval & Credit Limit Fraud**: Owner creates `/businesses/{bizId}` with `approvalStatus: 'approved'` and `creditLimitTzs: 50000000`. -> **Expected: PERMISSION_DENIED**
10. **PII Cross-User Scraping**: Authenticated User A executes `list` or `get` on `/users` or `/customer_addresses` owned by User B. -> **Expected: PERMISSION_DENIED**
11. **Backdated Timestamp Spoofing**: User creates `/gas_orders/{orderId}` with a forged past `createdAt` instead of `request.time`. -> **Expected: PERMISSION_DENIED**
12. **Unverified Email Admin Spoof**: Attacker signs in with `email == 'amytzee@gmail.com'` but `email_verified == false` and attempts admin write on `/system_settings/global`. -> **Expected: PERMISSION_DENIED**
