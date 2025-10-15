# Phase 19 — On-Site to Cloud Synchronization

Each task is small, testable, and focused on one concern.

---

## A. Database Models & Schema

### Task 190: SyncLog model
**Do:** Add `SyncLog` model to `prisma/schema.prisma` with fields: id, syncType, lastSyncAt, status, recordsSynced, errorMessage, createdAt  
**Done when:** Model compiles; `prisma format` succeeds.

### Task 191: ConflictLog model
**Do:** Add `ConflictLog` model with fields: id, tableName, recordId, conflictType, mainVersion (Json), cloudVersion (Json), resolvedBy, resolvedAt, createdAt  
**Done when:** Model compiles; indexes on tableName and recordId added.

### Task 192: SyncState model
**Do:** Add `SyncState` model with fields: id (singleton), instanceRole ('MAIN'|'CLOUD'), lastHeartbeat, replicationLagMs, storageQueueSize, isConnected  
**Done when:** Model compiles with unique constraint ensuring only one row.

### Task 193: Generate migration for sync models
**Do:** Run `prisma migrate dev --name add-sync-models`  
**Done when:** Migration file created; tables exist in database.

### Task 194: Seed SyncState singleton
**Do:** Update `prisma/seed.ts` to insert one SyncState row with instanceRole from ENV var  
**Done when:** Running seed creates/updates SyncState with correct role.

---

## B. Environment & Configuration

### Task 195: Add sync environment variables
**Do:** Add to `.env.example`: INSTANCE_ROLE, REMOTE_DB_URL, REMOTE_STORAGE_URL, SYNC_ENABLED, SYNC_INTERVAL_MINUTES  
**Done when:** All vars documented with example values.

### Task 196: Add sync config to constants
**Do:** Create `src/lib/sync/config.ts` exporting SYNC_INTERVAL, MAX_CONCURRENT_TRANSFERS, REPLICATION_SLOT_NAME  
**Done when:** File exports typed config object.

### Task 197: Sync role validation
**Do:** Add startup check in `src/lib/sync/validate.ts` that errors if INSTANCE_ROLE not 'MAIN' or 'CLOUD'  
**Done when:** Function throws on invalid role; logs warning if SYNC_ENABLED=false.

---

## C. PostgreSQL Replication Setup Scripts

### Task 198: Create replication user script
**Do:** Create `scripts/setup-replication-user.sql` to create replication user with minimal grants  
**Done when:** SQL script runs without errors; user has REPLICATION privilege.

### Task 199: Create publication script (main)
**Do:** Create `scripts/create-main-publication.sql` that creates publication for all syncable tables  
**Done when:** Script excludes DeviceFileIndex, DeviceCommandQueue; includes User, JumpLog, etc.

### Task 200: Create subscription script (cloud)
**Do:** Create `scripts/create-cloud-subscription.sql` that subscribes to main publication  
**Done when:** Script includes CONNECTION string template with placeholders.

### Task 201: Create publication script (cloud)
**Do:** Create `scripts/create-cloud-publication.sql` for bidirectional sync  
**Done when:** Same table list as main publication.

### Task 202: Create subscription script (main)
**Do:** Create `scripts/create-main-subscription.sql` subscribing to cloud  
**Done when:** Includes conflict resolution config comments.

### Task 203: Setup script wrapper
**Do:** Create `scripts/setup-replication.sh` that runs appropriate scripts based on INSTANCE_ROLE  
**Done when:** Script checks role, runs publication + subscription setup, verifies replication slot created.

### Task 204: Test replication setup locally
**Do:** Run two local Postgres instances, execute setup scripts, verify replication works  
**Done when:** Insert on instance A appears on instance B within 5 seconds.

---

## D. Replication Monitoring Service

### Task 205: Replication status check utility
**Do:** Create `src/lib/sync/replication-status.ts` with function to query `pg_stat_replication` view  
**Done when:** Function returns lag_bytes, state, sync_state for subscription.

### Task 206: Update SyncState with replication lag
**Do:** Add function to calculate lag in milliseconds from replication stats  
**Done when:** Function returns null if replication down, number if active.

### Task 207: Replication monitor service skeleton
**Do:** Create `src/workers/replication-monitor.ts` with 30s loop checking replication health  
**Done when:** Worker logs "Replication monitor started" and loop runs.

### Task 208: Log replication lag to SyncState
**Do:** In monitor loop, query replication status and update SyncState.replicationLagMs  
**Done when:** Database shows updated lag value every 30s.

