ALTER TABLE `crm_users` ADD COLUMN `slack_user_id` text DEFAULT '' NOT NULL;

CREATE TABLE IF NOT EXISTS `crm_task_notification_log` (
  `id` text PRIMARY KEY NOT NULL,
  `dedupe_key` text NOT NULL UNIQUE,
  `task_id` text NOT NULL,
  `task_title` text NOT NULL,
  `due_date` text NOT NULL,
  `notification_type` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `recipient_name` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('pending','sent','failed')),
  `response_code` integer,
  `error` text DEFAULT '' NOT NULL,
  `sent_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `crm_task_notification_task_idx` ON `crm_task_notification_log` (`task_id`);
