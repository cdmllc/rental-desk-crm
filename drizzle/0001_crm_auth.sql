CREATE TABLE IF NOT EXISTS `crm_users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE COLLATE NOCASE,
  `display_name` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('admin','agent')),
  `password_salt` text NOT NULL,
  `password_hash` text NOT NULL,
  `must_change_password` integer DEFAULT 1 NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `crm_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `crm_sessions_token_idx` ON `crm_sessions` (`token_hash`);