### Task 209: Detect replication slot dropped
**Do:** Add check for slot existence; if missing, log critical error to SyncLog  
**Done when:** Simulating dropped slot creates SyncLog entry with status=FAILED.

### Task 210: Connection state tracking
**Do:** Update SyncState.isConnected based on replication connection state  
**Done when:** isConnected=false when remote unreachable, true when connected.

---

## E. Conflict Detection System

### Task 211: Conflict detection query utility
**Do:** Create `src/lib/sync/detect-conflicts.ts` with function to find rows with same PK but different updatedAt on both instances  
**Done when:** Function queries both DBs, returns array of conflict records.

### Task 212: Conflict comparator
**Do:** Add function to compare two record versions (JSON) and identify changed fields  
**Done when:** Function returns diff object with changed field names + values.

### Task 213: Conflict logger
**Do:** Create function to insert ConflictLog entry with mainVersion, cloudVersion, conflictType  
**Done when:** Function creates log entry; returns conflict ID.

### Task 214: Conflict scanner service skeleton
**Do:** Create `src/workers/conflict-scanner.ts` running every 5 minutes  
**Done when:** Worker logs "Scanning for conflicts" each cycle.

### Task 215: Scan User table for conflicts
**Do:** In scanner, run conflict detection on User table  
**Done when:** Detected conflicts logged to ConflictLog.

### Task 216: Scan JumpLog table for conflicts
**Do:** Add JumpLog conflict detection (check notes, visibleToConnections fields)  
**Done when:** JumpLog conflicts detected and logged.

### Task 217: Scan remaining tables
**Do:** Add conflict detection for Group, GroupMember, FormationSkydive, FormationParticipant  
**Done when:** All syncable tables scanned each cycle.

---

## F. Automatic Conflict Resolution

### Task 218: Last-write-wins resolver
**Do:** Create `src/lib/sync/resolvers/last-write-wins.ts` comparing updatedAt timestamps  
**Done when:** Function returns 'MAIN_WINS' or 'CLOUD_WINS' based on timestamp.

### Task 219: Main-authoritative resolver
**Do:** Create `src/lib/sync/resolvers/main-authoritative.ts` always returning 'MAIN_WINS'  
**Done when:** Function returns 'MAIN_WINS' unconditionally.

### Task 220: Apply resolution to User conflicts
**Do:** In conflict scanner, resolve User conflicts with last-write-wins strategy  
**Done when:** Conflict detected → resolved → winning version written to both DBs.

### Task 221: Apply resolution to JumpLog conflicts
**Do:** Resolve JumpLog conflicts with last-write-wins  
**Done when:** JumpLog conflict resolution updates both instances.

### Task 222: Apply resolution to Device conflicts
**Do:** Resolve Device conflicts with main-authoritative strategy  
**Done when:** Main Device record always wins; cloud updated.

### Task 223: Mark conflicts as resolved
**Do:** After applying resolution, update ConflictLog with resolvedBy and resolvedAt  
**Done when:** Resolved conflicts show resolution method and timestamp.

### Task 224: Skip already-resolved conflicts
**Do:** Modify scanner to ignore conflicts where resolvedAt IS NOT NULL  
**Done when:** Scanner only processes new conflicts.

---

## G. Storage Sync Worker Foundation

### Task 225: Storage inventory utility
**Do:** Create `src/lib/sync/storage-inventory.ts` with function to list all JumpLog records with storageUrl  
**Done when:** Function returns array of {id, hash, storageUrl, fileSize}.

### Task 226: Local file existence check
**Do:** Add function to check if file with given hash exists in local Supabase Storage  
**Done when:** Function queries storage bucket, returns boolean.

### Task 227: Missing files detector
**Do:** Create function to compare inventory lists and return files missing locally  
**Done when:** Function returns array of file records to sync.

### Task 228: Storage sync queue model (optional)
**Do:** Consider if StorageSyncQueue table needed, or use SyncLog with JSON payload  
**Done when:** Decision documented; if table needed, add to schema.

### Task 229: Storage sync worker skeleton
**Do:** Create `src/workers/storage-sync.ts` with 5-minute loop  
**Done when:** Worker logs "Storage sync started" and runs empty loop.

### Task 230: Identify pending files
**Do:** In sync worker loop, call missing files detector and log count  
**Done when:** Worker logs "Found N files to sync" each cycle.

---

## H. Storage File Transfer

### Task 231: Download from remote storage
**Do:** Create `src/lib/sync/storage-transfer.ts` with function to download file from remote Supabase Storage by URL  
**Done when:** Function returns Buffer of file contents.

