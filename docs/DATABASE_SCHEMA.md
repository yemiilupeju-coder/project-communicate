# Database Schema — local (SQLite in OPFS)

**Version:** schema v1 (planned for Phase 1). Phase 0 spikes use their own throwaway tables.

Conventions: IDs are UUIDv7 text; times are UTC ISO-8601 text; booleans are `INTEGER` 0/1;
`PRAGMA foreign_keys = ON`. No diagnosis, birth date, school, address or location fields exist
anywhere.

## Tables

### communicator_profiles

| Column                 | Type               | Notes                                    |
| ---------------------- | ------------------ | ---------------------------------------- |
| id                     | TEXT PK            |                                          |
| display_name           | TEXT NULL          | Pseudonym allowed                        |
| locale                 | TEXT               | e.g. `en-CA`                             |
| home_board_id          | TEXT NULL → boards |                                          |
| vault_id               | TEXT NULL          | Sync vault (ADR 0005); null = not synced |
| is_active              | INTEGER            |                                          |
| created_at, updated_at | TEXT               |                                          |

### boards

| Column                 | Type                         | Notes                                                |
| ---------------------- | ---------------------------- | ---------------------------------------------------- |
| id                     | TEXT PK                      |                                                      |
| profile_id             | TEXT → communicator_profiles | ON DELETE CASCADE                                    |
| title, description     | TEXT                         |                                                      |
| rows, columns          | INTEGER                      | 1–12 each                                            |
| is_home                | INTEGER                      |                                                      |
| sort_order             | INTEGER                      |                                                      |
| parent_board_id        | TEXT NULL → boards           | Builder folders only; navigation is defined by cells |
| created_at, updated_at | TEXT                         |                                                      |

### board_cells

| Column                       | Type                         | Notes                                                          |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------- |
| id                           | TEXT PK                      |                                                                |
| board_id                     | TEXT → boards                | ON DELETE CASCADE                                              |
| row, col                     | INTEGER                      | `UNIQUE(board_id, row, col)` — never reflowed (ADR 0002)       |
| vocabulary_item_id           | TEXT NULL → vocabulary_items | ON DELETE RESTRICT; NULL = empty cell                          |
| action                       | TEXT                         | `speak_add` · `speak_only` · `open_board` · `open_board_speak` |
| target_board_id              | TEXT NULL → boards           | ON DELETE SET NULL (builder flags broken link)                 |
| is_hidden                    | INTEGER                      | Hide without moving                                            |
| background_color, text_color | TEXT NULL                    |                                                                |
| created_at, updated_at       | TEXT                         |                                                                |

### vocabulary_items

| Column                 | Type                              | Notes                                             |
| ---------------------- | --------------------------------- | ------------------------------------------------- |
| id                     | TEXT PK                           |                                                   |
| profile_id             | TEXT NULL → communicator_profiles | NULL = shared starter library                     |
| label                  | TEXT                              | Visible text                                      |
| spoken_text            | TEXT                              | What is said                                      |
| image_asset_id         | TEXT NULL → media_assets          | ON DELETE RESTRICT                                |
| locale, category       | TEXT                              |                                                   |
| source                 | TEXT                              | `starter` · `custom` · `ai_approved` · `imported` |
| created_at, updated_at | TEXT                              |                                                   |

### media_assets

| Column        | Type                 | Notes                                                            |
| ------------- | -------------------- | ---------------------------------------------------------------- |
| id            | TEXT PK              |                                                                  |
| kind          | TEXT                 | `image` · `audio`                                                |
| opfs_path     | TEXT                 | Relative path in OPFS; files are never stored as blobs in the DB |
| sha256        | TEXT                 | Dedupe + integrity                                               |
| mime_type     | TEXT                 |                                                                  |
| width, height | INTEGER NULL         | Images                                                           |
| duration_ms   | INTEGER NULL         | Audio                                                            |
| byte_size     | INTEGER              |                                                                  |
| source        | TEXT                 | `starter` · `photo` · `recorded` · `rendered` · `imported`       |
| is_personal   | INTEGER              | Photos of people, family recordings                              |
| license_id    | TEXT NULL → licenses |                                                                  |
| created_at    | TEXT                 |                                                                  |

### vocabulary_audio

Links a vocabulary item to the clip that speaks it for a given voice.

| Column             | Type                            | Notes                                                             |
| ------------------ | ------------------------------- | ----------------------------------------------------------------- |
| vocabulary_item_id | TEXT → vocabulary_items         | ON DELETE CASCADE                                                 |
| voice_key          | TEXT                            | `kokoro:af_heart`, `piper:en_US-hfc_female-medium`, or `recorded` |
| audio_asset_id     | TEXT → media_assets             |                                                                   |
| text_sha256        | TEXT                            | Hash of `spoken_text` when rendered; mismatch = stale, re-render  |
| rendered_at        | TEXT                            |                                                                   |
| PK                 | (vocabulary_item_id, voice_key) |                                                                   |

### licenses

`id`, `name`, `spdx_or_text`, `attribution`, `url`.

### voice_preferences

| Column           | Type                            | Notes                                          |
| ---------------- | ------------------------------- | ---------------------------------------------- |
| profile_id       | TEXT PK → communicator_profiles |                                                |
| voice_key        | TEXT                            | Clip voice                                     |
| prefer_recorded  | INTEGER                         | Recorded clip wins when present                |
| system_voice_uri | TEXT NULL                       | Fallback; validated on load                    |
| rate, volume     | REAL                            | 0–1 normalised (applies to live/system speech) |

### display_preferences

As native review section 5: `show_labels`, `show_images`, `label_position`, `high_contrast`,
`reduce_motion`, `sentence_bar_visible`, `speak_on_select`, `activation`, `hold_ms`,
`repeat_guard_ms`, feedback flags.

### configuration_metadata / configuration_snapshots

As native review: version increments on every saved edit session; snapshots (`manual`, `save`,
`before_import`, `before_ai`, `before_migration`, `before_sync_merge`) stored as `.obz` files in
OPFS; last 20 kept.

### op_log (sync)

| Column     | Type        | Notes                                                    |
| ---------- | ----------- | -------------------------------------------------------- |
| seq        | INTEGER PK  | Local order                                              |
| op_id      | TEXT UNIQUE | UUIDv7                                                   |
| entity     | TEXT        | Table name                                               |
| entity_id  | TEXT        |                                                          |
| field      | TEXT        | Column, or `*` for create/delete                         |
| value_json | TEXT        | New value (encrypted only when sent)                     |
| hlc        | TEXT        | Hybrid logical clock; LWW per (entity, entity_id, field) |
| device_id  | TEXT        |                                                          |
| pushed_at  | TEXT NULL   | NULL = not yet uploaded                                  |

### sync_state, devices

`sync_state`: `vault_id`, `last_pulled_server_seq`, `last_success_at`, `last_error`.
`devices`: `id`, `label` (adult-chosen, e.g. "Home iPad"), `paired_at`, `revoked_at`.

### device_settings (key/value)

Admin PIN hash (PBKDF2-SHA256, 600k iterations, per-device salt), lock-out counters, AI enabled
flag, pilot key reference. Never synced, never exported.

### communication_history

Off by default; never exported, synced or sent to AI; capped at 500 rows.

## Relationships and delete rules

Same as the native review section 5, plus: `vocabulary_audio` cascades with its vocabulary item;
unreferenced media files are removed by a clean-up pass after commit; deleting a profile also
deletes its vault membership on this device (not the cloud vault, which needs an explicit adult
action).