### Task 232: Upload to local storage
**Do:** Add function to upload Buffer to local Supabase Storage with original path  
**Done when:** Function uploads file, returns new storageUrl.

### Task 233: Verify file hash after transfer
**Do:** After upload, compute SHA-256 of uploaded file and compare with expected hash  
**Done when:** Function throws error if hash mismatch.

### Task 234: Transfer single file
**Do:** Combine download + upload + verify into single transfer function  
**Done when:** Function successfully transfers one file end-to-end.

### Task 235: Batch transfer with concurrency limit
**Do:** Add function to transfer multiple files with max 3 concurrent transfers  
**Done when:** Function respects concurrency limit; uses Promise.all with semaphore.

### Task 236: Transfer with retry logic
**Do:** Wrap transfer in retry logic (3 attempts with exponential backoff)  
**Done when:** Failed transfers retry; succeed after transient network error.

### Task 237: Log transfer to SyncLog
**Do:** After each transfer, create SyncLog entry with syncType='STORAGE_TO_CLOUD' or 'STORAGE_TO_MAIN', recordsSynced=1  
**Done when:** SyncLog records each file transfer with status.

### Task 238: Update storageUrl after transfer
**Do:** After successful transfer, update JumpLog.storageUrl to point to local instance  
**Done when:** Transferred files have correct local URLs.

### Task 239: Integrate transfer into worker loop
**Do:** In storage-sync worker, call batch transfer for pending files  
**Done when:** Worker automatically transfers missing files each cycle.

---

## I. Bandwidth and Queue Management

### Task 240: Add rate limiting to transfers
**Do:** Implement token bucket rate limiter in storage-transfer (configurable KB/s)  
**Done when:** Transfers throttled to MAX_TRANSFER_RATE from config.

### Task 241: Prioritize recent files
**Do:** Sort pending files by JumpLog.createdAt DESC before transferring  
**Done when:** Newest jumps transfer first.

### Task 242: Update SyncState with queue size
**Do:** After scanning pending files, update SyncState.storageQueueSize  
**Done when:** Dashboard can read current queue size from SyncState.

### Task 243: Pause/resume sync API endpoint
**Do:** Create `src/pages/api/admin/sync/pause.ts` and `resume.ts` setting SYNC_ENABLED flag  
**Done when:** Endpoints toggle sync; worker respects flag and pauses.

### Task 244: Manual trigger sync API
**Do:** Create `src/pages/api/admin/sync/trigger.ts` to immediately run sync cycle  
**Done when:** Calling endpoint triggers storage sync worker outside normal interval.

---

## J. Network Failure Handling

### Task 245: Connection state machine
**Do:** Create `src/lib/sync/connection-state.ts` with states: CONNECTED, DEGRADED, DISCONNECTED, RECONNECTING  
**Done when:** State machine exports current state and transition functions.

### Task 246: Detect connection failure
**Do:** In replication monitor, catch connection errors and transition to DISCONNECTED  
**Done when:** Network failure sets state to DISCONNECTED; logs error.

### Task 247: Exponential backoff retry
**Do:** Add reconnection logic with backoff: 30s, 1m, 2m, 5m, 10m, max 1h  
**Done when:** DISCONNECTED state triggers retries with increasing delays.

### Task 248: Update SyncState on disconnection
**Do:** Set SyncState.isConnected=false when DISCONNECTED  
**Done when:** Dashboard reflects disconnected state.

### Task 249: Queue changes during disconnection
**Do:** Ensure storage sync worker doesn't attempt transfers when DISCONNECTED; accumulates queue  
**Done when:** Worker skips transfer attempts when disconnected; queue grows.

### Task 250: Resume sync after reconnection
**Do:** When connection restored (RECONNECTING → CONNECTED), trigger immediate sync cycle  
**Done when:** Reconnection resumes storage transfers and replication catch-up.

### Task 251: Replication slot retention check
**Do:** On reconnection, verify replication slot still exists; log critical if dropped  
**Done when:** Dropped slot detection creates alert-level SyncLog entry.

### Task 252: Disk space monitoring
**Do:** Add function to check available disk space; warn if < 20% free and queue > 100 files  
**Done when:** Low disk space logged to SyncLog with status=WARNING.

---

## K. Sync Dashboard UI

### Task 253: Sync status API endpoint
**Do:** Create `src/pages/api/admin/sync/status.ts` returning SyncState + recent SyncLog entries  
**Done when:** Endpoint returns JSON with replicationLagMs, isConnected, storageQueueSize, lastSync.

### Task 254: Sync dashboard page skeleton
**Do:** Create `src/pages/admin/sync.tsx` with AuthGuard requiring ADMIN role  
**Done when:** Page loads; shows "Sync Dashboard" heading.

### Task 255: Connection status indicator
**Do:** Display SyncState.isConnected as green/red dot with "Connected"/"Disconnected" label  
**Done when:** Status updates every 5s via polling.

### Task 256: Replication lag display
**Do:** Show SyncState.replicationLagMs as "Database Sync Lag: X ms" or "X seconds" if large  
**Done when:** Lag value updates in real-time.

### Task 257: Storage queue size display
**Do:** Show "Files Pending Sync: N" from SyncState.storageQueueSize  
**Done when:** Queue size displays and updates.

### Task 258: Last successful sync timestamp
**Do:** Query most recent SyncLog with status=SUCCESS, display as "Last Sync: X minutes ago"  
**Done when:** Timestamp displays in human-readable format.

### Task 259: Recent sync log table
**Do:** Display last 20 SyncLog entries in table with columns: timestamp, syncType, status, recordsSynced  
**Done when:** Table shows historical sync operations.

### Task 260: Error message display
**Do:** For FAILED sync log entries, show errorMessage in expandable row  
**Done when:** Clicking failed entry reveals error details.

---

## L. Conflict Resolution UI

### Task 261: Conflicts API endpoint
**Do:** Create `src/pages/api/admin/sync/conflicts.ts` returning unresolved ConflictLog entries  
**Done when:** Endpoint returns conflicts where resolvedAt IS NULL.

### Task 262: Conflicts count badge
**Do:** On sync dashboard, show "Conflicts: N" badge (red if N > 0)  
**Done when:** Badge displays unresolved conflict count.

### Task 263: Conflicts table
**Do:** Display conflicts in table: tableName, recordId, conflictType, createdAt  
**Done when:** Table shows all pending conflicts.

### Task 264: View conflict detail modal
**Do:** Clicking conflict row opens modal showing mainVersion vs cloudVersion side-by-side  
**Done when:** Modal displays both JSON versions formatted.

### Task 265: Manual resolution buttons
**Do:** In conflict detail modal, add "Use Main" and "Use Cloud" buttons  
**Done when:** Buttons present; not yet functional.

### Task 266: Resolve conflict API endpoint
**Do:** Create `src/pages/api/admin/sync/conflicts/[id]/resolve.ts` accepting choice ('MAIN'|'CLOUD')  
**Done when:** Endpoint updates ConflictLog with resolvedBy='MANUAL', resolvedAt=now.

### Task 267: Apply manual resolution
**Do:** In resolve endpoint, apply chosen version to both databases  
**Done when:** Selected version propagates to both instances.

### Task 268: Wire up resolution buttons
**Do:** Connect modal buttons to resolve API endpoint  
**Done when:** Clicking "Use Main" resolves conflict; modal closes; table updates.

### Task 269: Resolved conflicts view
**Do:** Add tab/filter to show resolved conflicts for audit  
**Done when:** Can view historical conflicts with resolution method.

---

## M. Monitoring and Alerts

### Task 270: Sync health check endpoint
**Do:** Create `src/pages/api/health/sync.ts` returning 200 if isConnected=true, replicationLagMs < 60000  
**Done when:** Endpoint returns 503 if sync unhealthy.

### Task 271: Alert on replication lag
**Do:** In replication monitor, check if replicationLagMs > 3600000 (1 hour); create SyncLog entry with status=WARNING  
**Done when:** Excessive lag creates warning log.

### Task 272: Alert on storage queue size
**Do:** In storage sync worker, if storageQueueSize > 500, create warning SyncLog  
**Done when:** Large queue triggers warning.

### Task 273: Alert on disconnection duration
**Do:** Track how long isConnected=false; if > 24 hours, create critical SyncLog  
**Done when:** Extended disconnection logged as critical.

### Task 274: Dashboard alerts section
**Do:** On sync dashboard, add "Active Alerts" section showing recent WARNING/FAILED logs  
**Done when:** Alerts display prominently at top of dashboard.

### Task 275: Email alert integration (optional)
**Do:** Consider email notification for critical sync failures; document if needed  
**Done when:** Decision documented; implementation plan if yes.

---

## N. Data Integrity Validation

### Task 276: Row count comparison utility
**Do:** Create `src/lib/sync/integrity-check.ts` with function to compare table row counts between instances  
**Done when:** Function returns {tableName, mainCount, cloudCount, delta} for each table.

### Task 277: Run row count check
**Do:** Add manual trigger endpoint `src/pages/api/admin/sync/integrity-check.ts` running row count comparison  
**Done when:** Endpoint returns comparison results.

### Task 278: Display integrity check results
**Do:** Add "Run Integrity Check" button on sync dashboard; display results in table  
**Done when:** Button triggers check; results show any discrepancies.

### Task 279: Checksum validation (advanced)
**Do:** For critical tables, compute checksum of all rows (hash of sorted PKs + updatedAt); compare  
**Done when:** Function returns checksum mismatch if data differs.

### Task 280: Log integrity issues
**Do:** If row count or checksum mismatch detected, create SyncLog entry with status=FAILED, errorMessage with details  
**Done when:** Integrity failures logged for investigation.

---

## O. Testing Infrastructure

### Task 281: Setup test databases
**Do:** Create `scripts/setup-test-sync.sh` spinning up two Postgres containers for sync testing  
**Done when:** Script creates main_db and cloud_db containers; both accessible.

### Task 282: Seed test data in both databases
**Do:** Create seed script that populates both test DBs with sample users, devices, jumps  
**Done when:** Both DBs have matching initial data.

### Task 283: Test replication setup scripts
**Do:** Run replication setup scripts against test databases  
**Done when:** Replication active between test main → test cloud.

### Task 284: Test basic replication
**Do:** Insert user on main_db; verify appears on cloud_db within 10s  
**Done when:** Test passes; replication confirmed working.

### Task 285: Test conflict detection
**Do:** Update same user on both DBs with different values; run conflict scanner  
**Done when:** Conflict detected and logged to ConflictLog.

### Task 286: Test automatic conflict resolution
**Do:** Verify conflict resolver picks correct version based on updatedAt  
**Done when:** Resolved version matches expected (newer timestamp wins).

### Task 287: Test storage sync
**Do:** Add JumpLog with storageUrl on main; run storage worker; verify file copied to cloud  
**Done when:** File exists in cloud storage with correct hash.

### Task 288: Test network failure simulation
**Do:** Stop cloud_db container; verify main detects disconnection and enters DISCONNECTED state  
**Done when:** Connection state transitions correctly; logs disconnection.

### Task 289: Test reconnection
**Do:** Restart cloud_db; verify replication resumes; storage sync catches up  
**Done when:** After reconnection, queued changes propagate.

### Task 290: Test replication slot dropped
**Do:** Manually drop replication slot on cloud; verify main detects and logs critical error  
**Done when:** Dropped slot creates alert; documented recovery procedure.

---

## P. Production Deployment

### Task 291: Cloud instance provisioning guide
**Do:** Document how to set up cloud instance (VPS specs, Docker setup, Supabase installation)  
**Done when:** Guide covers all prerequisites for cloud deployment.

### Task 292: SSL/TLS certificate setup
**Do:** Document obtaining Let's Encrypt cert for cloud instance; configuring Postgres + Supabase for TLS  
**Done when:** TLS configuration guide complete; tested.

### Task 293: Firewall configuration guide
**Do:** Document firewall rules: open 5432 (Postgres) and 8000 (Supabase Kong) only to main instance IP  
**Done when:** Security hardening guide complete.

### Task 294: Backup and restore procedures
**Do:** Document how to backup main instance data; restore to cloud if needed  
**Done when:** Step-by-step backup/restore tested and documented.

### Task 295: Runbook for replication slot dropped
**Do:** Write procedure to detect, fix replication slot dropped (reinitialize with copy_data)  
**Done when:** Runbook tested with simulated failure.

### Task 296: Runbook for storage queue overflow
**Do:** Write procedure if storage queue exceeds disk space (prioritize, skip old files, etc.)  
**Done when:** Overflow handling documented.

### Task 297: Monitoring integration
**Do:** Document integration with external monitoring (Prometheus, Grafana, or simple uptime checks)  
**Done when:** Metrics export endpoints documented if needed.

### Task 298: Performance tuning guide
**Do:** Document PostgreSQL replication tuning (wal_level, max_wal_senders, etc.)  
**Done when:** Tuning recommendations documented.

### Task 299: Load testing sync system
**Do:** Simulate 1000 jumps queued for sync; measure time to complete, resource usage  
**Done when:** Load test passes; no OOM or network saturation.

### Task 300: Production cutover checklist
**Do:** Create checklist for enabling sync on production system  
**Done when:** Checklist covers all setup steps, verification, rollback plan.

---
